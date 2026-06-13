# Retro: Local dev server → Cloudflare Workers + Durable Objects deploy

**Date**: 2026-06-12 (CF worker deploy commits + 2D client retirement)  
**Phase**: From `pnpm dev:server` local Vite/Node sim → edge Workers + DO

---

## What changed

The simulation server moved from a local Node process (`src/server.ts`) to a
Cloudflare Worker with one Durable Object per session (`worker/src/session-do.ts`).
The 3D Vite build is served as Workers Assets from the same deploy. The 2D Phaser
client was deleted in the same phase.

---

## What went well

- One `wrangler deploy` now ships both the static site and the live backend with
  zero separate server ops.
- The DO actor model eliminated race conditions between the agent loop timer and
  incoming HTTP requests that required manual mutex logic in the Node server.
- DO hibernation means sessions stay live across page refreshes without paying
  for idle compute — a real cost difference for a game with irregular session
  patterns.
- The service binding for the LLM gateway (`GATEWAY` in `wrangler.jsonc`)
  resolved the same-account workers.dev blocking issue cleanly once it was
  understood.

## What was painful

- Discovering that same-account Worker-to-Worker calls over `workers.dev` are
  silently blocked cost significant debugging time. Not documented prominently in
  Cloudflare's own docs at the time.
- CF Worker env vars are strings only; the sim code that expected numeric env
  vars (`LLM_TIMEOUT_MS`, etc.) needed explicit `parseInt` casts.
- DO SQLite storage requires migrations (`wrangler.jsonc` `migrations` block).
  Adding `new_sqlite_classes` for `GameSessionDO` was a non-obvious step that
  caused deploy errors before it was added.
- DO memory limit (128 MB) is tight for large imported world JSON with many NPCs
  and memory entries. The debounced persist and lazy engine init mitigate this
  but may need revisiting as worlds grow.

## Lessons captured

→ `docs/lessons.md` §"Durable Object RPC patterns" covers the same-account
   service binding discovery and the debounce pattern.  
→ `docs/decisions.md` ADR-004 covers the KV vs D1 vs DO choice rationale.

## What carries forward

- The `src/server.ts` Node path still works for local dev (`pnpm dev:server`)
  and is the faster iteration loop; the DO is production-only.
- Rate limiting is implemented inside the DO (`RATE_LIMITS` map); it is session-
  scoped, not account-scoped. A future shared rate-limit layer would need KV or
  a separate Worker.
