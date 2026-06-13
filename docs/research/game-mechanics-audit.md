# Game Mechanics Audit — Basic RPG Standards vs Aliveville, and OSS We Can Steal

**Date**: 2026-06-13
**Author**: research pass (no code changes)
**Scope**: catalog of basic AAA-RPG mechanics, the state of each in `web3d/`,
and the specific open-source libraries / asset packs / reference
implementations that close the gap without a rewrite.

> The user's brief: *"I want you to research games and try to follow all the
> basic mechanics. Can we not steal some open source product or use some open
> source libraries or anything so that it is playable?"*
> Answer below: yes. The R3F stack already has the right runtime; the gap is
> almost entirely **content kits, in-canvas UI, a real character controller,
> and a handful of polish libraries**. Migration is not warranted.

---

## 1. Executive summary

1. **Stay on React Three Fiber.** ADR-001 still holds. The stack is wired into
   DO sim, VRM rendering, Rapier physics, the navgraph, the agent loop, and the
   React HUD. Migrating to Babylon.js or Godot HTML5 is a 2–4 week rebuild that
   buys nothing the user is asking for. Every gap the user listed is closable
   inside the current stack.
2. **The "drop from sky" and "brown board interior" bugs are not library
   problems — they are two-line spawn/Suspense fixes.** Flagged honestly so we
   don't go shopping for a fictional library.
3. **Top 3 quick wins (< 1 day each)**: (a) wire **Kenney Furniture Kit** (140
   CC0 props) into `Interior.tsx` to kill "brown board"; (b) wire
   **`@pixiv/three-vrm-animation`** + free `.vrma` pose/reaction packs from
   VRoid BOOTH + `tk256ailab/vrm-viewer` so VRMs greet, react, and emote (note:
   these are **pose/reaction clips, not locomotion** — walk/run remains
   procedural for now, see §6); (c) replace bespoke camera/orbit in
   `IntroCinematic.tsx` with drei's `<CameraShake>` + lerp rail and add a
   per-fight `<Letterbox>` flash using the existing `Letterbox.tsx`.
4. **Top 3 medium wins (1–3 days each)**: (a) build the
   pause/inventory/quest-accept/death-screen dialogs in **`@react-three/uikit`**
   in-canvas so we stop fighting DOM layering with the HUD; (b) pull **Kenney
   Modular Dungeon Kit + Castle Kit + Modular Buildings**, layered on top of
   the existing City/Nature kits, to give interior presets visual variety per
   role (tavern/forge/abandoned/home); (c) raycast-down-before-teleport fix in
   `PlayerController.tsx` to immediately kill the "drop from sky" symptom
   (band-aid for the bigger ecctrl migration in big bets).
5. **Top 3 big bets (~1 week each)**: (a) **`ecctrl`** to replace the hand-rolled
   `PlayerController` capsule + manual gravity/snap-to-ground — see §4 note,
   this is a 3–4 day refactor because the combat FSM is welded to the current
   kinematic-position direct-velocity-write pattern; (b) **`yuka`** for NPC
   perception + steering + a real state-driven agent vs. the current
   registry-poll pattern; (c) **TileCache** (the dynamic-obstacles half of
   `recast-navigation-js` we already ship) so NPCs route around corpses,
   fighters, and dropped items.

**Verdict in one line**: stay on R3F, spend one focused day on quick wins, then
two-to-three days on `ecctrl` + uikit + Furniture Kit. Migration is off the
table; every "basic RPG mechanic" missing has a CC0 / MIT path in the existing
ecosystem.

---

## 2. Basic mechanics scorecard

Status legend: ✅ shipped · ⚠️ partial · ❌ missing · 🆕 recently fixed (see
linked commit).

| # | Mechanic (AAA expectation) | State in `web3d/` | OSS / asset that closes it | Effort |
|---|---|---|---|---|
| 1 | Title screen + opening narration | ⚠️ `StartFlow.tsx` picks a world & character but no narration / hero shot | uikit `<Fullscreen>` + drei `<Text>` + scripted camera fly-in (existing `IntroCinematic` pattern) | ~1d |
| 2 | Character select (with portrait) | ✅ `StartFlow.tsx` does it; portraits via Modal Z-Image-Turbo | n/a (use existing) | done |
| 3 | NPC recognizes player identity | 🆕 fixed `8665f9b` — threaded into prompts | n/a | done |
| 4 | Per-fight intro cutscene | ⚠️ generic `director/cutscene` orbits actor; no banter / portrait flash | reuse `Letterbox.tsx`, add `<CameraShake>` from drei + portrait flash via existing `CharacterPortrait` | ~0.5d |
| 5 | Quest journal | ✅ `QuestTracker.tsx` + Chronicle | n/a | done |
| 6 | Quest accept dialog (modal) | ❌ quests appear in dialogue prose, never a dedicated Accept/Decline modal | uikit modal in-canvas, or DOM modal in `Dialogue.tsx` | ~0.5d |
| 7 | Quest filtering by player faction | 🆕 fixed `89cb51e` — cross-faction offers suppressed | n/a | done |
| 8 | Inventory UI | ❌ items picked up but no grid UI to view | uikit grid + existing `placements.items` data; AI Town has none either | ~1d |
| 9 | Equipment / gear slots | ❌ no notion of equipping | defer — not core to current product loop | defer |
| 10 | Companion / party | ⚠️ `followers.ts` exists, no party UI / shared XP / banter triggers | wire `useBanterStore` to follower transitions; new HUD slot | ~1d |
| 11 | Faction reputation | ⚠️ engine tracks `disposition`; HUD does not surface it | tiny new HUD chip; data is already there in `world.factions` | ~0.5d |
| 12 | Save / load UI | ⚠️ autosave via DO persist; no manual save UI, no slots | add `<SavePanel>` in uikit; DO API exists | ~1d |
| 13 | Pause menu | ❌ Esc just releases pointer lock | uikit modal, halt agent loop, freeze useFrame via existing `cameraState.override` pattern | ~0.5d |
| 14 | Settings (volume, controls, FOV) | ⚠️ HUD has SFX mute + music mute toggles only | uikit settings panel; data lives in audio/music modules already | ~1d |
| 15 | World map / fast travel | ⚠️ `Minimap.tsx` exists; no fullscreen map, no fast travel | new HUD route using existing district graph; fast-travel reuses `requestTeleport` | ~1d |
| 16 | Tutorial / first-time UX | ⚠️ `Onboarding.tsx` has hints but no scripted "press WASD to walk" intro | scripted overlay listening to first input events; uikit prompt | ~0.5d |
| 17 | Death screen | ⚠️ `PlayerController` auto-respawns 3.2s after death silently | uikit fade-to-black + "You died" + Continue button | ~0.5d |
| 18 | Loading screens with tips | ⚠️ `LoadScreen.tsx` exists, no rotating tips / lore | array of tips in `assets/tips.json`; existing component | ~0.25d |
| 19 | Subtitles (for sfx / narration) | ❌ none | uikit text strip; bind to dialogue tokens | ~0.5d |
| 20 | Camera collision (third-person) | ⚠️ none — camera clips through walls | `ecctrl`'s integrated camera or recast a ray each frame; drei has helpers | ~1d w/ ecctrl |
| 21 | Footstep SFX | ✅ in `PlayerController.tsx` stride-timed | n/a | done |
| 22 | Environmental SFX (birds, wind) | ❌ none | Howler.js positional audio + free CC0 ambiance from OpenGameArt | ~0.5d |
| 23 | Day/night ambient SFX | ⚠️ music swaps day/night; sfx does not | extension of music manager pattern | ~0.5d |
| 24 | Weather (rain/wind) | ❌ none | `@react-three/drei` `<Cloud>`, particle rain via standard examples | ~0.5d |
| 25 | Corpse despawn / loot | 🆕 fixed `89cb51e` — corpses despawn | n/a | done |
| 26 | NPCs route around obstacles | ❌ navgraph is static waypoints; corpses + fighters ignored | TileCache (recast-navigation) dynamic obstacles | ~2d |
| 27 | NPC perception / vision | ⚠️ all NPCs "know" the player exists from the registry | yuka `Vision` + `MemorySystem` | ~2d |
| 28 | NPC steering (avoid each other) | ❌ they overlap visually | yuka steering behaviors | ~1d |
| 29 | Real character controller (slope/step/snap) | ⚠️ hand-rolled in `PlayerController`; brittle on exit teleport | `ecctrl` | ~1.5d |
| 30 | Virtual joystick (mobile) | ❌ pointer-lock only; mobile unplayable | `nipplejs` bound to `input` registry | ~0.5d |
| 31 | Postprocess polish (DoF, color grade) | ✅ Bloom + Vignette + ToneMapping wired | n/a | done |
| 32 | Anime-style VRM animations | ❌ procedural bone bobs, no baked clips | `@pixiv/three-vrm-animation` + free `.vrma` pose/reaction packs (VRoid BOOTH + tk256ailab). Pose/reaction only at this time; locomotion is DIY retarget (see §6). | ~1d for pose/reaction layer |
| 33 | Cinematic banter (during fight) | ⚠️ `banter.ts` store exists, no scripted trigger lines | hook to combat FSM state transitions | ~0.5d |
| 34 | Interior visual richness | ⚠️ procedural geometry only; reads as "brown board" until furniture | **Kenney Furniture Kit** (140 CC0 props) | ~1d |
| 35 | NPC schedules (work / sleep) | ⚠️ engine has dispositions; no time-of-day scheduling | AI Town schedule pattern (cron-style in our agent loop) | ~2d |
| 36 | Gathering / interactables | ⚠️ `inspect` action exists; visible affordances thin | uikit hover label + existing prop registry | ~0.5d |
| 37 | Debug panel (live tuning) | ❌ none | `leva` (React-first, MIT) | ~0.25d |

Items 26 / 27 / 28 / 29 / 32 / 34 are the highest-leverage "basic mechanics
felt missing" the user has been complaining about. Items 1 / 4 / 13 / 17 are
the polish that flips the game from "tech demo" to "playable RPG."

---

## 3. OSS engine / framework — stay on R3F (verdict)

ADR-001 chose R3F + drei over Babylon, PlayCanvas, and Godot HTML5 export.
Three things have changed since then; none of them flip the verdict.

**What changed since ADR-001:**
- We now depend on `@pixiv/three-vrm`, `@react-three/rapier`, and
  `@react-three/postprocessing` in ways that have no Babylon equivalents
  without re-implementing each plugin against Babylon's `Mesh` / physics API.
  three-vrm is a Three.js plugin specifically; there is no first-party Babylon
  VRM loader.
- `ecctrl`, `@react-three/uikit`, `recast-navigation-js`, and `yuka` exist in
  the R3F/Three ecosystem at production quality. They were less mature in May.
- The DO + agent loop + dialogue/coherence pipeline (`src/`) is renderer-agnostic
  by design, so an engine migration would not touch the AI surface at all —
  but it would mean rewriting 100% of the rendering, controls, combat VFX,
  worldgen, and HUD.

**Migration honest cost estimate**:

| Target | Realistic cost | Mechanics gained for free | Verdict |
|---|---|---|---|
| **Babylon.js 7** | 2–3 weeks. Mesh, materials, animation, physics binding, VRM (no first-party), HUD bridge all rewrite. | Built-in `Scene.beginAnimation`, NodeMaterial editor, GUI lib (`babylon.gui`), built-in navmesh, KTX2 pipeline. | **No.** Net negative: we lose three-vrm + drei + rapier+R3F integrations. |
| **PlayCanvas (open) + WASM editor** | 3–4 weeks. ECS rewrite. No React. | Mature visual editor, real Editor-driven content authoring. | **No.** Different team workflow; throws out the React-driven HUD. |
| **Godot 4 HTML5 export** | 4+ weeks. Reimplement sim ↔ client bridge. | Real RPG primitives (animation player, inventory nodes, dialog system, save), GDScript, tilemap-ish. | **No.** Loses LLM/DO integration story; HTML5 build is 30+ MB. |
| **Three.js direct (no R3F)** | 1–2 weeks. Lose React HUD/store bindings. | Direct control, no reconcile overhead. | **No.** Costs > saves; we already have imperative `ref.current` pattern (`lessons.md`). |
| **Stay on R3F + adopt the libraries below** | 1 week to close 80% of scorecard gaps. | All of the above, à la carte. | **Yes.** |

**Bottom line**: migrations cost weeks of pure runtime work and gain nothing
the four mainstream R3F libraries don't already give us. Pursue option 5.

---

## 4. OSS libraries to adopt (ranked by ROI)

Each row is a library we don't yet use (or under-use) and the gap it closes.
"Effort" is the cost to wire it into the existing modules. Prices are zero
across the board — every library here is MIT/Apache/CC0.

| Rank | Library | What it solves | Wires into | Our current alt | Effort | License |
|---|---|---|---|---|---|---|
| 1 | **`@pixiv/three-vrm-animation`** + free `.vrma` pack | Real baked anime clips (idle, walk, run, jump, sit, greet, sad, surprised) for VRM characters. | `characters/VrmCharacter.tsx` (replace procedural bone bobs); plug into `CharacterAnimationHandle` API. | Hand-rolled hip bob + arm/leg swing keyed off `setSpeed`. | **0.5d** wire + 0.5d pack curation | MIT (lib) + per-clip VRM license |
| 2 | **`ecctrl`** | A real R3F + Rapier character controller: float spring, slope, step, snap-to-ground, jump, third-person camera with collision. | Replace most of `controls/PlayerController.tsx` (~485 lines); keep the combat-FSM hook. | Hand-rolled capsule controller via `physicsWorld.createCharacterController(0.05)`. | **3–4d** — ecctrl uses a dynamic rigid body + float-spring; our controller is `kinematicPosition` and the combat FSM (`updatePlayerCombat` → `combatFrame.moveLock` → direct velocity writes) is welded to that pattern. Migration needs combat FSM adapter, not just a controller swap. | MIT |
| 3 | **`@react-three/uikit`** | Yoga-flexbox in-canvas UI: pause menu, inventory, quest-accept modal, settings, death screen, save slots, subtitles. | New `hud/canvas/` directory; uses existing zustand stores. | DOM HUD in `hud/*.tsx` — keeps fighting CSS layering with the 3D canvas. | **2d** for first batch | open source (MIT-style) |
| 4 | **`yuka`** | Steering (separation, alignment, wander, seek, flee), perception (vision cones), state-driven NPC agents. | New `characters/ai/` layer; subscribes to `npcRegistry` and writes back movement targets to NPCs. | Hand-rolled wander tick in `Npc.tsx` + dialogue cooldowns. | **2d** for steering only; 4d incl. perception | MIT |
| 5 | **`leva`** | React-first GUI for live-tuning every magic number (walk speed, camera FOV, bloom intensity, NPC chatter cooldown). | `vite-env.ts` dev import; gated behind `?dev=1`. | Magic numbers in source. | **0.25d** | MIT |
| 6 | **`howler.js`** | Web Audio + sprite atlases + positional audio + ducking. Replaces `audio/sfx.ts`'s HTMLAudioElement glue. | `audio/sfx.ts` and `audio/music.ts`. | HTMLAudio per cue. | **1d** | MIT |
| 7 | **`nipplejs`** | Virtual joystick for touch devices. Bind to the same `input` registry as WASD. | `controls/input.ts`. | None — game is keyboard-only. | **0.5d** | MIT |
| 8 | **drei `<CameraShake>` + `<Html>` + `<Text3D>`** (already in `package.json`) | We have drei 10.x but only use `<Stars>`, `<Billboard>`, `<Text>`. Use the rest harder. | `director/IntroCinematic.tsx`, combat VFX, narration overlays. | Bespoke camera shake state in `runtime.ts`. | **0.5d** to refactor | MIT |
| 9 | **`@react-three/postprocessing` `<DepthOfField>` + `<ChromaticAberration>`** | Premium feel for dialogue close-ups + combat hits. We already have the EffectComposer wired. | `scene/GameWorld.tsx`'s post chain. | None. | **0.25d** | MIT |
| 10 | **TileCache (already in `recast-navigation-js`)** | Dynamic obstacles for NPC routing. Add a temporary obstacle on every corpse / dropped item / active fighter. | `worldgen/navgraph.ts` (currently a static Dijkstra graph), `Npc.tsx` pathing. | Static waypoint graph (ADR-003). | **2d** | ZLib (Recast) |

### Notes on libraries

- **`ecctrl`** is the long-term fix for "drop from sky on interior exit"
  (`PlayerController.tsx` lines 200–210). Today the exit teleport sets
  `y = CAPSULE_CENTER_Y + 0.2` and trusts gravity to land. If the
  `outsideX/outsideZ` lands on a building footprint with mismatched collider
  setup, the player drops because the ground collider isn't where it should be.
  Ecctrl's snap-to-ground and float-spring make this class of bug structurally
  impossible. **Caveat**: ecctrl runs on a dynamic rigid body + float-spring,
  while our controller is `kinematicPosition` with manual velocity writes from
  the combat FSM (`moveLock`, direct `velocity.copy`). Migration is not a
  drop-in; it needs a combat-FSM adapter so attacks, dodges, and hitstun still
  drive the body. Real cost: 3–4 days. The right ship-this-week answer is the
  raycast band-aid (see §7.4 Fix B); ecctrl is the next-quarter durable fix.
- **`@react-three/uikit` v1.0** shipped October 2025. Confirmed first-party
  pmndrs library, Yoga layout, Shadcn-style kit. Use the Shadcn kit; matches a
  modern anime-UI aesthetic with no custom CSS work.
- **`yuka`** is engine-agnostic and ships its own vector / quaternion types. We
  would convert at the boundary (yuka `Vector3` ↔ three `Vector3`) — cheap.
- **`leva`** is the lazy choice over `tweakpane` because we're already
  React-only. tweakpane is fine; leva is one less integration shim.

---

## 5. Reference implementations to study (not copy wholesale)

We do not need to *port* these — we need to steal three or four mechanic
patterns from each.

### AI Town (`a16z-infra/ai-town`, MIT)

- **What to steal**: the schedule-driven NPC day. AI Town runs a cron-style
  background job that hands each character a current activity per time-of-day.
  This is the simplest possible patch over "NPCs stand around when the player
  is far away" (item #35 above).
- **What to skip**: Convex backend (we use DO + SQLite), their PixiJS renderer
  (we're 3D), their conversation pacing (ours is interactive, theirs is
  observation-only).
- **Already cited** in `docs/third-party-assets.md` as architecture-only
  reference; current value is the schedule + the engagement model where NPCs
  do their own thing and the player joins in.

### Stanford Generative Agents (`joonspk-research/generative_agents`)

- **What to steal**: memory **reflection** — periodically the agent reads its
  recent memories and synthesizes a higher-level belief. We *partially* do this
  (`feat: NPC reflection + anti-sycophancy anchoring`, 2026-06-12) but only on
  dialogue turn; the Stanford pattern is to fire reflection on its own cadence
  (every N hours of sim time).
- **What to skip**: the Django + sandbox simulation; we are not running 25
  agents in a literal world clock.
- **Cost**: documentation read, not code import. ~2 hours.

### Soul Engine / OpenSouls (`opensouls/opensouls`)

- **What to steal**: the explicit **resumable conversation state** and atomic
  vector-store change tracking. We have a homegrown analog; their pattern is
  cleaner for "player closes dialogue mid-sentence, reopens 10 minutes later,
  NPC remembers where they were."
- **What to skip**: their hosted runtime — we have our own DO.
- **Note**: SoulEngine is one of three projects called "Soul Engine" that
  surfaces on GitHub; the relevant one for us is `opensouls`. There's also
  `jofizcd/Soul-of-Waifu` (a desktop VRM companion app — useful pattern for
  *if* we ever ship offline). `DxrxDev/SoulEngine` is unrelated (C# 2D game
  engine).

### Open RPG references (R3F)

- `anglinj/rpg-game-react` and `eugeniosegala/react-three-fiber-2d-rpg-sample`
  are 2D RPGs in R3F. Useful only for inventory grid + quest panel patterns;
  don't try to use as a stack.
- The pmndrs ecosystem itself ships demos for `ecctrl`, `uikit`, `xr` that we
  should clone and read before wiring (each takes 15 minutes).

---

## 6. Asset gaps — concrete pulls

We have already pulled Quaternius UAL + Modular Characters, Kenney City Kit
Suburban + Nature Kit, 5 VRMs, and Kevin MacLeod's CC-BY music pack.
The remaining CC0 base layer is small and well-defined.

| Pack | License | What it adds | Closes scorecard items |
|---|---|---|---|
| **Kenney Furniture Kit** (140 assets — chairs, sofas, tables, bookcases, kitchen, bathroom) | CC0 | Real-feeling tavern / home / forge / abandoned interiors. Currently `Interior.tsx` ships boxGeometry-only walls + procedural "wall dressing" — interiors read flat. | #34, partially #36 |
| **Kenney Modular Buildings** | CC0 | Variety in district exteriors so every village doesn't look the same. | #18 polish, district variety |
| **Kenney Modular Dungeon Kit** | CC0 | Forge / abandoned interior preset variety; combat arena geometry. | #34, #4 |
| **Kenney Castle Kit** | CC0 | Faction HQ-style buildings (Hero HQ already targeted in `agent-town-handoff.md`). | district variety |
| **Poly Haven indoor models** (CC0, ~indoor / furniture / kitchen categories) | CC0 | Higher-fidelity hero props for camera-close scenes (food on a table during dialogue close-up, weapons rack in forge). | #4, premium polish |
| **VRoid Hub free `.vrma` clips** + **BOOTH free pack** (7 clips: greeting, peace sign, shoot, spin, model pose, squat, show full body) | per-pack VRM license; the 7 listed are free + redistributable | **Pose / gesture clips**, not locomotion — useful for greet/idle-flair/celebration triggers but does not solve idle/walk/run. | #32 (poses) |
| **`tk256ailab/vrm-viewer`** sample clips (Angry, Blush, Clapping, Goodbye, Jump, LookAround, Relax, Sad, Sleepy, Surprised, Thinking) | MIT (repo); per-clip licenses to verify | **Reaction clips** for dialogue close-ups — the missing emotional layer. Also non-locomotion. | #32 reactions, dialogue polish |
| **Locomotion clips** (idle / walk / run / jump-loop) — mostly DIY | varies | Real walk cycle for VRMs. No free `.vrma` locomotion pack found at audit time; pull route is Mesh2Motion / AccuRIG retarget from CC0 Mixamo-style sources, or hand-author in Blender + UniVRM export. Until then, procedural fallback in `VrmCharacter.tsx` stays for locomotion and the new `.vrma` clips layer on top for greetings + reactions. | #32 locomotion |
| **OpenGameArt CC0 ambient SFX** (birdsong, wind, tavern murmur) | CC0 | Day/night ambient layer. | #22, #23 |
| **Mesh2Motion / AccuRIG** (free Mixamo-style retargeting tools) | MIT (Mesh2Motion) / proprietary-free (AccuRIG) | Custom rig retargets for UAL & VRM if we ever author bespoke clips. | future |

### What we are deliberately not pulling

- **Mixamo itself** — Adobe login wall, T&C ambiguity for redistribution. Use
  AccuRIG or Mesh2Motion instead.
- **MakeHuman** — character creator, not an asset library; out of scope.
- **Sketchfab non-CC0** — license noise; we have a strict CC0 default.
- **3D AI Studio / Meshy / Tripo paid tiers** — see `docs/future-prd.md` §5;
  premium asset gen is a separate roadmap item.

### Concrete pull order (`scripts/` or manual)

```
1. Kenney Furniture Kit            → web3d/public/assets/interior/furniture/
2. VRoid BOOTH 7-clip free pack    → web3d/public/assets/vrm/anim/
3. tk256ailab vrma sample clips    → web3d/public/assets/vrm/anim/reactions/
4. Kenney Modular Dungeon Kit      → web3d/public/assets/interior/dungeon/
5. OpenGameArt ambient SFX (3 CC0) → web3d/public/assets/audio/ambient/
6. Poly Haven 8–10 hero props      → web3d/public/assets/interior/hero/
```

All of these belong in a follow-up doc entry in `docs/third-party-assets.md`
when actually pulled — license hygiene non-negotiable (per `lessons.md`).

---

## 7. Mechanic-by-mechanic plan for the reported bugs

Each bug below maps to either an OSS library, an asset pull, or — honestly — a
local code fix that no library can magic away. Listed in the order the user
raised them.

### 7.1 Corpses persist forever, NPCs walk through them

**State**: fixed in commit `89cb51e` (corpses despawn + cross-faction quest
filter, 2026-06-13). 🆕

**OSS leverage if it regresses**: TileCache (recast-navigation-js, already in
deps) for dynamic obstacles so NPCs route around live corpses during the
despawn window. Effort: 2d.

### 7.2 Quests don't filter by player identity

**State**: fixed in commit `8665f9b` (player identity threaded into NPC
prompts) + `89cb51e` (cross-faction offer suppression). 🆕

**No library needed.**

### 7.3 Interior loads as a "brown board" for a moment

**Root cause** (read of `Interior.tsx` + `GameWorld.tsx`):
- `<Interior>` is wrapped in the GameWorld `<Suspense fallback={null}>`.
- The interior floor / walls are box geometry with canvas-generated `MeshToonMaterial`s
  built in `useMemo` on first render.
- Furniture is procedurally tinted box geometry — there's literally nothing
  *but* a brown floor and a few colored boxes.

**Fix path (OSS-leveraged, no library can hide the absence of furniture)**:
1. **Kenney Furniture Kit** (CC0, 140 assets). Pull the 30–40 most relevant
   (tavern: tables/chairs/barrel/bottles; home: bed/wardrobe/rug; forge:
   anvil/grinder/storage; abandoned: broken-furniture pieces) into
   `interior/furniture/`. Drive selection from `interior.preset.role`.
2. Wrap furniture loads in their own `<Suspense fallback={<ProceduralFurniture/>}>`
   so the existing procedural fallback is invisible to the player on warm
   loads but available on cold ones.
3. **No new library.** This is asset + 3 small `useToonGlb`-style hooks like
   we already use for Kenney City/Nature.

**Cost**: 1 day, mostly curation.

### 7.4 Leaving an interior drops the player from the sky

**Root cause** (read of `PlayerController.tsx` lines 200–210):

```ts
// door transitions request a one-shot teleport
if (teleportRequest.target) {
  rigidBody.setNextKinematicTranslation({ x, y: CAPSULE_CENTER_Y + 0.2, z });
  ...
}
```

The exit teleport hardcodes `y = CAPSULE_CENTER_Y + 0.2 = ~1.1` regardless of
ground height at `(outsideX, outsideZ)`. Then gravity ticks at -22 m/s² until
`controller.computedGrounded()` reports true. For ~3–4 frames at 60 fps the
player is visibly falling.

There are two clean fixes; both are library-leveraged:

**Fix A — Adopt `ecctrl`** (durable, next-quarter).
Ecctrl's float-spring controller snaps the capsule to ground on the next physics
step. The exit teleport becomes "move the capsule to (x, ground-y, z)" and the
controller handles the rest. Net gain: bug is structurally impossible.
**Realistic effort 3–4d**, not the 1d the surface comparison would suggest —
ecctrl uses a dynamic rigid body, our controller is kinematic and the combat
FSM (`moveLock`, direct velocity writes, dodge i-frames) is welded to that.
Migration needs a combat-FSM adapter, not just a controller swap.

**Fix B — Local raycast** (band-aid, ship today).
Before issuing the teleport, fire a Rapier ray from
`(x, wallHeight + 2, z)` straight down to find the actual ground height,
then teleport to `y = groundY + CAPSULE_CENTER_Y`. Effort 1h.

**Fix B is the right thing to ship this week.** Fix A is a "1 week of focused
controller work" project that should go in the durable backlog with a clear
combat-FSM-adapter design step.

### 7.5 No opening narration / title card / hero shot

**State**: ❌ missing. `StartFlow.tsx` is functional (world picker + character
picker) but feels like a config screen, not a game start.

**OSS leverage**:
- **`@react-three/uikit`** for the in-canvas title overlay (premium feel + we
  can lerp the camera behind it for a hero shot of the village).
- **drei `<Text3D>`** for the world title in-scene (cheaper than a custom mesh
  loader).
- **drei `<CameraShake>`** at a light setting to add that "this is a living
  world" sensation behind the title.
- **`IntroCinematic.tsx`** already has the camera-override hook; reuse it.

**Cost**: 1 day. No new dependency beyond uikit (which is already in the
adoption queue for #1 in §1).

### 7.6 No per-fight intro cutscene

**State**: ⚠️ partial. `director/cutscene` orbits a focus actor for a fixed
duration. No portrait flash, no banter line, no "vs." card.

**OSS leverage**:
- Reuse existing `Letterbox.tsx` (DOM-side, already animates in/out).
- Add a `<CharacterPortrait>` flash (existing) at the corners during the
  letterbox window.
- Add a drei `<CameraShake>` on attack impact (already discussed in #8).
- Wire to combat FSM state transitions; `combatStore` already exposes the
  needed `hostile` / `defeated` flags.

**Cost**: 0.5 day. No new library.

### 7.7 Premium feel (the user has not said this verbatim, but it's the meta-complaint)

**OSS leverage** (all already in `package.json`):
- `<DepthOfField>` from `@react-three/postprocessing` on dialogue close-ups
  (`Dialogue.tsx` opens → set a flag → DoF kicks in).
- `<ChromaticAberration>` during the `damageEnemy` callback for one frame.
- `<Bloom>` is already wired. Tune `luminanceThreshold` on hit flashes only.
- `tk256ailab` reaction `.vrma` clips on dialogue (Sleepy / Surprised / Sad)
  — the single biggest perceived-quality lever we can pull.

**Cost**: 0.5 day to wire. Asset pull cost is separate (§6).

### 7.8 Characters don't recognize the player's chosen identity

**State**: fixed in `8665f9b`. 🆕 Per the lifelikeness probes, NPCs now address
the player by their chosen name and recognize role.

**No library needed.**

---

## 8. Recommended sprint — what to do in 1 focused day

If we get exactly 8 hours, this is the ordering that maximizes "the game feels
playable" delta. Each item is independent so we can stop at any point.

| Slot | Task | Stack | Outcome |
|---|---|---|---|
| 30 min | Pull **Kenney Furniture Kit** zip, extract `kt: chairs/tables/beds/bookcases/anvil`. | curl + unzip | Files on disk in `web3d/public/assets/interior/furniture/`. |
| 90 min | Wire 6 furniture roles into `Interior.tsx`'s `furniture.map(piece => …)` via a `<KenneyFurniture>` chooser. Toggle by `preset.role`. | R3F + existing `useToonGlb` pattern | "Brown board" interiors gone. |
| 30 min | Quick fix for "drop from sky": raycast straight down before teleport in `PlayerController.tsx`'s `teleportRequest` block. | three.js `Raycaster` (no new dep) | Player stops falling on exit. |
| 90 min | Pull **VRoid BOOTH 7-clip pose pack** + `tk256ailab` reaction clips into `web3d/public/assets/vrm/anim/`. Install `@pixiv/three-vrm-animation`. | pnpm + curl | Files + dep ready. |
| 90 min | Layer `.vrma` pose/reaction clips on top of `VrmCharacter`'s procedural bone bob via `VRMAnimationLoaderPlugin`. Procedural stays for locomotion (no free walk `.vrma` found — see §6); clips trigger on `gesture('greet'/'angry'/'thinking')` for dialogue close-ups. | three-vrm + three-vrm-animation | VRMs greet, react, emote during dialogue. Locomotion still procedural until a CC0 walk clip is sourced or retargeted. |
| 60 min | Wire `<DepthOfField>` to dialogue open/close. Wire `<CameraShake>` to `damageEnemy`. | `@react-three/postprocessing` + drei | Combat + dialogue feel like a real game, not a tech demo. |
| 30 min | Per-fight intro: letterbox in + portrait flash + camera orbit, triggered on first hostile transition. | existing `Letterbox.tsx` + `IntroCinematic` pattern | Every fight feels staged, not random. |
| 30 min | Death screen: uikit-or-DOM fade-to-black + Continue button on `playerCombatState.kind === 'dead'`, replaces the silent 3.2s respawn. | DOM modal (uikit is a separate adoption) | Player understands they died. |

End of day delta: items 4, 17, 32, 34 ✅; items 7.3, 7.4, 7.6 closed.

### Next two days (post-sprint)

- Adopt `ecctrl` properly (replace controls/PlayerController internals).
- Adopt `@react-three/uikit` for pause menu + inventory + quest accept modal.
- Adopt `leva` for tunable magic numbers (gated behind `?dev=1`).
- Pull **Kenney Modular Dungeon Kit** + **Castle Kit** for exterior variety.

### Next week (big bets)

- `yuka` for NPC perception + steering.
- TileCache for dynamic obstacle routing.
- AI Town schedule pattern for time-of-day NPC behaviors.
- Stanford-style scheduled reflection pass on the agent loop.

---

## 9. Loose ends / questions to confirm with the user

1. **Mobile**: the user has not asked for mobile, but the game becomes
   unplayable on touch the moment we add pointer-lock-only attack. Should
   `nipplejs` be in the next-day list or deferred?
2. **Inventory**: the engine surfaces `pickup` actions but there's no slot
   limit, no weight, no equipment. Is "inventory" worth UI before there's a
   gameplay reason to inspect inventory?
3. **Save slots**: DO autosave is per-session-DO. A "Save Slot 1 / 2 / 3" UI
   would require DO-side multi-save storage. Worth the work or is autosave
   enough?
4. *(Out of scope for this audit, parking lot)* extending Z-Image-Turbo to
   interior wall art / banners — not part of "basic mechanics," revisit
   alongside `docs/future-prd.md` §5 asset pipeline work.

---

## 10. Citations

External research consulted while writing this doc (June 2026):

- `pmndrs/ecctrl` (R3F character controller) — https://github.com/pmndrs/ecctrl — MIT, ~714 stars.
- `pmndrs/uikit` (in-canvas R3F UI) — https://github.com/pmndrs/uikit — v1.0.0 Oct 2025, 3.2k stars.
- `Mugen87/yuka` (JS game AI) — https://github.com/Mugen87/yuka — MIT, engine-agnostic.
- `@pixiv/three-vrm-animation` — https://pixiv.github.io/three-vrm/docs/modules/three-vrm-animation.html — VRMA loader + `createVRMAnimationClip`.
- `tk256ailab/vrm-viewer` — sample VRMA clips (Angry/Blush/Clapping/Goodbye/Jump/LookAround/Relax/Sad/Sleepy/Surprised/Thinking).
- VRoid Hub BOOTH free pack — https://vroid.com/en/news/6HozzBIV0KkcKf9dc1fZGW — 7 free `.vrma` clips.
- `a16z-infra/ai-town` — MIT, Convex backend, schedule + memory + simulation patterns.
- `joonspk-research/generative_agents` — Stanford research codebase; reflection + memory streams.
- `opensouls/opensouls` — legacy AI souls framework, resumable state + vector store pattern.
- `isaac-mason/recast-navigation-js` + `@recast-navigation/three` — TileCache for dynamic obstacles in R3F.
- `goldfire/howler.js` — Web Audio + sprite audio, current recommended game audio library.
- `yoannmoinet/nipplejs` — MIT virtual joystick for touch interfaces.
- `pmndrs/leva` — React-native GUI controls for live tuning.
- Kenney Furniture Kit (140 CC0 assets) — https://kenney.nl/assets/furniture-kit
- Kenney Modular Dungeon Kit, Castle Kit, Modular Buildings — https://kenney.nl/assets — all CC0.
- Poly Haven indoor models — https://polyhaven.com/models/categories/indoor — CC0.
- OpenGameArt CC0 furniture / buildings collections — https://opengameart.org/content/cc0-furniture / https://opengameart.org/content/cc0-buildings-kit
- BG3 companion approval system (mechanic reference) — https://bg3.wiki/wiki/Approval
- Mesh2Motion (open-source Mixamo alternative) — https://gamefromscratch.com/mesh2motion-open-source-mixamo-alternative/
- drei docs — `<CameraShake>`, `<CameraControls>`, `<Html>` — https://drei.docs.pmnd.rs/controls/introduction

Internal anchors consulted: `docs/decisions.md` (ADR-001/002/003), `docs/lessons.md`, `docs/third-party-assets.md`, `docs/web3d-architecture.md`, `docs/experiments/index.md`, `web3d/src/controls/PlayerController.tsx`, `web3d/src/scene/Interior.tsx`, `web3d/src/scene/GameWorld.tsx`, `web3d/src/hud/Hud.tsx`, `web3d/src/hud/StartFlow.tsx`.
