# Architecture Decision Records

This log covers decisions not already documented elsewhere. Where an existing doc
covers a topic well, a one-line pointer replaces a full entry.

---

## ADR-001 — Three.js + React Three Fiber as the 3D runtime (not Babylon.js)

**Date**: ~2026-05-21 (first 3D commits)  
**Context**: The project needed a browser-native 3D renderer that could generate
a full walkable town from a JSON schema with zero pre-authored scene assets.  
**Decision**: Three.js + R3F + drei, not Babylon.js.  
**Rationale**: R3F exposes Three.js as React components, which fits the data-driven
worldgen approach — scenes built from world JSON, not from a visual editor.
Drei supplies camera controls, postprocessing, and physics helpers without extra
framework lock-in. Babylon.js was the stated runner-up; it has built-in physics
and navmesh tools, but it would have imposed a separate scene-graph API on top of
Three's, making the React HUD boundary messier.  
**Alternatives considered**: Babylon.js (built-in navmesh, physics), PlayCanvas
(ECS-native), Godot export to WebGL (shelved as out-of-scope).  
**Tradeoffs**: R3F's `useFrame` loop requires discipline about re-renders — NPC
and player positions are driven imperatively from refs rather than React state to
avoid per-frame reconciliation overhead. See `web3d-architecture.md` §"Sim ↔ client sync".

---

## ADR-002 — @react-three/rapier for physics (kinematic controller + colliders)

**Date**: ~2026-05-21  
**Context**: The 3D client needs a character controller that stops the player
walking through buildings, plus future sensor colliders for combat hitboxes.  
**Decision**: `@react-three/rapier` (WASM Rapier via the React Three Fiber binding).  
**Rationale**: Rapier is the only mature WASM physics engine with a first-class R3F
binding. Its kinematic character controller (with slope, step, and gravity
configuration) handles player movement without manual AABB math. Building
colliders are generated deterministically from the same worldgen rectangles used
for rendering, so physics geometry stays in sync with visuals at zero extra cost.  
**Alternatives considered**: Cannon.js (no kinematic character controller, weaker
WASM story), Ammo.js (large binary), Oimo (abandoned), hand-rolled AABB (rejected
— too many edge cases for slope + step-up + multi-building layouts).  
**Tradeoffs**: WASM cold-start adds ~80 ms on first load. Hit detection for melee
combat was ultimately implemented as cone checks against the NPC position registry
rather than Rapier sensor colliders, because NPC actors are visual-only (no rigid
bodies). This is a documented deviation — see `web3d-architecture.md` §"Combat".

---

## ADR-003 — Street waypoint graph instead of Recast/Detour navmesh for NPC navigation

**Date**: ~2026-05-21  
**Context**: NPCs need to walk between districts across a schema-generated city
that changes shape with each imported world.  
**Decision**: Deterministic street waypoint graph — courtyards → gate midpoints →
street polylines — with Dijkstra for routing.  
**Rationale**: Recast/Detour requires a baked navmesh tied to finalized geometry;
schema-generated cities change layout per world, so a bake step would either run
at import time (slow) or be impossible ahead of time. The belt-layout worldgen
keeps paths unobstructed, making a waypoint graph sufficient. The graph is
generated from the same data that drives rendering, so it is always consistent
and is unit-tested for connectivity.  
**Alternatives considered**: Recast/Detour WASM (navmesh bake per import), A* on
a uniform grid (wasteful for open streets), pathfinding-js (not navmesh-aware).  
**Tradeoffs**: The waypoint graph does not handle dynamically placed obstacles.
Combat does not reroute around fighters. This is acceptable for the current scale.

---

## ADR-004 — Durable Objects (one per visitor session) instead of KV or D1 for sim state

**Date**: ~2026-06-12 (CF worker deploy)  
**Context**: Each player session needs isolated, mutable world state (NPCs, quests,
memories, agent loop, SSE fan-out) with no cross-player bleed. State can be
large (full world JSON) and is mutated on every tick (~4 s interval).  
**Decision**: One `GameSessionDO` per visitor. World state persists to DO SQLite
storage; the DO hibernates when no client is connected and re-hydrates on the
next request.  
**Rationale**: DOs provide actor-model isolation — one goroutine-equivalent per
session — which eliminates race conditions between the agent loop timer and
incoming HTTP requests without locks. KV has eventual consistency and no
per-key compute isolation; D1 is a shared relational database ill-suited to
frequent full-document overwrites. The DO hibernation API keeps the session alive
across page refreshes without paying for idle compute.  
**Alternatives considered**: KV (no isolation, eventual consistency), D1 (relational
schema mismatch, shared DB for per-session state), stateful server on a VPS
(no hibernation, manual scaling).  
**Tradeoffs**: DOs are single-region (the session sticks to the first colo that
handled the request). World JSON can grow large; the debounced persist (5 s) and
a JSON snapshot write are sufficient for current scale but would need chunking if
world state grew beyond a few hundred KB. See `worker/src/session-do.ts`.

---

## ADR-005 — LLM agent loop: interval-based polling (turn-by-turn), not streaming/event-driven

**Date**: ~2026-05-17 (agent loop commits)  
**Context**: The game needs NPCs to keep acting when the player is idle, without
blocking the player's direct actions (talk, move, fight).  
**Decision**: `createAgentLoop` fires on a configurable interval (default 4 s),
runs one `engine.tick()`, and emits a tick summary over SSE. The loop skips if a
tick is already in progress (`stepping` flag).  
**Rationale**: A polling loop decouples the agent cadence from model latency —
if an LLM call takes 3 s the loop just misses that interval, rather than
stacking. Turn-by-turn ticks produce a discrete, replayable event log that feeds
the chronicle and checkpoint system. Streaming continuations (a-la GPT assistant
threads) would make deterministic replay harder and increase coupling to one
provider's API shape.  
**Alternatives considered**: SSE-driven push from model stream, WebSocket
bidirectional loop, immediate re-trigger after each tick.  
**Tradeoffs**: Fixed-interval polling means the world has a visible "heartbeat"
cadence. Under heavy LLM load the loop naturally self-throttles. The minimum
interval is clamped to 250 ms to prevent runaway calls during tests.

---

## ADR-006 — OpenAI-compatible endpoint abstraction for all LLM backends

**Date**: ~2026-05-08 (LLM router)  
**Context**: The project needs to swap between local models (Ollama, LM Studio),
remote APIs (DeepSeek, Mistral), and the internal free-ai-gateway without
rewriting prompt or call logic.  
**Decision**: All LLM calls go through `src/llm/router.ts`, which speaks the
OpenAI chat completions API shape. Backends are selected via env vars
(`LLM_BASE_URL`, `LLM_CLI`, `LLM_LOCAL_AI_URL`).  
**Rationale**: The OpenAI chat completions format is the de-facto industry standard
for self-hosted models (Ollama, llama.cpp, LM Studio all expose it). Using it as
the only internal interface means model changes are purely config, not code.
The gateway (`free-ai-gateway.workers.dev`) speaks the same format and uses
`x-gateway-force-model` to route to healthy backends, so production model pinning
does not require a code deploy.  
**Alternatives considered**: LangChain (heavy abstraction, JS bundle cost),
per-provider SDKs (lock-in), direct fetch per provider (no abstraction).  
**Tradeoffs**: Structured JSON output reliability varies by model. The router
includes retry logic and JSON parse fallbacks. Reasoning models (DeepSeek R1)
require `LLM_NO_THINK=1` to suppress chain-of-thought tokens that break the
JSON parser. See `docs/local-llm.md` for full knobs.

---

## ADR-007 — Tiered model selection (normal / quest / propose / research)

**Date**: ~2026-05-17  
**Context**: Dialogue, ambient NPC proposals, quest/director beats, and world
import all have different quality and volume requirements.  
**Decision**: Four model slots: `LLM_MODEL_NORMAL` (dialogue), `LLM_MODEL_QUEST`
(quest-tier NPCs + director), `LLM_MODEL_PROPOSE` (ambient agent loop — high
call volume), `LLM_MODEL_RESEARCH` (fandom world import).  
**Rationale**: Ambient proposals (`LLM_MODEL_PROPOSE` defaults to
`cerebras-llama-8b`) run on every tick for up to 10 NPCs; using a strong model
there would 10× the cost. Quest and director calls are low-volume but need
reliable structured output, so they use a stronger tier. Research/import calls
need broad world knowledge but not reasoning; they use a non-thinking model.  
**Tradeoffs**: Four model vars add config complexity. The `smart-local` shortcut
raises `LLM_MAX_NPCS` automatically when a local backend is active to compensate
for the cost difference. See `docs/local-llm.md`.

---

## ADR-008 — Structured JSON actions (LLM proposes, engine validates)

**Date**: ~2026-05-08  
**Context**: NPCs must be able to move, give items, start quests, fight, and
follow — but LLM output can be malformed, hallucinated, or logically invalid.  
**Decision**: Every LLM response is parsed as a structured JSON action object
(`{type, target, ...}`), validated against the engine's action schema and current
world state, and rejected if invalid. The LLM never writes directly to world
state.  
**Rationale**: Stated in `docs/archive/init.md` §16: "The LLM never directly
mutates the world." Engine-validated actions are the single largest technical
differentiator vs. AI Dungeon-style free text continuations — they produce
reproducible, replayable, auditable state transitions. See also
`docs/ai-dungeon-differentiation.md` §"Differentiation Pillars".  
**Tradeoffs**: Constraining the LLM to a fixed action vocabulary limits
expressiveness. The vocabulary has grown (move, give, offer_quest, complete_quest,
fight, follow, unfollow, create_quest, remember, spar, disposition) to reduce
that tension without losing validatability.

---

## ADR-009 — Prompt format: system+user turns, no tool-calling API

**Date**: ~2026-05-08  
**Context**: NPC dialogue prompts need to inject persona, memories, world state,
and produce a structured reply.  
**Decision**: System prompt carries persona + standing beliefs + world context;
user turn carries the player message. The model is asked to reply with a JSON
block at the end of its natural-language response. No OpenAI function-calling or
structured-output API is used.  
**Rationale**: Function-calling and structured-output APIs are not universally
supported across the local-model backends (Ollama, LM Studio, llama.cpp). The
JSON-in-reply approach works on all OpenAI-compatible endpoints. The parser
extracts the last JSON block from the reply, tolerating preamble prose.  
**Tradeoffs**: Parsing fragility — models occasionally produce malformed JSON or
embed JSON mid-reply. The router retries once and falls back to a scripted action.
TBD: capture the failure rate on production traffic once the gateway observability
data matures.

---

## ADR-010 — Cloudflare Workers + Workers Assets for the full deploy

**Date**: ~2026-06-12  
**Context**: The 3D client (static Vite build) and the sim server need to be
colocated at the edge for low-latency SSE and DO access from the same origin.  
**Decision**: `wrangler deploy` publishes the Vite build as Workers Assets and
the DO-backed worker as a Worker on `aliveville.com/game*`. The LLM gateway is
reached via a Workers service binding to avoid same-account `workers.dev`
cross-worker fetch restrictions.  
**Rationale**: Workers Assets serves static files from Cloudflare's CDN with
zero cold start; the same Worker handles `/api/*` routes backed by the DO. A
single `wrangler deploy` command ships everything. The service binding for the
LLM gateway is required because same-account Workers cannot call each other over
`workers.dev` URLs — a non-obvious CF platform restriction that caused silent
failures before the binding was added.  
**Alternatives considered**: Separate static CDN + VPS for the sim, Vercel Edge
Functions (no Durable Objects), self-hosted Hono/Bun (no hibernation, manual
ops).  
**Tradeoffs**: CF free-tier DO limits (128 MB memory, 30 s CPU per invocation)
constrain world size and agent loop tick budget. The debounced persist and the
4 s loop interval are tuned to stay within these limits.

---

## ADR-011 — Canvas-generated textures: zero binary assets for buildings and ground

**Date**: ~2026-05-21  
**Context**: Building facades, ground tiles, and set-dressing textures need to
vary by district type and world palette without a large asset download.  
**Decision**: All building, ground, and prop textures are generated at runtime on
`<canvas>` elements and uploaded as `DataTexture`/`CanvasTexture` to the GPU.  
**Rationale**: Zero binary assets means deterministic reproducibility (same world
JSON → same visual output) and no CDN hosting cost for a potentially unlimited
number of world palettes. Textures cache by color/floors/seed so identical
buildings share GPU memory.  
**Tradeoffs**: Runtime canvas generation has a one-time CPU cost on world load
(invisible in practice on M-series; ~200 ms on mid-range laptops). The transition
to Kenney/Poly Haven GLB assets (see `docs/third-party-assets.md`) replaces the
procedural path for buildings and nature while keeping canvas as the fallback.
See `web3d-architecture.md` §"Look" for the full texture list.

---

## ADR-012 — Dual engine (R3F + retired Phaser) — why both existed, why one was retired

**Date**: 2026-06-12 (Phaser retired)  
**Context**: The project started with Phaser for the 2D prototype
(`docs/archive/agent-town-handoff.md`, `docs/archive/init.md`), then built a
parallel R3F 3D client that became the active track.  
**Decision**: Phaser 2D client was deleted on 2026-06-12; R3F is now the only
runtime.  
**Rationale**: The 2D client served its purpose (prove the simulation core, deliver
a first playable loop) but fell behind the 3D client in features and test
coverage. Maintaining two render targets was slowing the roadmap. The simulation
engine (`src/`) was always runtime-agnostic; retiring the 2D shell did not affect
any sim logic.  
**Tradeoffs**: Phaser's built-in tilemap, camera, and input systems were convenient
for 2D prototyping. R3F required more manual wiring (pointer-lock, navgraph, NPC
locomotion) but gave full control over the 3D scene. The Phaser dependency
remains in `package.json` and `PROJECT_RECOMMENDATION_CONTEXT.md` as an artifact
of the audit snapshot; it is not used in the active build.
