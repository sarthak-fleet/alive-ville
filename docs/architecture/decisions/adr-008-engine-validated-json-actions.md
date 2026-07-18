---
title: ADR-008 — Structured JSON actions (LLM proposes, engine validates)
description: The LLM never writes directly to world state; every action is engine-validated.
---

Decided ~2026-05-08.

## Context

NPCs must be able to move, give items, start quests, fight, and follow — but
LLM output can be malformed, hallucinated, or logically invalid.

## Decision

Every LLM response is parsed as a structured JSON action object
(`{type, target, ...}`), validated against the engine's action schema and
current world state, and rejected if invalid. The LLM never writes directly to
world state.

## Rationale

Stated in [`init.md`](../../archive/init.md) §16: "The LLM never directly
mutates the world." Engine-validated actions are the single largest technical
differentiator vs. AI Dungeon-style free text continuations — they produce
reproducible, replayable, auditable state transitions. See also
[`positioning.md`](../../product/positioning.md) §"Differentiation Pillars".

## Tradeoffs

Constraining the LLM to a fixed action vocabulary limits expressiveness. The
vocabulary has grown (move, give, offer_quest, complete_quest, fight, follow,
unfollow, create_quest, remember, spar, disposition) to reduce that tension
without losing validatability.
