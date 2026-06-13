# Project Status

Last updated: 2026-06-12

## Active Track

Aliveville is a browser-playable AI world simulator deployed at **aliveville.com/game**.

- **Sim engine** — `src/` (simulation, agents, director, LLM routing, world-ingest)
- **3D client** — `web3d/` (walkable procedural town, third-person controller, combat, cutscenes)
- **Cloudflare Worker** — `worker/` (edge deploy, session-DO, SSE)
- **Landing site** — `astro-landing/` (LIVE, deployed by CI — do not touch)
- **Probes harness** — `src/probes/` (lifelikeness regression suite)
- Architecture + milestones: `docs/web3d-architecture.md`

## Done

- **3D M1**: walkable district, third-person controller, follow camera, procedural toon characters, wandering NPCs, talk/quest/objective/toast HUD.
- **3D M2 "living town"**: full city generates from schema (locations + streets), NPCs walk between districts along street graph, agent loop streams over SSE, world-import screen.
- **3D M3 "combat"**: real-time melee — 3-hit combo, dodge roll with i-frames, Q lock-on, enemy AI, HP bars, hit sparks/damage numbers, death/respawn. Finisher actions reconcile to sim.
- **3D M4 "director events"**: letterboxed cutscenes on director actions, villain-plan stage advances; rising story pressure shifts city mood (fog, sky, sun).
- **3D beauty pass**: facade textures, toon trees, rooftop clutter, bloom/vignette/ACES/FXAA, night stars, minimap, pointer-lock mouse look, FOV kick, camera hit-shake, anime-chibi v2 characters.
- **LLM dialogue**: `POST /api/dialogue` generates in-character NPC replies, records memories, falls back to scripted tick-talk when no LLM key.
- **Enterable interiors**: anchor buildings have marked doors; entering teleports into a deterministic dollhouse room, exit door returns to street.
- **Frontier capability layer (2026-06-14)**: in-browser LLM on WebGPU (`@mlc-ai/web-llm`) wired into NPC dialogue with cloud fallback; first-party WebGPU compute (WGSL matmul) + isolated WebGPU render demo; Web Speech NPC TTS + dictation; WebXR VR mode (`@react-three/xr`); WebTransport detection; OPFS save; WebCodecs clip export; capability detection + "🧠 Local AI" panel + frontier legibility HUD; PWA (manifest + network-first service worker). See `docs/web-frontier-prd.md`.
  - **Verified (headless Chromium, 2026-06-14)**: app boots with zero console errors; town renders in-game; all HUD additions mount; the `<XR>` wrapper does NOT disturb normal rendering. Two bugs found+fixed by running it (manifest path doubled under Vite base; stray `@iwer/devui` "Enter XR" emulator button → `emulate:false`). All commits pushed to `origin/main` (through `a101aaf`).
  - **NOT yet verified** (needs a real-GPU browser + interaction): actual local-LLM load/generation, the compute/render benchmark figures, NPC TTS/dictation, a real VR headset.
  - **Performance NOT addressed**: the game still renders via WebGL (R3F/Three) — the frontier work did not touch frame performance. "Latest tech" ≠ smooth; smoothness is a separate profiling/optimization pass (draw calls, shadows, postprocessing cost, per-frame JS/React churn, NPC update loops). Local LLM inference can actually *hitch* frames if run during gameplay.
- **Currency + stakes (2026-06-14)**: coin economy — wallets on player/NPCs, item prices, quest/loot rewards, buy/sell actions, a 20-coin starting purse, a 🪙 HUD counter, and a defeat penalty (victor takes 25%). Tested (`tests/currency.test.ts`, 6 cases). In-game buy/sell **UI (vendor/shop)** is still a follow-up — earning + balance are visible, spending needs a screen.
- **Performance pass (2026-06-14)**: one safe per-frame allocation removed (`UP_AXIS`); the real device-profiled tuning plan lives in `docs/performance-notes.md` — NOT done blind.

## Known issues
- `tests/web3d-identity.test.ts` `buildVariation` fails (4 cases) on clean HEAD — pre-existing, likely from the VRM-animation revert (commit 5ee0151) collapsing character scale variety. Pre-existing lint errors in `Npc.tsx` etc. Both predate the frontier work.

## Planned Next

See the living north-star document: `docs/future-prd.md` (2026–2028 vision covering asset fidelity pipeline, lifelikeness upgrades (Chronicle + reflection + coherence), combat/interior polish, creator tools, and phased roadmap).

Two new planning docs (2026-06-14), gated in this order:
1. `docs/core-gameplay-fix.md` — **playability prerequisite**. Make the core loop
   fun (goals/onboarding/macro-loop + tuning) via one vertical slice ("The
   Rival"). NOTE: combat is already complete/animated/client-authoritative — the
   gap is the macro loop + presentation, pending a playtest to confirm.
2. `docs/web-frontier-prd.md` — web-platform capability showcase (WebGPU
   render+compute, local LLM inference, etc.), much sourced from `../tinygpt`.
   **Gated**: do not start until core-gameplay-fix §5 acceptance bar is met.

Immediate next (pre-PRD execution):
1. Playtest to locate the real "very bad" feel (diagnosis from code alone proved unreliable).
2. Interior depth: quest NPC inside anchor building, interior interactables/clues.
3. Enable LLM mode: add `LLM_API_KEY` to `.env`.

## Durable References
- `docs/future-prd.md` — Future PRD (asset strategy from Poly Haven/Kenney/Meshy/Tripo/Rodin/3D AI Studio research, lifelikeness from research-lifelikeness.md).
- `docs/research-lifelikeness.md` — Evidence-ranked mechanisms and gap analysis (the 5 highest-leverage builds).
- `docs/web3d-architecture.md` + `docs/ai-dungeon-differentiation.md` — Current shape and positioning.

## Retired (archived docs)

- **2D Phaser client** (`web/`) — deleted; see `docs/archive/agent-town-handoff.md`
- **Unreal track** (`unreal/`, `src/unreal-bridge.ts`) — shelved, code deleted
- **One-off bench/eval scripts** (`src/completion-benchmarks.ts` etc.) — deleted; superseded by `src/probes/`
- **Original init brief** — archived at `docs/archive/init.md`
