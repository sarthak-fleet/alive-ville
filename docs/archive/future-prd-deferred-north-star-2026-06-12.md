# Aliveville Future PRD: Living 3D Fandom Worlds (2026–2028)

**Status**: Deferred north-star (archived 2026-06-20) — NOT an active sprint.  
**Gate**: `docs/core-gameplay-fix.md` §5 playtest bar is **not met** (fun verdict pending).  
Do not implement XL features from this doc until the gate clears.  
**Canonical home**: this archive file (supersedes `docs/future-prd.md`).
**Owner**: Product + Engineering (fleet)  
**Supersedes**: `docs/archive/init.md` (original research-phase brief)  
**Related (do not duplicate)**:  
- `PROJECT_STATUS.md` (current baseline + done/planned)  
- `docs/web3d-architecture.md` (3D client M1–M4)  
- `docs/research-lifelikeness.md` (evidence-ranked mechanisms + gap analysis)  
- `docs/ai-dungeon-differentiation.md` (positioning)  
- `docs/third-party-assets.md` (current references; will evolve with pipeline)  
- `src/probes/` + `pnpm probe:lifelikeness` / `pnpm verify:readiness` (evaluation discipline)

---

## 1. Executive Summary

Aliveville is a **browser-playable AI world simulator** that compiles reviewed fandom or original lore into a structured, persistent, autonomous multi-agent 3D RPG world. The player enters as a protagonist (or any character), walks a living town, fights, talks, completes quests, triggers gossip and confrontations, and sees their specific actions visibly reshape relationships, ambitions, and city mood — even when they step away.

**v0.5 (current, M1–M4 shipped)**: Deterministic 3D worldgen from schema, third-person walk + real-time combat, interiors, director cutscenes + pressure-reactive mood, LLM dialogue with engine-validated real actions (move/give/fight/quest/etc.), rumor diffusion → public confrontations, agent loop with SSE streaming, save/restore, fandom ingest (Demon Slayer, One Punch Man, custom).

**The future (this PRD)**: Professional visual fidelity + production-grade lifelikeness + scalable creator platform. Move from "impressive prototype that feels alive in simulation" to "the most legible and consequential persistent 3D AI world you can step into from any fandom."

**Binding constraints to solve** (from research-lifelikeness):
1. **Legibility / Protagonism** — Make NPC↔NPC drama traceable to the player (Chronicle + player-causal recaps). Keystone.
2. **Reflection** — Largest single believability lever in the literature (Smallville ablation).
3. **Identity & Coherence** — Sycophancy anchors, divergence pressure, action-awareness checks.
4. **Asset fidelity** — Escape pure-procedural + one rigged GLB into a sustainable hybrid pipeline of curated CC0 + targeted AI generation + procedural augmentation.
5. **Evaluation discipline** — Extend the existing probes harness so every major build is regression-tested against lifelikeness mechanisms.

**Strategic bet**: The differentiator is not more agents or bigger models. It is **structured world compilation + autonomous agents whose drama is made legible as player-caused consequence** inside a high-fidelity, instantly playable 3D browser surface, at sustainable cost.

---

## 2. Vision & Positioning

**North-star sentence** (for marketing, onboarding, roadmap decisions):

> "Pick any reviewed fandom or original world source. In minutes you step into a living 3D town where characters remember what you did, gossip about it when you're gone, pursue their own ambitions, and visibly change because of you."

**What we are not** (from differentiation doc):
- Infinite freeform text adventure (AI Dungeon lane).
- Pure NPC chat / parasocial companion app.
- "Type anything, get a movie."

**What we double down on**:
- **Spatial + consequential**: 3D movement, real-time combat, enterable locations, objectives that drive the sim.
- **Compiled structure**: World sources become typed locations, exits, factions, villain plans, quest skeletons, appearance metadata, visual palettes — not loose prompts.
- **Autonomous persistence**: Agents keep acting (agent loop + director). The world has a life when the player is offline (catch-up + replay).
- **Player protagonism via legibility**: Every major grudge, alliance, or escalation carries a causal trace back to player actions/rumors.
- **Hybrid fidelity at browser scale**: Beautiful enough to feel authored, generated enough to scale to any fandom, cheap enough to run per-session on edge.

**Long-term (2028) aspiration**: A "Living Canon Platform" where fans, creators, and studios publish reviewed world sources that become shareable, forkable, persistent 3D RPG slices with their own economies of consequence. Multiple simultaneous worlds, cross-world echoes (optional), creator tools for fine-tuning agents and visuals, exportable replays/chronicles.

---

## 3. Target Users & Core Loops

**Primary**:
- Fandom immersion players (Demon Slayer / OPM / any anime/game/book world) who want to *live inside* the setting and change it.
- Solo RPG / narrative gamers who want emergence + objectives instead of pure prose or railroading.
- World-building tinkerers who enjoy importing lore and watching the machine run.

**Secondary / future**:
- Educators / writers using it as a "what if" simulation for character and plot exploration.
- Small creators publishing their own worlds.
- (Stretch) Studios using internal versions for pre-vis / character relationship prototyping.

**Core player loop (v1 target)**:
1. Choose / import world + embody or create protagonist.
2. Walk the 3D city (or districts), enter interiors, observe autonomous life.
3. Engage (talk, spar, give, inspect, complete player-driven or NPC-offered quests).
4. Witness (or cause) emergent drama: rumors spread, relationships shift, confrontations erupt in public.
5. Experience director pressure and arc resolution (Training → Trial → Confrontation).
6. Leave, return later; world has continued; chronicle shows exactly what your past choices set in motion.

Success looks like players saying variants of: "I caused that feud by telling X about Y's secret" and then watching the public confrontation they triggered.

---

## 4. Current Baseline (June 2026)

See `PROJECT_STATUS.md` and `docs/web3d-architecture.md` for full detail. Highlights:

**Simulation (src/)**: Strong. Engine-validated actions, tiered memory (with early chronicleId field), rumor diffusion with leak detection, relationship graph, confrontation execution with witnesses, director (villain plans + pressure), arcs with XP, objectives, offline catch-up + replay.

**3D Client (web3d/)**: Walkable procedural city from 2D schema (deterministic), third-person controller + rapier physics, real-time melee (combo/dodge/lock-on), enterable dollhouse interiors, director letterbox cutscenes + global mood shift (fog/sky), minimap, toasts, LLM dialogue panel with live disposition. Pure procedural toon/chibi characters + Quaternius CC0 rigged GLB for animations (bodies still procedural; palette-driven). Zero heavy binary assets for buildings/props (canvas-generated facades, speckle ground, etc.).

**Assets today** (see `docs/third-party-assets.md`): Quaternius Universal Animation Library (CC0) for locomotion/combat/death clips. Everything else generated at runtime. Past 2D references (Agent Town, OpenRTP) archived with the old client.

**Gaps vs. evidence** (verbatim from `docs/research-lifelikeness.md`): No reflection, weak sycophancy/divergence/coherence guards, no causal-trace UI or player-subject recaps, limited needs/replanning triggers.

**Economics & ops**: Tiered models + local fallback + per-session Cloudflare Durable Object isolation is already a structural advantage.

---

## 5. 3D Asset & Media Pipeline Strategy (New Major Workstream)

The biggest visual step-change and a prerequisite for "detailed" fandom worlds. Pure procedural has served M1–M4 well for speed and determinism; we now need **production texture, prop, and character variety** while preserving browser load time, licensing sanity, and cost.

### 5.1 Hybrid Model (priority order)

1. **Curated CC0 High-Fidelity Base** (foundation for "detailed")
   - **Poly Haven** (polyhaven.com): Hyper-real PBR models (props, furniture, industrial, nature, electronics). CC0. Use for hero props, environmental set dressing, reference for toon adaptation. Blender addon helps authoring.
   - **Kenney** (kenney.nl): Thousands of game-ready 3D kits (modular buildings/props, platformer, dungeon, vehicles, space, etc.). CC0. Perfect for fast variety, low-poly game feel, and modular worldgen expansion.
   - **BlenderKit** (free tier): Community models/materials/HDRIs. Good for rapid prototyping inside Blender before export.
   - Others: Sketchfab CC0/free filters, Printables/Thingiverse for specific printables if relevant, heritage scans (MyMiniFactory Scan the World).

2. **AI Auto-Generation for Custom / Fandom-Specific** (unlocks variety at scale)
   - Primary: **Meshy.ai**, **Tripo AI**, **Rodin (Hyper3D)** via direct or (preferred) aggregator **3D AI Studio** (multi-model access + pipeline tools at good value).
   - Workflow: Text prompt (from world schema + appearance metadata) + reference image(s) (fandom wiki art, player upload, or generated concept) → textured GLB/FBX/OBJ with PBR or toon-friendly maps → remesh/LOD → rig (base skeleton or auto) → import.
   - Free tiers exist for experimentation (credit-limited; public generations often CC BY). Paid unlocks private/commercial rights + volume.
   - **Sloyd.ai** (hybrid parametric + AI): Excellent for consistent stylized game props/characters where template control > pure novelty.
   - **Luma AI**: Capture (iPhone scans of real objects or printed maquettes) for reference or direct detailed meshes. Strong 3D reconstruction heritage (text-to-3D "Genie" historical; check current status for video/NeRF exports).

3. **Procedural Augmentation & Runtime** (preserve current strengths)
   - Keep schema-driven worldgen, palette mapping, canvas-generated facades/ground/trim.
   - Runtime attachment (hair, capes, accessories) on shared rigs.
   - Toon/non-photoreal materials (`MeshToonMaterial` + generated textures) as the default visual language (anime-chibi / stylized fidelity target).
   - LOD, instancing, streaming for larger cities.

4. **Capture & User-Contributed** (longer term)
   - Luma / Polycam-style mobile capture → consistent character or prop import for a specific world.
   - Player can supply reference images during character creation or world editing → generator produces matching cast.

5. **Rigging, Animation, Media Layer Evolution**
   - Base: Quaternius CC0 library (already in use) + future additive clips.
   - Target: Mix of authored/CC0 clips + lightweight AI-assisted retargeting or keyframe for signature movesets per major character.
   - Cutscenes: Keep director-driven (letterbox + camera) as primary. Optional offline AI video (Higgsfield-style effects or Luma/Rod etc.) for high-production "postcard" or trailer moments only — never runtime during gameplay (cost + determinism rule from original init).
   - Portraits / 2D fallbacks: Continue procedural + optional pre-gen or AI image for HUD / story mode.

### 5.2 Pipeline Requirements (non-negotiable)

- **Licensing first**: Default to CC0 / public-domain-equivalent. Track every source in `docs/third-party-assets.md` (and eventually a machine-readable catalog). Paid AI generations require private-license plans for commercial/distributable worlds.
- **Determinism & reproducibility**: Same world schema + seed + asset manifest version must produce visually consistent (if not byte-identical) results across runs.
- **Performance budget**: Target 60+ fps on mid-range laptops / recent phones at 1280×800-ish. dpr cap, texture atlasing, instanced props, shadow-map discipline, optional "low" preset that disables heavy models/post.
- **Asset catalog & tools**: Small JSON/TS manifest (id, source, license, LOD levels, tags, compatible body shapes). CLI or small Vite plugin for import/validation. Blender addon or script for authoring CC0 pieces into the catalog.
- **Quality gates**: Automated (poly count, UV sanity, material channels) + human review for hero assets in bundled worlds.
- **Cost control**: Generation happens at world-compile / admin time or on explicit creator request, not per player session. Cache generated assets. Offer "curated only" vs "AI-augmented" world variants.
- **Fandom consistency**: Ingest pipeline (world-ingest + anime-ingest) should emit suggested prompts + reference image seeds so generated characters/props match source tone and existing appearance metadata.

**Near-term implementation sketch** (first vertical):
- Add 10–20 high-value curated props (benches, lamps, stalls, training dummies, hero set pieces) from Poly Haven / Kenney into the district worldgen as optional "detailed" layers.
- Expose a small admin/creator flow: "Generate character prop for this appearance" using one primary AI provider (start with Meshy free tier or 3D AI Studio trial) → preview → approve → store in world manifest + public/assets.
- Update character system to optionally load external GLB skin/attachments on the Quaternius rig.
- Update third-party-assets.md with the new sources and usage notes.

See also future `docs/asset-pipeline.md` (to be created after this PRD approval).

---

## 6. Lifelikeness & Protagonism Upgrades (Highest Leverage)

Directly implement the 5 highest-leverage builds from `docs/research-lifelikeness.md`, ordered by impact:

1. **Causal-trace "Chronicle" layer + player-causal recap** (Keystone, L)
   - Every memory, rumor edge, relationship delta, goal, and confrontation already has (or will gain) `chronicleId` provenance.
   - New first-class Chronicle event log (lightweight, queryable).
   - UI: "Why does A hate B?" surfaces the exact rumor chain and the player action/statement that seeded it.
   - Recap rewrite: "The grudge *you* triggered when you told C about A's secret..." (not "A confronted B").
   - Acceptance: Playtest shows players can correctly explain 3+ major world changes as caused by their prior inputs.

2. **Reflection layer** (M)
   - Importance-gated (sum of recent memory importance crosses threshold).
   - LLM produces 3–5 belief statements citing source memory IDs.
   - Beliefs become first-class memories that feed dialogue context, goal selection, director, and future reflections.
   - Measure: Smallville-style believability lift in identity-stability probe.

3. **Sycophancy anchoring + divergence nudges** (S, cheap)
   - Every dialogue (and proposal) prompt re-injects the NPC's standing beliefs/values/flaws as non-negotiable.
   - Style/diction anchor from traits.
   - Optional post-gen embedding check; if multiple NPCs converge (cosine >0.85), force divergence rewrite.
   - Probes: sycophancy probe + multi-NPC divergence check become build blockers.

4. **Action Awareness / coherence pre-flight** (M)
   - Before any LLM utterance or proposed action is accepted: validate against canonical state (location, current goal, nearby actors, last action, body posture if known).
   - Reject/regenerate with specific feedback ("You said you were at the plaza but your last move put you in the tavern").
   - Extends the existing action validator pattern.

5. **Player-as-subject rumors + Nemesis-lite** (M)
   - Extend rumor engine so witnessed player actions become high-visibility diffusable rumors *about the player*.
   - Combat defeats tag the victor NPC with a memorable "bested the player" high-importance memory + director promotion hook.
   - NPCs reference your specific deeds in dialogue without the player having to remind them.

**Evaluation harness** (run with every one of the above):
Extend `src/probes/` and the existing five-probe checklist (identity-stability interview, cross-session memory coherence, sycophancy probe, divergence check, world-state grounding audit <2% hallucinated claims).

---

## 7. Other Feature Epics (Phased)

**Combat & Feel (near)**: Rigged CC0 or AI-generated character bodies on the shared skeleton; posture/stagger system; character-specific move selection; better hit reactions and camera work. Reconcile more combat outcomes through sim (duels, reputation consequences).

**Interior & Location Depth (near-mid)**: Quest NPCs and interactable clues inside anchor buildings. Functional interiors (crafting benches, evidence boards) that affect world state. Larger variety via asset catalog.

**Scale & Persistence (mid)**: Larger multi-district cities with performant nav + culling. Multi-session memory compression via reflection. Cross-session "echoes" (light reputation that carries between plays of the same world source). Save export / shareable chronicles.

**Creator & Ingest (mid)**: Improved world-source review UX. Visual editor for tweaking locations/appearances (still compiles to the same schema). One-click "generate consistent cast" from fandom references using the asset pipeline. Versioned world sources.

**Media & Atmosphere (ongoing + mid)**: Richer procedural + curated set dressing. Optional high-quality offline cutscene assets (curated or carefully generated). Ambient audio evolution. Portrait and "postcard" generation that matches the 3D look.

**Social & Multi (long)**: Optional shared-world hints (multiple players in one DO? or asynchronous echoes). Player-run factions or vendettas that persist. Exportable "legends" mode for community storytelling.

**Non-functional**:
- Browser perf & accessibility remain first-class.
- AI cost per active session stays bounded (tiering, reflection caching, proposal volume caps, local option).
- Strong regression coverage (probes + web3d tests + playwright smoke) so model or asset changes don't silently degrade lifelikeness or feel.
- Licensing & attribution hygiene.

---

## 8. Phased Roadmap (High-Level)

**Phase 0 — Foundation Polish (Q3 2026, ~1–2 months)**
- Combat polish + rigged character bodies (Quaternius base + first catalog assets).
- Basic Chronicle provenance wiring + one player-causal recap surface (toasts or journal panel).
- First asset pipeline vertical: 10–20 curated props + one AI generation flow for custom characters/props (Meshy/Tripo or 3D AI Studio). Update `docs/third-party-assets.md`.
- Reflection prototype on importance threshold.
- All five lifelikeness probes instrumented and passing on baseline.
- Success gate: `pnpm verify:readiness` + lifelikeness probe run green; one playtest session where a player can name 2+ specific causal chains they triggered.

**Phase 1 — Living City Fidelity (late 2026)**
- Full hybrid asset pipeline in production use for bundled worlds (curated + generated + procedural mix).
- Complete keystone Chronicle + beautiful causal-trace UI (queryable "why" view + rewritten recaps everywhere).
- Sycophancy anchoring + divergence + coherence checks live and probed.
- Deeper interiors + first functional location gameplay (clues that feed rumors/quests).
- Player-as-subject rumors + basic Nemesis-lite defeat memory.
- Larger city stress-test + perf budgets met.
- Success: Players in unscripted 30+ min sessions report "the world reacted to me" and can reconstruct the chain from UI alone. Visual variety visibly higher in screenshots/playtests.

**Phase 2 — Reflective Worlds & Creator Leverage (2027)**
- Mature reflection (beliefs drive behavior and director; multi-hop reflection).
- Creator tools: visual schema editor, reference-image → consistent cast generation, world versioning/publishing.
- Multiple fandoms with distinct visual languages (curated asset packs per tone).
- Media layer expansion (optional high-fidelity cutscene packs for key beats; careful cost controls).
- Evaluation: Longitudinal session studies + public playtest program.
- Success: Third-party creators successfully publish and playtest their own reviewed worlds end-to-end.

**Phase 3 — Platform & Scale (2027–2028)**
- Multi-world persistence / echoes / light social features.
- Advanced simulation (needs/replanning, larger agent counts with smart culling, economy prototypes).
- Export / community sharing of chronicles, replays, and world forks.
- Optional deeper media (AI video for trailers / key cinematic moments only).
- Business / hosting model clarification if usage grows.

Each phase must ship with updated probes, docs, and at least one "hero playtest" that demonstrates the new legibility or fidelity leap.

---

## 9. Risks & Mitigations

- **Asset generation quality variance / cleanup cost**: Mitigate with strong reference images from ingest, human review gate for bundled worlds, remesh/LOD tools, and fallback to curated/procedural.
- **AI cost explosion at scale**: Strict generation-at-compile time, aggressive caching, credit budgets per world, local fallback always viable, "curated only" world flag.
- **Lifelikeness regressions as models change**: Probes are build-blockers. Pin model tiers. Reflection + anchoring make the system more robust to model drift.
- **Browser perf death by a thousand props**: Asset catalog must carry LOD + budget metadata. Worldgen stays smart about density. Low-fidelity toggle.
- **Licensing / legal on AI outputs**: Default CC0 curated first. Paid plans for private generations. Clear attribution UI for any CC-BY assets. Document everything.
- **"Empty stage" or journal trap**: Chronicle + player-subject rumors + objectives are the explicit countermeasures. Director pressure keeps stakes visible.
- **Scope creep into video or full MMO**: Ruthlessly scope. 3D spatial + legible autonomous agents + compiled worlds is the spine. Everything else is support.

---

## 10. Success Metrics (Beyond Shipping Features)

**Lifelikeness (primary)**:
- Identity-stability, coherence, divergence, grounding, sycophancy probes (target: no regression from baseline; improvement on reflection/sycophancy axes).
- Playtest "causal reconstruction" score: % of players who can correctly explain 3 major world events as player-caused after one session.

**Fidelity & Feel**:
- Visual variety rating (blind A/B of M4 vs Phase 1 screenshots by target users).
- Session length & return rate in internal + invited playtests.
- "I caused that" anecdotes captured in playtest notes.

**Creator / Platform**:
- Time from reviewed world source to playable 3D town (target: minutes for basic, <1 day with custom assets).
- Number of successfully imported + played non-bundled worlds.

**Engineering Health**:
- `pnpm verify:readiness` always green.
- Per-session AI cost stable or declining.
- Browser perf budgets met on reference devices.

---

## 11. Open Questions

- Exact balance of curated vs. AI-generated per world (creator toggle? quality slider?).
- How far to push character body generation vs. shared rigs + attachments.
- Whether full multi-player (simultaneous) is ever needed vs. strong asynchronous echoes + shared chronicle viewing.
- Pricing / hosting model if we expose world publishing to external creators.
- Depth of economic simulation (do we ever need a real economy, or is social reputation + quests enough?).

---

## 12. References & Further Reading

- `docs/research-lifelikeness.md` (the evidence backbone for the lifelikeness workstreams)
- `docs/web3d-architecture.md`
- `docs/ai-dungeon-differentiation.md`
- `PROJECT_STATUS.md`
- Original research: Generative Agents (Smallville), Concordia, SOTOPIA, PIANO, SHARP, Nemesis / Wildermyth / Dwarf Fortress Legends Mode patterns, Sylvester "Simulation Dream".
- Asset sources researched 2026-06: Poly Haven (CC0), Kenney (CC0), Meshy, Tripo, 3D AI Studio, Rodin/Hyper3D, Sloyd, Luma capture, BlenderKit, Sketchfab CC filters, etc. (see evolving `docs/third-party-assets.md`).

---

**Deferred (2026-06-20):** All "next immediate actions" below are parked until
`docs/core-gameplay-fix.md` §5 clears. This PRD remains the durable north star for
*planning only* — not current execution.

1. Create `docs/asset-pipeline.md` (detailed implementation spec + catalog schema).
2. Update `docs/third-party-assets.md` with the new curated + generator sources and usage policy.
3. Wire the first Chronicle provenance fields + a minimal recap rewrite as a spike.
4. Stand up a small asset catalog + 1–2 Poly Haven / Kenney props in a test district.
5. Schedule a focused playtest on "player-caused drama legibility" once Chronicle + reflection prototype land.

This PRD is the durable north star. Every major build should be able to answer: "How does this advance legibility of player impact, asset fidelity, or autonomous lifelikeness while staying true to the compiled-world + spatial + browser DNA?"

---

*End of PRD. Treat as living document — update with dates and evidence as phases complete.*