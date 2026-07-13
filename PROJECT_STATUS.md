# ai-game — PROJECT STATUS

**Portfolio state (2026-07-13): Support / capped experiment.** The Rival-readiness milestone is closed for now under an explicit product-owner deferment. No human fun/not-fun verdict was recorded; require one before resuming feature expansion.

Last updated: 2026-07-13

## Why / What

**Aliveville** is a browser-playable AI world simulator at **aliveville.com/game**. The product thesis: a living town where autonomous NPC agents, quests, combat, and LLM dialogue make a small district feel alive — not a tech demo of frontier APIs.

**Repository naming:** local checkout is `ai-game`; GitHub repository is `sarthak-fleet/alive-ville`; public product name is AliveVille.

**Users:** Players exploring a 3D anime-chibi town; fleet operators deploying the sim edge stack; future creators importing fandom/original worlds.

**Constraints:** Active engineering is gated on core playability (`docs/core-gameplay-fix.md` §5 — "The Rival" vertical slice, guided first 60s, fun verdict). XL north-star work (asset pipeline, creator platform, Chronicle maturity) stays parked until that bar clears. `astro-landing/` is live marketing — do not modify.

**IN scope:** 3D client (`web3d/`), simulation server (`src/`), Cloudflare Worker edge (`worker/`), probes, headless playtests.

**OUT of scope:** 2D Phaser client (`web/` — retired), Unreal bridge, broad marketing changes, production frontier deploy without real-device GPU verification.

## Dependencies

### External

- **Cloudflare:** Workers, Durable Objects, Pages (landing), `ASSETS` binding, SSE transport.
- **LLM:** `free-ai-gateway` via Worker `GATEWAY` service binding; local-ai → CLI → `LLM_BASE_URL` gateway fallback (`src/llm/router.ts`).
- **3D/runtime:** `three`, `@react-three/fiber`, `@react-three/rapier`, `postprocessing`, Rapier physics.
- **In-browser AI:** `@mlc-ai/web-llm`, `kokoro-js` (TTS), Web Speech API, WebGPU WGSL compute.
- **Analytics:** PostHog (`posthog-js`, client-side).
- **Wrangler secrets (names only):** `LLM_API_KEY`, `ADMIN_TOKEN`. Vars: `LLM_BASE_URL`, `LLM_MODEL_*`, `LLM_TIMEOUT_MS`, `LLM_PROJECT_ID`.

### Internal (fleet)

- **free-ai-gateway:** `GATEWAY` service binding for production LLM routing; `LLM_PROJECT_ID=ai-game`.
- **astro-landing/:** Separate Cloudflare Pages deploy for aliveville.com marketing (CI: `deploy-aliveville.yml`).

### Stack & commands

**Stack:** TypeScript sim server + Vite/React Three Fiber 3D client (WebGL/Rapier/postprocessing) + Cloudflare Worker (Durable Objects, SSE, `GATEWAY` binding) + Vitest/Playwright probes. Key deps: `three`, `@react-three/fiber`, `@react-three/rapier`, `@mlc-ai/web-llm`, `kokoro-js`, `zustand`, `posthog-js`, `wrangler`.

| Command | Purpose |
|---------|---------|
| `pnpm install` | Install deps (Node ≥22) |
| `pnpm dev:server` | Sim server → http://localhost:5174 |
| `pnpm dev` | 3D Vite client → http://localhost:5175/game/ (proxies `/game/api` → :5174) |
| `pnpm serve` / `pnpm serve:3d` | One-shot sim server; `serve:3d` sets `WEB_ROOT=./dist/site` |
| `pnpm build` / `pnpm build:3d` | Production 3D build → `dist/site/game/` |
| `pnpm test` | Vitest (60 test files) |
| `pnpm test:gameplay` | Subset: gameplay-loop, world, quests |
| `pnpm probe:lifelikeness` | Lifelikeness regression CLI (`src/probes/`) |
| `pnpm playtest:game` | Headless Playwright 3D smoke + screenshots |
| `pnpm playtest:astro-landing` | Astro landing build/preview smoke |
| `pnpm verify:readiness` | typecheck + lint + test + build:3d |
| `pnpm typecheck` / `pnpm lint` / `pnpm format` / `pnpm check` | TS, ESLint, Biome |
| `npx wrangler deploy` | Deploy Worker after `pnpm build:3d` |

**Env files:** `.env` (local, from `.env.example`).

## Timeline

- **2026-07-13** — Rival local acceptance completed on `agent/rival-readiness`: a non-modal, persisted move → talk → fight → consequence guide replaces the static controls dump for `rival_duel`; Rival pressure now waits until guide acknowledgement; malformed `score` fields in authored tensions were corrected to finite `pressure`; local RUM no longer sends production beacons. `pnpm verify:readiness` passes (62 files / 463 tests plus production 3D build), strict OpenSpec validation passes, and the Rival headless flow completes at desktop and 390×844 with zero browser errors. The product owner closed this capped milestone for now and deferred the human playtest; no fun/not-fun verdict is claimed.
- **2026-07-05** — GOD-inspired Director Console shipped: optional in-game right rail for operators to pause/resume/step the live agent loop, inspect tick/pressure/objective, scan residents, and read the latest trace/Chronicle events while keeping normal play HUD closed by default. Archived OpenSpec change: `openspec/changes/archive/2026-07-05-add-director-console/`; durable spec: `openspec/specs/director-console/spec.md`.
- **2026-07-03** — "The Rival" vertical slice authored: `worlds/rival-duel.json` — a self-contained scenario with one named rival NPC (Kael) whose goal conflicts with the player's, a 3-NPC camp (Kael, Marta, Claim Boss Verna), 5 locations, 3 quests (clear shaft, expose theft, showdown), combat stats for the rival, villain plan with rising pressure, and a clear win/lose condition. 7 tests in `tests/rival-duel.test.ts` verify world structure, arc creation, quest loops, and reachability. The spine from `docs/core-gameplay-fix.md` §6 is now wired to a concrete playable scenario — fun-tuning and the human playtest verdict remain.
- **2026-07-02** — Added React `<ErrorBoundary>` to web3d app (wrapping `App` in `main.tsx`); removed unused `posthog-js` dependency.
- **2026-06-20** — Headless smoke re-verified: `pnpm playtest:game` exit 0, zero console/page errors.
- **2026-06-14** — Web-frontier capability layer shipped: in-browser LLM, LocalBrain panel, WebGPU benchmarks, Kokoro TTS, OPFS saves, WebCodecs export, PWA, capability detection HUD.
- **2026-06 (M4)** — Letterboxed cutscenes, villain-plan advances, story-pressure mood, intro cinematic.
- **2026-06 (M3)** — Real-time melee: combo, dodge i-frames, lock-on, enemy AI, HP bars, death/respawn, finisher reconciliation.
- **2026-06 (M2)** — Full city from schema, NPCs on street graph, agent loop over SSE, world-import screen.
- **2026-06 (M1)** — Walkable district, third-person controls, procedural toon characters, talk/quest/objective HUD.
- **Earlier** — Cloudflare Worker `aliveville` on `aliveville.com/game*`; `GameSessionDO` migration v1; Astro landing live; retired 2D Phaser client, Unreal bridge, one-off bench scripts (superseded by probes).

## Products

- **Game (Worker):** https://aliveville.com/game — Cloudflare Worker `aliveville` on route `aliveville.com/game*`; `GameSessionDO` per session; static 3D assets via `ASSETS` binding.
- **Landing (Pages):** https://aliveville.com/ — Astro landing, project `aliveville`, output `astro-landing/dist`, CI `deploy-aliveville.yml`.
- **Legal:** https://aliveville.com/privacy, https://aliveville.com/terms.
- **Local dev:** Sim server :5174; 3D client :5175/game/ (proxies `/game/api` → :5174).
- **Packages/surfaces:** `web3d/` (3D client), `src/` (sim server), `worker/` (edge DO), `astro-landing/` (marketing, do not modify), `src/probes/` (lifelikeness harness).

## Features (shipped)

### Simulation engine (`src/simulation.ts` and modules)

- Core tick loop: player actions, NPC movement, items, interactables, spatial exits, world clock.
- Autonomous agent loop with start/stop/step, checkpoints, restore-checkpoint (local only), autostart option.
- Director system: villain-plan stages, story pressure (0–100), city mood shifts.
- Arc progression: Training → Trial → Confrontation; XP; `sessionOutcome` win/lose; `nextObjective` HUD spine.
- Quest system with objectives, hints, pickup/give flows; story progress phases.
- Coin economy: 20-coin starting purse, wallets on player/NPCs, item prices, quest/loot rewards, buy/sell actions, 25% defeat penalty (vendor/shop UI still open).
- Rumor diffusion → confrontations; player rumors; social consequences engine.
- Chronicle provenance events; reflection due/trigger; coherence pre-flight (location/goal/presence/memory).
- Consolidation (sleep-time impressions); catch-up offline replay ("while you were away").
- Memory: relational recall, graduated importance, optional semantic recall via embeddings (`MEMORY_SEMANTIC_RECALL=1`).
- Combat pacing: chip damage, dodge windows, stance ranges; follower combat.
- NPC voice fingerprints, divergence nudges; ambient barks; living-world behaviors.

### World ingest & story

- Bundled worlds: `ashment`, `lanternmere`, demon-slayer, one-punch-man (+ OPM ingest source).
- `POST /api/import-world-source` (alias `/api/import-anime`): reviewed world-source ingest.
- `POST /api/import-fandom`: fandom wiki query → world source → replace world.
- `GET /api/story-package`, `POST /api/import-story-package` (local server only).
- Story dialogue fallback when LLM disabled (`GAME_MODE=story`); story options via `/api/dialogue/choose`.
- Portrait generation queue when `PORTRAITS_ENABLED=1`; `GET /api/portrait/:npcId`.

### HTTP API — local server (`src/server.ts`, :5174)

- `GET /api/state`, `POST /api/tick`, `GET /api/events` (SSE), `GET /api/worlds`, `POST /api/worlds/select`.
- `GET /api/save`, `POST /api/reset`, `POST /api/load` (OPFS multi-slot), `POST /api/restore` (admin).
- Agent loop: `/api/agent-loop/status|start|stop|step|restore-checkpoint`.
- Dialogue: `GET /api/dialogue/history`, `POST /api/dialogue`, `POST /api/dialogue/choose` (optional SSE stream).
- `POST /api/arc/event` (`kind: "spar_won"`).
- Session isolation via `?session=` or `x-session-id`; max 30 sessions; idle eviction; 10+ min catch-up.

### HTTP API — Cloudflare Worker DO (`worker/src/session-do.ts`)

- Same core paths as local except: no `story-package`, `import-story-package`, `load`, `restore-checkpoint`, `portrait`.
- World catalog from `catalog.ts` (not filesystem scan). `GATEWAY` binding for LLM calls.

### Architecture & auth

- Browser 3D client (`web3d/`) talks to `/game/api/*` with `?session=` UUID from `localStorage` → Cloudflare Worker routes API to per-visitor `GameSessionDO`.
- Worker serves static 3D assets via `ASSETS` binding; non-API paths fall through to built client.
- Each DO runs `createEngine(world)` + agent loop; SSE `/api/events` broadcasts ticks; debounced DO storage persists world JSON (~5s).
- Local dev bypasses Worker: Node `src/server.ts` with in-memory sessions, filesystem autosave, optional checkpoint files.
- LLM routing (`src/llm/router.ts`): local-ai → CLI → `LLM_BASE_URL` gateway; Worker injects env and uses `GATEWAY` service binding.
- No user login; session UUID isolates worlds. `ADMIN_TOKEN` + `x-admin-token` gates `/api/restore`.
- Rate limits per session: dialogue 20/min, tick 120/min, replace_world 6/10min.

### 3D client M1–M4 (`web3d/`)

- **M1:** Walkable district, third-person WASD + pointer-lock, follow camera, procedural toon characters, wandering NPCs, talk/quest/objective/toast HUD.
- **M2:** Full city from schema (locations + streets), NPCs on street graph, agent loop over SSE, world-import screen (`VITE_ENABLE_IMPORT=1`).
- **M3:** Real-time melee — 3-hit combo + input buffer, dodge i-frames, Q lock-on, enemy AI (approach/telegraph/strike/recover/strafe/retreat), HP bars, hit sparks, damage numbers, death/respawn, finisher reconciliation.
- **M4:** Letterboxed cutscenes on director actions, villain-plan advances, story-pressure mood (fog/sky/sun), intro cinematic.
- Enterable anchor interiors: dollhouse rooms, exit door returns to street.
- Beauty pass: facade textures, toon trees, rooftop clutter, bloom/vignette/ACES/FXAA, night stars, minimap, FOV kick, camera hit-shake, anime-chibi v2 + VRM paths.
- Audio: context music (combat/interior/city/village day-night), SFX (hit/hurt/death/victory/quest).
- Start flow: world picker, character creator (appearance/name/combat moves), OPFS save slots, continue current world.
- HUD: quest tracker, arc panel, session win/lose banner, coin display, FPS counter, Chronicle panel (J), recap modal.
- Director Console: optional operator rail for live pause/resume/step, loop status, current objective, resident roster, action trace, Chronicle summary, and checkpoint/event-log readout.
- Onboarding controls card (WASD/shift/mouse/E/F/space/Q). `?perf` → r3f-perf; `?nofx` disables postprocessing.

### Web-frontier capability layer (shipped 2026-06-14)

- In-browser LLM (`@mlc-ai/web-llm`) in NPC dialogue with cloud fallback.
- LocalBrain panel: capability pills, model load, on-device generation demo.
- WebGPU WGSL matmul benchmark (`gpu-compute.ts`) + isolated WebGPU plasma render demo (`gpu-render.ts`).
- Kokoro TTS (`kokoro-js`) + Web Speech fallback; dictation (STT).
- OPFS multi-slot saves on start screen + HUD chip.
- WebCodecs clip export chip in HUD.
- WebTransport detection pill (SSE remains transport; no live WebTransport).
- PWA: `manifest.webmanifest` + network-first `sw.js` (prod-only registration).
- FrontierHud: NPC count, backend pill, "no server" badge when local brain active.
- Capability detect: WebGPU, shader-f16, WASM SIMD/threads, WebNN probe, OPFS, COI.
- **Closed won't-do:** WebGPU game renderer swap, WebTransport/WebRTC live transport, Gaussian splatting, Whisper STT, WebNN inference path.
- **Doc drift:** WebXR/VR referenced in older docs but not in current codebase (no `@react-three/xr`).

### Edge & infra

- Cloudflare Worker `aliveville` on route `aliveville.com/game*`; `GameSessionDO` migration v1.
- Astro landing live at aliveville.com (CI: `deploy-aliveville.yml` → Pages project `aliveville`).
- Lifelikeness regression harness (`src/probes/`, `pnpm probe:lifelikeness`).
- Retired: 2D Phaser client, Unreal bridge, one-off bench scripts (superseded by probes).

### Tests (Vitest + Playwright)

- 62 Vitest files covering simulation, combat, dialogue, coherence, chronicle, currency, director, ingest, LLM router, server integration, Rival onboarding, and web3d identity/worldgen/UI/mood/minimap.
- Playwright: `game-shots.ts` (3D smoke plus Rival guide pause/resume acceptance), `astro-landing.ts` (landing smoke).

## Todo / Planned / Deferred / Blocked

### Planned

1. Interior depth: quest NPC inside anchor building, interior interactables/clues (`web3d/src/interiors/`).
2. In-game buy/sell vendor/shop UI for coin economy (`web3d/` HUD + `src/` economy actions).
3. Enable cloud LLM mode: add `LLM_API_KEY` to `.env` / `wrangler secret put LLM_API_KEY`.
4. Real-device verification of frontier GPU/AI/TTS features; deploy frontier build to prod when ready.
5. Port missing local-only endpoints to Worker DO if prod parity needed: `load`, `story-package`, `portrait`.

### Deferred

- **Human Rival playtest verdict** — The product owner closed the capped Rival-readiness milestone for now on 2026-07-13 without conducting the playtest. No fun/not-fun verdict is claimed. If feature expansion resumes, first complete a fresh Rival session without developer help and record the verdict plus any confusion, combat-feel, or consequence-legibility failures.
- **Future north star (2026–2028)** — asset pipeline (Poly Haven/Kenney/AI gen), full Chronicle UI everywhere, reflection maturity, sycophancy/divergence/coherence as build blockers, creator platform, multi-world persistence, Nemesis-lite, larger cities; gated on core-gameplay-fix §5.
- **Web-frontier remaining ops** — real-GPU browser checks for local LLM, compute benchmarks, TTS/dictation; local LLM can hitch frames during gameplay.
- **WebXR VR mode** — was in PRD scope but closed/not implemented in code.

### Blocked

- **Closure decision (updated 2026-07-13):** keep AliveVille as a support / capped experiment. The Rival-readiness milestone is administratively closed for now; the human verdict is deferred, not passed, and remains the first gate before any deferred north-star expansion.
- Worker DO missing 5 local-server endpoints (story-package, import-story-package, load, restore-checkpoint, portrait) — prod parity blocked until ported.
- Game worker deploy is manual (`pnpm build:3d && npx wrangler deploy`); CI does not deploy game.
