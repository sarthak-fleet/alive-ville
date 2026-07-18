---
title: ADR-007 — Tiered model selection
description: Four model slots (normal/quest/propose/research) tuned by call volume and quality need.
---

Decided ~2026-05-17.

## Context

Dialogue, ambient NPC proposals, quest/director beats, and world import all
have different quality and volume requirements.

## Decision

Four model slots:

- `LLM_MODEL_NORMAL` — dialogue
- `LLM_MODEL_QUEST` — quest-tier NPCs + director
- `LLM_MODEL_PROPOSE` — ambient agent loop (high call volume)
- `LLM_MODEL_RESEARCH` — fandom world import

## Rationale

Ambient proposals (`LLM_MODEL_PROPOSE` defaults to `cerebras-llama-8b`) run on
every tick for up to 10 NPCs; using a strong model there would 10× the cost.
Quest and director calls are low-volume but need reliable structured output, so
they use a stronger tier. Research/import calls need broad world knowledge but
not reasoning; they use a non-thinking model.

## Tradeoffs

Four model vars add config complexity. The `smart-local` shortcut raises
`LLM_MAX_NPCS` automatically when a local backend is active to compensate for
the cost difference. See [`llm-routing.md`](../llm-routing.md).
