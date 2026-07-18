---
title: ADR-009 — Prompt format: system+user turns, no tool-calling API
description: JSON-in-reply parsing instead of OpenAI function-calling, for backend portability.
---

Decided ~2026-05-08.

## Context

NPC dialogue prompts need to inject persona, memories, world state, and
produce a structured reply.

## Decision

System prompt carries persona + standing beliefs + world context; user turn
carries the player message. The model is asked to reply with a JSON block at
the end of its natural-language response. No OpenAI function-calling or
structured-output API is used.

## Rationale

Function-calling and structured-output APIs are not universally supported
across the local-model backends (Ollama, LM Studio, llama.cpp). The JSON-in-
reply approach works on all OpenAI-compatible endpoints. The parser extracts
the last JSON block from the reply, tolerating preamble prose.

## Tradeoffs

Parsing fragility — models occasionally produce malformed JSON or embed JSON
mid-reply. The router retries once and falls back to a scripted action.

## Unresolved

Capture the failure rate on production traffic once the gateway observability
data matures.
