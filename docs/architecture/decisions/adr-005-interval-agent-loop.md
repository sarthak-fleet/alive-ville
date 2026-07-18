---
title: ADR-005 — Interval-based agent loop (turn-by-turn)
description: Polling agent loop instead of streaming/event-driven, with a stepping guard.
---

Decided ~2026-05-17 (agent loop commits).

## Context

The game needs NPCs to keep acting when the player is idle, without blocking
the player's direct actions (talk, move, fight).

## Decision

`createAgentLoop` fires on a configurable interval (default 4 s), runs one
`engine.tick()`, and emits a tick summary over SSE. The loop skips if a tick is
already in progress (`stepping` flag).

## Rationale

A polling loop decouples the agent cadence from model latency — if an LLM call
takes 3 s the loop just misses that interval, rather than stacking. Turn-by-
turn ticks produce a discrete, replayable event log that feeds the chronicle
and checkpoint system. Streaming continuations (a-la GPT assistant threads)
would make deterministic replay harder and increase coupling to one provider's
API shape.

## Alternatives considered

- SSE-driven push from model stream
- WebSocket bidirectional loop
- Immediate re-trigger after each tick

## Tradeoffs

Fixed-interval polling means the world has a visible "heartbeat" cadence. Under
heavy LLM load the loop naturally self-throttles. The minimum interval is
clamped to 250 ms to prevent runaway calls during tests.
