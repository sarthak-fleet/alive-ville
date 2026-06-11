# web3d — 3D Browser Client Architecture

Last updated: 2026-06-10 (Milestones 1–4 + beauty/feel pass complete)

The `web3d/` app is the first-principles 3D rebuild of the game client: import a
world, auto-generate its 3D town from the schema, and walk/talk/fight inside it.
It replaces neither the simulation core nor the server — it is a new renderer on
top of the same `World` types and `/api/*` endpoints.

## Stack and why

- **Three.js + react-three-fiber + drei** — largest web-3D ecosystem, React-native
  HUD, scenes built from data (no editor needed). Babylon.js was the runner-up
  (built-in physics/navmesh) but loses on flexibility for schema-generated worlds.
- **@react-three/rapier** — physics: kinematic character controller, building
  colliders, future combat hitboxes (sensor colliders).
- **zustand** — same store pattern as `web/`.
- NPC navigation uses a **street waypoint graph** (courtyards → gates → street
  polylines, Dijkstra) instead of a recast navmesh — the approved fallback; the
  belt layout keeps paths clear, and it is deterministic with zero WASM risk.

Run it: `pnpm dev:server` (sim server :5174) + `pnpm dev:3d` (Vite :5175).
Build: `pnpm build:3d`. Tests: `tests/web3d-worldgen.test.ts`.

## Module map (`web3d/src/`)

| Module | Purpose |
| --- | --- |
| `api/client.ts` | `fetchState` / `postTick` subset of `web/src/api/client.ts` |
| `store/world.ts` | sim mirror: world state, send(action) → tick, event toasts |
| `store/ui.ts` | dialogue session, interaction prompt target |
| `mapping/` | pure schema→visual fns copied from the parked diorama renderer (`web/src/three/world-scene.ts`): palettes, body shapes, item visuals, time-of-day mood |
| `worldgen/` | deterministic 2D-schema → 3D-town generator (pure, unit-tested) |
| `scene/` | R3F components: toon materials, lighting/sky/fog, district renderer |
| `characters/` | procedural toon character + NPC wander/face-player behavior |
| `controls/` | input, third-person rapier controller, follow camera, interaction scan |
| `hud/` | React DOM overlay: top bar, objective, toasts, prompt, dialogue panel |

## Worldgen: 2D schema → 3D town

Locations are 2D rects (`x/y/w/h`); the generator maps them to walkable districts
at **0.25 schema-units per meter**, fully deterministic via `mulberry32(hash(worldId:locationId:…))`
— same world JSON always yields the identical town (tested).

Per district (`worldgen/district.ts`):

1. Plot = location rect on a shared ground plane; 3 m sidewalk inset.
2. Perimeter **building belt**: each edge subdivides into 5.5–9.5 m lots; gate
   gaps at edge midpoints (where streets attach); building floors/density styled
   by `visual.role`/`visualTags` keyword profiles (plaza → 2–6 floors, garden → 1–3, …).
3. Open **courtyard** in the center — the gameplay area. Props (lamps, benches,
   stalls, training dummies…) scatter by role profile; items and interactables
   place via the stable hash offset so they match the diorama/2D clients.
4. NPC spawns ring the courtyard; player spawns at its south edge.

City level (`worldgen/streets.ts`, `worldgen/navgraph.ts`):

- One **street** per unique exit pair: gates at facing plot-edge midpoints,
  routed with a coarse-grid A* that treats every plot rect as blocked — so
  imported worlds with plots between exit pairs still get sensible roads
  (tested: no street point inside a foreign plot).
- Gate arches render at plot boundaries; a shared ground plane + outer wall
  colliders replace per-district walls, so the player walks freely along streets.
- The **nav graph** (courtyard ↔ gates ↔ street polylines) drives NPC
  cross-district travel; `findDistrictPath` returns world-space waypoints.
- Static geometry caches by map content (`scene/GameWorld.tsx` modelCache);
  per-tick changes (items, NPC locations) recompute via `worldgen/placements.ts`.

## Interiors (`worldgen/interiors.ts`, `scene/Interior.tsx`)

EVERY building is enterable: each gets a doorframe + lantern on its
courtyard-facing face and a generated name (role-flavored: Tavern Rooms,
Workshop, Cottage…). Interiors generate **on demand** per building
(deterministic, LRU-cached, only the active room is ever mounted), sized to the
building footprint, furnished by district role, dollhouse-style (low walls, no
ceiling). Entering is a one-shot teleport to a staging area south of the city —
no scene swap, no physics churn. Cutscenes are suppressed inside; interior
state (`interiorBuildingId`) resets on world replace.

## LLM dialogue with real agency (`src/dialogue.ts`, `POST /api/dialogue`)

With `LLM_BASE_URL` set (any OpenAI-compatible endpoint) or `LLM_CLI=claude|codex`,
conversations become free-flowing and in-character — backend options and all
knobs live in [local-llm.md](./local-llm.md):

- The endpoint builds a persona prompt from the NPC's traits, speech style,
  mood, goals, secrets, relevant memories (RAG via `retrieveMemories`), nearby
  characters, and quests — grounded in the imported world's story, never a
  hardcoded setting.
- Replies do **not** consume a sim tick (the clock doesn't jump 2h per line);
  both turns are written into `npc.memories`, so the agent loop and later
  conversations stay consistent with what was said.
- **Conversations have consequences**: the model returns {reply, action,
  disposition}. Actions are engine-validated then applied for real — move,
  give, offer_quest/complete_quest, fight, follow/unfollow (companion mode),
  and create_quest (the NPC invents a new task; capped, deduped, instantly
  active). Applied actions broadcast a synthetic tick over SSE.
- **Relationships develop**: disposition (-2..2) shifts the relationship graph
  and trust/affection axes; the dialogue header shows a live label. Per-NPC
  conversation history persists server-side and reloads on reopen. Quest-tier
  NPCs use the quest-tier model.
- **Anti-loop**: the engine rejects duplicate remember actions; the prompt
  pushes circling conversations toward a decision. Transient model failures
  retry once server-side; the client shows a soft "lost in thought" line
  instead of a canned fallback.
- Without credentials the endpoint answers `{llm:false}` and the client falls
  back to the scripted tick-talk path; the client remembers the answer to skip
  the extra round-trip. The agent loop's LLM proposer/director activate from
  the same env switch (that plumbing predates web3d).
- Tested: unit tests with an injected completer (`tests/dialogue.test.ts`) and
  a browser E2E against a local fake OpenAI-compatible server.

## Arcs & progression (`src/arcs.ts`)

Every world gets a three-stage journey: **Training** (win a spar against an
auto-picked mentor) → **Trial** (complete 2 quests) → **Confrontation** (defeat
the villain-plan actor) → Complete. Stage progress derives from world state
(`evaluateArc` is re-checked after every tick/dialogue/spar), so saves stay
consistent; advances award XP and broadcast director-style beats (toast +
letterbox cutscene). XP also flows from quest completions and won fights;
levels follow a square-root curve and scale player HP (+15/level) and damage
(+15 %/level). Sparring is dialogue-driven (`{"type":"spar"}`): non-lethal,
HP floors at 25 %/20 %, winner XP, loser walks away. Picking a character that
IS the mentor/villain reassigns the arc roles.

The start flow (`hud/StartFlow.tsx`) fronts everything: world cards from
`GET /api/worlds` (bundled worlds + ingest sources) → `POST /api/worlds/select`
→ character cards (the Wanderer, or embody any NPC via `choose_character`).

Fight feel: hitstop scales frame deltas globally (`runtime.ts scaledDelta` —
70 ms freeze on hits, 200 ms @0.3× slow-mo on kills), struck NPCs flash red and
flinch, knockback nudges on every landed punch, layered with shake and synth
impacts.

## Sim ↔ client sync

- Server stays authoritative and tick-based; client runs 60 fps locally.
- Player actions (talk/pickup/inspect/move, later fight) POST to the existing
  `/api/tick`; the response `{state, summary}` updates the store. Tick summary
  actions become HUD toasts; NPC `talk` actions targeting the player become
  dialogue replies. Walking into another district sends a debounced `move`.
- `GET /api/events` (SSE, `src/server.ts`) broadcasts agent-loop tick summaries
  (via the `onTick` option on `createAgentLoop`) plus a `world` event on
  import/reset/restore; the client refetches state on each event.
- When the sim relocates an NPC, the client walks it along the nav graph at
  3.4 m/s (sim location flips instantly; visuals catch up). NPC/player scene
  positions are imperative — the React `position` prop holds only the initial
  spawn, otherwise prop updates would teleport actors.

## Combat (`combat/`)

Real-time and fully client-resolved; the tick sim stays authoritative for story
state. Components:

- **Player FSM** (`combat/player-fsm.ts`, driven from `PlayerController`):
  `free → attack1→2→3` (combo via input buffering) | `dodge` (full i-frames,
  9 m/s roll) | `hitstun` | `dead` (3.2 s → respawn at the active courtyard).
  Inputs: F or quick click = attack, Space = dodge, Q = lock-on toggle.
- **Hit detection**: cone checks (2.3 m, ±~70°) against the live NPC position
  registry at the attack's active frame — NOT rapier sensors, since NPC actors
  are visual-only (no rigid bodies). Documented deviation from the original plan.
- **Enemy AI** (in `characters/Npc.tsx`): hostile NPCs run
  `approach → telegraph (0.42 s, red ring VFX) → strike → recover`, retreating
  below 25 % HP. Hostility triggers when the player hits an NPC or when a sim
  tick contains a `fight` action involving it.
- **HP**: client mirrors seeded from sim `CombatState` (defaults 120 player /
  100 NPC) on first engagement; sim combat fields are treated as write-only
  during a fight.
- **Sim reconciliation**: on a client kill, `combat/store.ts` sends
  finisher-style `fight` actions through `/api/tick` (bounded retries) until the
  sim marks the target `defeated` — one tick usually suffices since finishers
  deal 100–120 damage.
- **VFX** (`combat/Vfx.tsx`): additive spark bursts, floating damage numbers,
  telegraph rings — all from a store-driven event queue.
- Combat follow-ups (post-M4): posture/stagger, ranged movesets, sim-driven duels.

## Director events (`director/`)

Story beats render cinematically without scripting individual scenes:

- **Detection** (`director/store.ts`): every tick summary is scanned —
  `fromDirector` actions and villain-plan stage advances start a cutscene
  (villain beats win; 25 s cooldown; never stacks). Gotcha: the cooldown
  baseline is `-Infinity`, since `performance.now()` starts near 0 on page load
  and a 0 default would swallow all beats in the first window.
- **Cinematic**: `PlayerController` hands the camera to a slow push-in orbit on
  the beat's actor (live position), freezes the player, and pauses hostile AI;
  control returns after 4.2 s or on Esc/Enter. Letterbox bars + beat caption
  render in the DOM HUD (`hud/Letterbox.tsx`).
- **Tension mood** (`mapping/mood.ts`): `worldPressure` = max of director
  pressure, tensions, villain plans. Above 40, the time-of-day mood lerps
  toward an ominous red-violet cast (denser fog, dimmer redder sun) — the whole
  city visibly darkens as the story escalates. Unit-tested monotonic.
- Note: the sim's director only acts on *quiet* ticks (`actions.length === 0`
  in `src/simulation.ts`), so beats are rare while NPCs are busy — by design.

## Characters

Procedural chibi-toon rig built from primitives (`characters/CharacterModel.tsx`):

- **Variation from schema**: `appearance.palette` → outfit/skin/accent colors;
  `actorBodyShapeFor(appearance)` → proportions (broad/slim/small/mechanical/caped);
  hair color parsed from `appearance.hair` text; capes/visors per body shape.
- **Animation**: imperative `setSpeed()` handle drives walk/idle cycles in
  `useFrame` without React re-renders.
- A rigged GLB pipeline (Quaternius Universal Animation Library, CC0) is the
  planned upgrade for M3 combat animations; downloads are itch-gated so the pack
  must be fetched manually into `web3d/public/assets/`.

## Look

`MeshToonMaterial` + generated 3-band gradient `DataTexture`, inverted-hull
outlines (focal meshes only — outlines double draw calls), sky/fog/sun driven by
`sceneMoodForClock`. All flat materials cached by color in `scene/toon.ts`.

The beauty pass (`scene/textures.ts`) generates every texture on canvas at
runtime — zero binary assets:

- **Facades**: per-building window grids, floor trim, accent shopfront + door;
  a parallel emissive map lights a seeded subset of windows at night
  (`emissiveIntensity` switches on `isNight`). Cached by color/floors/seed.
- **Ground**: speckle noise (plots, apron), grout-lined paving (courtyards),
  asphalt with center dashes (streets, repeat set per segment length).
- **Set dressing**: rooftop AC boxes + antennas (floors ≥ 3), courtyard-facing
  awnings on low buildings, toon trees (dense in garden/wood districts).
- **Post chain** (`@react-three/postprocessing`): mipmap Bloom (lit windows,
  lamps) + soft Vignette + ACES ToneMapping + FXAA. Two hard-won gotchas:
  EffectComposer silently disables three's default tone mapping — without an
  explicit `<ToneMapping>` the scene renders flat and dark; and prefer FXAA over
  MSAA (multisampling 0) for cost. `?nofx` in the URL disables the whole chain
  (low-end escape hatch).
- **Night**: drei Stars, one warm point light per district courtyard (per-lamp
  lights were the worst perf offender — never do that).
- Perf: ~120 fps on an M-series GPU at 1280×800 (headless SwiftShader numbers
  are meaningless — always measure headed). dpr capped at 1.5, shadow map 1024.

Characters (`characters/CharacterModel.tsx`) are procedural anime-chibi v2:
capsule torso, two-segment limbs with elbow/knee flex in the walk cycle, anime
eyes (white/iris/highlight + brows), hair styles parsed from `appearance.hair`
text (spiky/ponytail/bob/buns/flat/bald), boots, capes, visors — all palette-
driven from the schema so imported worlds style their own cast.

## HUD extras

- **Minimap** (`hud/Minimap.tsx`): canvas top-down city — district plots in
  palette colors (active highlighted), streets, live NPC dots (gold quest / red
  hostile / gray defeated), player arrow with heading. Redraws at 10 Hz from the
  runtime registries; shares the city-model cache (`worldgen/cache.ts`).

## Controls & game feel

- Pointer-lock mouse look: click captures, mouse rotates, click attacks, Esc
  releases; drag-orbit fallback when lock is unavailable (headless, iframes).
  Dialogue opening force-releases the lock for typing.
- Movement uses smoothed acceleration; the model leans into turns; FOV kicks up
  when running/dodging; camera shakes on hits (`controls/runtime.ts
  cameraShake`); dust puffs trail a running player.

## Verification

- `tests/web3d-worldgen.test.ts` — determinism, bounds, courtyard clearance,
  NPC/item coverage, street-per-exit-pair with no foreign-plot intrusion, nav
  graph connectivity for every exit.
- Playwright smoke drivers (used during development) drive the real app via the
  dev-only `window.__game` handle: walk to an NPC, open dialogue, get a reply;
  toggle the agent loop and watch SSE toasts; import the OPM ingest fixture
  through the UI; relocate an NPC through the sim and assert a smooth ≤3.6 m/s
  street walk (no teleport) — all with zero console errors.

## Milestones

- **M1 (done)**: one walkable district, procedural characters, NPC wander, talk via
  `/api/tick`, dialogue/quest HUD, toon look.
- **M2 (done)**: full city + streets from exits, street-graph NPC navigation, SSE
  live agent loop with visible NPC walks, quest tracker, agent-loop toggle,
  world-import screen, district-crossing move sync.
- **M3 (done)**: real-time melee combat — combo/dodge/lock-on FSM, cone hitboxes,
  enemy AI with telegraphs and retreat, HP bars, death/respawn, hit VFX, sim
  outcome reconciliation. (Rigged GLB characters still pending the manual
  Quaternius download; procedural combat animations shipped instead.)
- **M4 (done)**: director-driven cutscenes (letterbox, focus-actor camera, skip,
  AI pause) + pressure-reactive world mood. Verified: beat-detection unit tests
  (`tests/web3d-director.test.ts`), mood tests (`tests/web3d-mood.test.ts`), and
  a Playwright run confirming letterbox, frozen player, control return, and Esc skip.
