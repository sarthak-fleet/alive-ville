---
title: ADR-004 — Durable Objects per visitor session
description: One GameSessionDO per visitor instead of KV or D1 for sim state.
---

Decided ~2026-06-12 (CF worker deploy).

## Context

Each player session needs isolated, mutable world state (NPCs, quests,
memories, agent loop, SSE fan-out) with no cross-player bleed. State can be
large (full world JSON) and is mutated on every tick (~4 s interval).

## Decision

One `GameSessionDO` per visitor. World state persists to DO SQLite storage; the
DO hibernates when no client is connected and re-hydrates on the next request.

## Rationale

DOs provide actor-model isolation — one goroutine-equivalent per session —
which eliminates race conditions between the agent loop timer and incoming HTTP
requests without locks. KV has eventual consistency and no per-key compute
isolation; D1 is a shared relational database ill-suited to frequent full-
document overwrites. The DO hibernation API keeps the session alive across page
refreshes without paying for idle compute.

## Alternatives considered

- KV (no isolation, eventual consistency)
- D1 (relational schema mismatch, shared DB for per-session state)
- Stateful server on a VPS (no hibernation, manual scaling)

## Tradeoffs

DOs are single-region (the session sticks to the first colo that handled the
request). World JSON can grow large; the debounced persist (5 s) and a JSON
snapshot write are sufficient for current scale but would need chunking if
world state grew beyond a few hundred KB. See `worker/src/session-do.ts`.
