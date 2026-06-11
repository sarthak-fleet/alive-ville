# Local LLM backends

The sim server speaks to any OpenAI-compatible endpoint, or can shell out
to a coding agent CLI. Configure via `.env` (loaded by `pnpm dev:server`).

## Option 1 — local model servers (Ollama, LM Studio)

No API key needed; just point `LLM_BASE_URL` at the local server:

```bash
# Ollama (ollama serve; ollama pull llama3.1)
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL_NORMAL=llama3.1
LLM_MODEL_QUEST=llama3.1

# LM Studio (start the local server in the app)
LLM_BASE_URL=http://localhost:1234/v1
LLM_MODEL_NORMAL=<model id from LM Studio>
```

## Option 2 — coding-agent CLIs (claude / codex)

`LLM_CLI=claude` or `LLM_CLI=codex` routes every NPC brain call through the
CLI in non-interactive mode (uses your existing subscription; ~2–5s per
reply, so best for solo play):

```bash
LLM_CLI=claude   # claude -p --output-format text --max-turns 1
LLM_CLI=codex    # codex exec --output-last-message <tmp> -
```

`LLM_CLI` wins over `LLM_BASE_URL` when both are set. Token streaming is
emulated (the reply arrives as one chunk).

## Option 3 — the free-ai gateway (default / production)

```bash
LLM_BASE_URL=https://free-ai-gateway.sarthakagrawal927.workers.dev/v1
LLM_API_KEY=<gateway key>
LLM_PROJECT_ID=ai-game
LLM_MODEL_NORMAL=mistral-large
LLM_MODEL_QUEST=mistral-large
LLM_MODEL_PROPOSE=cerebras-llama-8b   # high-volume ambient NPC proposals
LLM_TIMEOUT_MS=20000
```

The gateway treats `body.model` as advisory; the router pins the model via
the `x-gateway-force-model` header. Pick healthy ids from
`GET /v1/routing/status`. Other backends ignore the extra header.

## Knobs

| env | default | meaning |
| --- | --- | --- |
| `LLM_MODEL_NORMAL` / `LLM_MODEL_QUEST` | deepseek | dialogue model by NPC tier |
| `LLM_MODEL_PROPOSE` | = NORMAL | ambient agent-loop proposals (the call-volume hog) |
| `LLM_TIMEOUT_MS` | 8000 | per-call timeout (2× for streams) |
| `LLM_TEMPERATURE` | 0.7 | sampling temperature |
| `LLM_NO_THINK` | unset | `1` suppresses chain-of-thought on reasoning models |
