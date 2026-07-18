---
title: ADR-010 — Cloudflare Workers + Workers Assets for the full deploy
description: One wrangler deploy ships the static 3D client and the DO-backed sim Worker.
---

Decided ~2026-06-12.

## Context

The 3D client (static Vite build) and the sim server need to be colocated at
the edge for low-latency SSE and DO access from the same origin.

## Decision

`wrangler deploy` publishes the Vite build as Workers Assets and the DO-backed
worker as a Worker on `aliveville.com/game*`. The LLM gateway is reached via a
Workers service binding to avoid same-account `workers.dev` cross-worker fetch
restrictions.

## Rationale

Workers Assets serves static files from Cloudflare's CDN with zero cold start;
the same Worker handles `/api/*` routes backed by the DO. A single `wrangler
deploy` command ships everything. The service binding for the LLM gateway is
required because same-account Workers cannot call each other over `workers.dev`
URLs — a non-obvious CF platform restriction that caused silent failures
before the binding was added.

## Alternatives considered

- Separate static CDN + VPS for the sim
- Vercel Edge Functions (no Durable Objects)
- Self-hosted Hono/Bun (no hibernation, manual ops)

## Tradeoffs

CF free-tier DO limits (128 MB memory, 30 s CPU per invocation) constrain
world size and agent loop tick budget. The debounced persist and the 4 s loop
interval are tuned to stay within these limits.
