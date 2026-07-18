---
title: ADR-006 — OpenAI-compatible endpoint abstraction for all LLM backends
description: All LLM calls go through src/llm/router.ts speaking the OpenAI chat completions shape.
---

Decided ~2026-05-08 (LLM router).

## Context

The project needs to swap between local models (Ollama, LM Studio), remote APIs
(DeepSeek, Mistral), and the internal free-ai-gateway without rewriting prompt
or call logic.

## Decision

All LLM calls go through `src/llm/router.ts`, which speaks the OpenAI chat
completions API shape. Backends are selected via env vars (`LLM_BASE_URL`,
`LLM_CLI`, `LLM_LOCAL_AI_URL`).

## Rationale

The OpenAI chat completions format is the de-facto industry standard for self-
hosted models (Ollama, llama.cpp, LM Studio all expose it). Using it as the
only internal interface means model changes are purely config, not code. The
gateway (`free-ai-gateway.workers.dev`) speaks the same format and uses
`x-gateway-force-model` to route to healthy backends, so production model
pinning does not require a code deploy.

## Alternatives considered

- LangChain (heavy abstraction, JS bundle cost)
- Per-provider SDKs (lock-in)
- Direct fetch per provider (no abstraction)

## Tradeoffs

Structured JSON output reliability varies by model. The router includes retry
logic and JSON parse fallbacks. Reasoning models (DeepSeek R1) require
`LLM_NO_THINK=1` to suppress chain-of-thought tokens that break the JSON
parser. See [`llm-routing.md`](../llm-routing.md) for full knobs.
