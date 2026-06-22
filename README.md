# Aliveville / AI World Simulator

Website: https://aliveville.com/game

Live marketing site: `ai-game/astro-landing` (Astro + Three.js). Deploys to Cloudflare Pages.

Aliveville is a browser-playable AI world simulator deployed at **aliveville.com/game**. The active client is the 3D browser game (`web3d/`). The simulation server, world ingest, autonomous agent loop, quests, saves, and LLM routing live in `src/`.

## Current Shape

- `src/`: simulation, agent loop, director, ingest, story package, LLM routing.
- `web3d/`: active 3D browser client (walkable town, combat, cutscenes, minimap).
- `worker/`: Cloudflare Worker edge deploy (session-DO, SSE).
- `astro-landing/`: public marketing site (LIVE — do not touch).
- `src/probes/`: lifelikeness regression probe harness.

## Run The Dev Environment

```sh
pnpm install
pnpm dev:server   # sim server on http://localhost:5174
pnpm dev          # 3D Vite dev server on http://localhost:5173
```

Open `http://localhost:5173`.

Useful server endpoints:

- `GET /api/state`: raw simulation state.
- `POST /api/tick`: advance simulation with a player action.
- `POST /api/import-world-source`: reviewed world-source ingest.
- `GET /api/story-package`: packaged story + cutscenes manifest.

## Verification

```sh
pnpm verify:readiness
```

Runs typecheck, lint, unit tests, and the 3D build.

<!-- ACTIVE-AI-TASK-LOG:START -->
## Future Vision

Living north-star (deferred): `docs/archive/future-prd-deferred-north-star-2026-06-12.md`. Gated on `docs/core-gameplay-fix.md` playtest bar — not an active sprint.

## Active AI Task Log

This section is maintained by the SaaS Maker Active-AI product/design loop so future agents do not reopen duplicate UI tasks.

- Business lane: Core/status context
- Rule: do not create another broad "improve the UI" task unless the acceptance criteria differ materially from the tasks listed here.
- Source of truth for task status: SaaS Maker task board. README entries are durable context only.

| Task | Status | Priority | Last known note |
| --- | --- | --- | --- |
| `a31f2db5` [fleet-audit] ai-game CI failing on main | done | high | 2026-06-04 09:21:38 |
<!-- ACTIVE-AI-TASK-LOG:END -->
