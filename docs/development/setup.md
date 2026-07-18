---
title: Dev environment setup
description: Install, run, ports, env vars, and useful server endpoints.
---

# Dev environment setup

## Install

```sh
pnpm install   # Node ≥22, pnpm 10.33.2
```

## Run

```sh
pnpm dev:server   # sim server on http://localhost:5174
pnpm dev          # 3D Vite client on http://localhost:5175/game/
```

Open `http://localhost:5175/game/`. The Vite client proxies `/game/api` →
:5174.

## Env vars

Copy `.env.example` to `.env`. Key vars (names only — never commit values):

| Var | Purpose |
| --- | --- |
| `LLM_BASE_URL` | OpenAI-compatible endpoint (gateway, Ollama, LM Studio) |
| `LLM_API_KEY` | API key for the endpoint |
| `LLM_MODEL_NORMAL` | dialogue tier |
| `LLM_MODEL_QUEST` | quest/director tier |
| `LLM_MODEL_PROPOSE` | ambient agent loop tier |
| `LLM_MODEL_RESEARCH` | fandom import tier |
| `LLM_PROJECT_ID` | `ai-game` (gateway routing) |
| `LLM_TIMEOUT_MS` | per-call budget (default 8000) |
| `PORT` | sim server port (default 5174) |
| `LOG_DIR` | log output directory (default `logs`) |
| `PORTRAIT_URL` | Modal Z-Image-Turbo endpoint for portraits |
| `PORTRAITS_ENABLED` | `1` to enable portrait generation queue |
| `MEMORY_SEMANTIC_RECALL` | `1` to enable embedding-based recall |
| `GAME_MODE` | `story` for story-dialogue fallback when LLM disabled |

For local-LLM backend options (Ollama, LM Studio, coding-agent CLIs), see
[`../architecture/llm-routing.md`](../architecture/llm-routing.md).

## Useful server endpoints (local :5174)

- `GET /api/state` — raw simulation state.
- `POST /api/tick` — advance simulation with a player action.
- `POST /api/import-world-source` — reviewed world-source ingest.
- `GET /api/story-package` — packaged story + cutscenes manifest.
- `GET /api/events` — SSE stream of tick events.
- `GET /api/worlds` / `POST /api/worlds/select` — bundled world catalog.
- `GET /api/save` / `POST /api/reset` / `POST /api/load` — OPFS multi-slot.
- Agent loop: `/api/agent-loop/{status,start,stop,step,restore-checkpoint}`.
- Dialogue: `GET /api/dialogue/history`, `POST /api/dialogue`,
  `POST /api/dialogue/choose`.

The Worker DO exposes the same core paths except: no `story-package`,
`import-story-package`, `load`, `restore-checkpoint`, `portrait`. See
`worker/src/session-do.ts`.

## Verification

```sh
pnpm verify:readiness   # typecheck + lint + test + build:3d
```

See [`testing.md`](./testing.md) and
[`visual-verification.md`](./visual-verification.md).
