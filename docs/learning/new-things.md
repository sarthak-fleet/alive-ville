# New things to learn — ai-game

Technologies and patterns that were genuinely new during this build, with one-line stubs. See linked docs for depth.

---

## React Three Fiber (R3F)
- What: Declarative React bindings for Three.js — scenes as JSX, lifecycle as hooks.
- Why here: TBD
- Gotcha (from code): NPC/player positions must be written imperatively to `ref.current.position`, not to React `position` prop — per-frame reconciliation causes visible teleports and wasted budget.
- Source: https://docs.pmnd.rs/react-three-fiber | See ../web3d-architecture.md §"Sim ↔ client sync"

## @react-three/rapier (Rapier physics)
- What: WASM Rapier physics engine with a first-class R3F binding — kinematic character controller, colliders.
- Why here: TBD
- Gotcha (from code): NPCs have no Rapier rigid bodies (visual-only), so melee hit detection is manual cone checks against the NPC position registry — not sensor colliders.
- Source: https://github.com/pmndrs/react-three-rapier | See ../web3d-architecture.md §"Combat"

## Cloudflare Durable Objects (DO)
- What: Actor-model stateful compute at the edge — one JS instance per entity, hibernates when idle, re-hydrates from SQLite storage on the next request.
- Why here: TBD
- Gotcha (from code): DO constructor re-runs on every request after hibernation; instance-field state is gone — re-hydrate from `ctx.storage.get()` on each entry.
- Source: https://developers.cloudflare.com/durable-objects/

## Cloudflare service bindings (same-account Worker-to-Worker)
- What: Internal routing between Workers on the same account without going over the public internet.
- Why here: TBD
- Gotcha (from code): Same-account Workers cannot call each other over `workers.dev` URLs — calls hang or return 403. A `wrangler.jsonc` service binding is required; cost ~1 h of debugging if unknown.
- Source: https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/

## DO SQLite debounced persist
- What: Pattern for batching Durable Object storage writes so only the latest snapshot persists when ticks fire in a burst.
- Why here: TBD
- Gotcha (from code): Writing world JSON on every 4 s tick saturates the DO SQLite write budget; `PERSIST_DEBOUNCE_MS = 5_000` coalesces burst writes.
- Source: https://developers.cloudflare.com/durable-objects/api/storage-api/

## LLM agent loop — interval polling
- What: `setInterval`-driven tick loop with a `stepping` flag to prevent re-entrant LLM calls.
- Why here: TBD
- Gotcha (from code): Under model latency the loop naturally self-throttles (missed interval, not stacked call); minimum interval clamped to 250 ms to prevent runaway in tests.
- Source: See retros/2026-06-12-single-to-cf-worker.md

## OpenAI-compatible endpoint abstraction + tiered model selection
- What: Single `router.ts` speaking the OpenAI chat completions shape; backends (Ollama, LM Studio, DeepSeek, gateway) swapped via env vars.
- Why here: TBD
- Gotcha (from code): Reasoning models (DeepSeek R1) need `LLM_NO_THINK=1` — chain-of-thought tokens break the JSON parser.
- Source: https://platform.openai.com/docs/api-reference/chat | See ../local-llm.md

## Structured JSON actions (LLM proposes, engine validates)
- What: Every LLM response is parsed as a typed action object, validated against world state, and rejected if invalid — the LLM never writes directly to state.
- Why here: TBD
- Source: See ../ai-dungeon-differentiation.md §"Differentiation Pillars"

## Prompt format — JSON-in-reply without function-calling API
- What: System prompt carries persona + world context; model is asked to append a JSON block to its natural-language reply; the router extracts the last JSON object.
- Why here: TBD
- Gotcha (from code): OpenAI function-calling and structured-output APIs are not universally supported across local-model backends; JSON-in-reply works on all OpenAI-compatible endpoints but requires retry + fallback for malformed output.
- Source: See external-references.md

## Deterministic worldgen with seeded PRNG
- What: `mulberry32(hash(worldId:locationId:...))` as the sole randomness source — every prop, color, and NPC spawn is deterministic from world JSON.
- Why here: TBD
- Gotcha (from code): Any change to call order shifts the entire town layout; layout assertions in `tests/web3d-worldgen.test.ts` must pass before touching worldgen.
- Source: See ../web3d-architecture.md

## Canvas-generated textures (zero binary assets)
- What: Building facades, ground tiles, and prop textures generated at runtime on `<canvas>` elements and uploaded as `DataTexture`/`CanvasTexture` to the GPU.
- Why here: TBD
- Source: See ../web3d-architecture.md §"Look" | ../third-party-assets.md (for the GLB asset layer that sits on top)

## Phaser — retired but still in package.json
- What: 2D game framework used for the original prototype; replaced by R3F on 2026-06-12.
- Why here: TBD
- Gotcha (from code): Phaser dependency remains in `package.json` and `PROJECT_RECOMMENDATION_CONTEXT.md` as an audit snapshot artifact — it is not used in the active build.
- Source: See retros/2026-05-21-phaser-to-r3f.md
