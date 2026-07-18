---
title: Architecture overview
description: Layers, runtime surfaces, critical invariants, and what was retired.
---

# Architecture overview

Aliveville is a TypeScript simulation server + Vite/React Three Fiber 3D
client + Cloudflare Worker (Durable Objects, SSE, `GATEWAY` binding) +
Vitest/Playwright probes.

## Layers

```
web3d/                3D browser client (R3F + Three + Rapier)
  └─ talks to /game/api/* with ?session= UUID from localStorage
src/                  simulation server (runtime-agnostic)
  ├─ simulation.ts    core tick loop, world state, combat, economy
  ├─ agents.ts        autonomous agent loop, memory, reflection
  ├─ dialogue.ts      LLM dialogue + engine-validated actions
  ├─ director.ts      villain plan, story pressure, mood
  ├─ llm/router.ts    OpenAI-compatible LLM router (tiers + fallbacks)
  ├─ world-ingest.ts  reviewed world-source ingest
  └─ probes/          lifelikeness regression harness
worker/               Cloudflare Worker edge deploy
  ├─ index.ts         route /game/api/* → DO, fall through to ASSETS
  ├─ session-do.ts    GameSessionDO: one per visitor, hibernates, SQLite persist
  └─ catalog.ts       bundled world catalog (not filesystem scan)
astro-landing/        marketing site (Astro → Cloudflare Pages) — do not modify
```

## Runtime surfaces

- **Game (Worker)**: https://aliveville.com/game — Cloudflare Worker `aliveville`
  on route `aliveville.com/game*`; `GameSessionDO` per session; static 3D
  assets via `ASSETS` binding.
- **Landing (Pages)**: https://aliveville.com/ — Astro landing, project
  `aliveville`, output `astro-landing/dist`, CI `deploy-aliveville.yml`.
- **Local dev**: sim server :5174; 3D client :5175/game/ (proxies `/game/api`
  → :5174).

## Critical invariants

- **The LLM never directly mutates the world.** Every LLM response is parsed as
  a structured JSON action, validated against the engine's action schema and
  current world state, and rejected if invalid. See
  [`adr-008-engine-validated-json-actions.md`](./decisions/adr-008-engine-validated-json-actions.md).
- **One DO per visitor session.** No cross-player state bleed. The DO
  hibernates when idle and re-hydrates from SQLite on the next request. See
  [`adr-004-durable-objects-per-session.md`](./decisions/adr-004-durable-objects-per-session.md).
- **Deterministic worldgen.** Same world JSON → same 3D town (mulberry32 hash
  of `worldId:locationId:…`). See [`web3d-client.md`](./web3d-client.md).
- **NPC/player positions are imperative, not React state.** Driving positions
  through the React `position` prop triggers R3F reconciliation every frame.
  See [`web3d-client.md`](./web3d-client.md) §"Sim ↔ client sync".
- **DO persist is debounced (5 s).** Writing world JSON on every 4 s tick
  saturates the DO SQLite write budget. See `worker/src/session-do.ts`.
- **Same-account Worker→Worker fetches go through a service binding.** Calls
  over `workers.dev` URLs hang or return 403. The `GATEWAY` service binding in
  `wrangler.jsonc` is required. See
  [`adr-010-cloudflare-workers-assets.md`](./decisions/adr-010-cloudflare-workers-assets.md).

## Auth and isolation

- No user login; session UUID isolates worlds. `?session=` or `x-session-id`.
- `ADMIN_TOKEN` + `x-admin-token` gates `/api/restore`.
- Rate limits per session: dialogue 20/min, tick 120/min, replace_world
  6/10min. Max 30 sessions; idle eviction; 10+ min catch-up.

## What was retired

- **2D Phaser client** — deleted 2026-06-12; see
  [`adr-012-phaser-retired.md`](./decisions/adr-012-phaser-retired.md).
- **Unreal bridge** — shelved; out of scope.
- **One-off bench scripts** — superseded by `src/probes/`.

## Deep dives

- 3D client: [`web3d-client.md`](./web3d-client.md)
- LLM routing: [`llm-routing.md`](./llm-routing.md)
- Probes harness: [`probes-harness.md`](./probes-harness.md)
- Decisions: [`decisions/`](./decisions/)
