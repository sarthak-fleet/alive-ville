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

## Option 2 — coding-agent CLIs (claude / codex / gemini)

Preferred: the sibling [`../local-ai`](../../local-ai) server (spawns your
authenticated CLIs, streams tokens, supports gemini too):

```bash
# in ../local-ai: npm start   (→ http://localhost:3456)
LLM_LOCAL_AI_URL=http://localhost:3456
LLM_LOCAL_AI_PROVIDER=claude   # or codex | gemini
# LLM_LOCAL_AI_MODEL=sonnet    # optional CLI model override
```

No-server fallback — the game spawns the CLI itself (single-chunk replies):

```bash
LLM_CLI=claude   # claude -p --output-format text --max-turns 1
LLM_CLI=codex    # codex exec --output-last-message <tmp> -
```

Precedence: `LLM_LOCAL_AI_URL` > `LLM_CLI` > `LLM_BASE_URL`. Replies take
~2–5s through a CLI, so these are best for solo play.

## Option 3 — the free-ai gateway (default / production)

```bash
LLM_BASE_URL=https://ai-gateway.sassmaker.com/v1
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

## Smart-local mode

Local backends are free, so the sim gets smarter automatically when one is
active: ambient proposals cover 10 NPCs per tick instead of 5
(`LLM_MAX_NPCS` overrides). Worth pairing with `LLM_MEMORY_LIMIT=8` for
deeper conversational recall.

## Story mode (zero-AI public tier)

`GAME_MODE=story` disables LLM dialogue entirely: conversations become
choice chips DERIVED from live sim state (freshest rumor, real goals,
objective-gated quest verbs, escort), executing the same engine actions.
The world underneath (rumors, confrontations, catch-up, authoring-off)
keeps moving, so the script stays fresh at $0 per visitor.

## Knobs

| env | default | meaning |
| --- | --- | --- |
| `LLM_MODEL_NORMAL` / `LLM_MODEL_QUEST` | deepseek | dialogue model by NPC tier |
| `LLM_MODEL_PROPOSE` | = NORMAL | ambient agent-loop proposals (the call-volume hog) |
| `LLM_TIMEOUT_MS` | 8000 | per-call timeout (2× for streams) |
| `LLM_MEMORY_LIMIT` | 5 | memories retrieved per dialogue turn |
| `LLM_MODEL_RESEARCH` | = QUEST | model for fandom world imports (strong, non-reasoning) |
| `LLM_TEMPERATURE` | 0.7 | sampling temperature |
| `LLM_NO_THINK` | unset | `1` suppresses chain-of-thought on reasoning models |
