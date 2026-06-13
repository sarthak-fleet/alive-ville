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

---

# Frontier web platform — planned (see ../web-frontier-prd.md)

Not in this repo's code yet. Reference implementations live in the sibling repo
`../../tinygpt` (a from-scratch in-browser ML engine); gotchas below are cited
from *its* code where verified. Add a real gotcha here once the tech lands in
ai-game.

## WebGPU compute shaders (WGSL)
- What: General-purpose parallel compute on the GPU from the browser via compute pipelines written in WGSL.
- Why here: TBD
- Gotcha (from code): naive matmul is memory-bound — tinygpt ships many variants (tiled / blocked / vec4 / cooperative-matrix) because the kernel shape, not the math, sets the speed.
- Gotcha (ai-game): the `GPUBufferUsage` / `GPUMapMode` flag enums are not declared as *values* in our TS lib (only the types are) — read them off `globalThis` to compile. See `web3d/src/ai/gpu-compute.ts`.
- Source: https://www.w3.org/TR/webgpu/ | ../../tinygpt/webgpu/matmul_*.wgsl | web3d/src/ai/gpu-compute.ts (first-party WGSL matmul)

## WebGPU rendering — Three.js WebGPURenderer + TSL
- What: Three.js renderer backed by WebGPU; materials authored as TSL (a node/shader graph) instead of GLSL strings.
- Why here: TBD
- Gotcha (from code): not in tinygpt (compute-only) — this is the one frontier piece with no reference impl to vendor; build fresh.
- Source: https://threejs.org/docs/#manual/en/introduction/How-to-use-WebGPU

## Flash-Attention 2 (WGSL)
- What: Tiled attention kernel that never materializes the full N×N score matrix, trading recompute for memory.
- Why here: TBD
- Gotcha (from code): tinygpt implements this directly in WGSL — the tiling + streaming-softmax is the whole trick.
- Source: https://arxiv.org/abs/2307.08691 | ../../tinygpt/webgpu/attention_fa2.wgsl

## WASM compute — SIMD + pthreads + SharedArrayBuffer
- What: C++ compiled to WebAssembly with `-msimd128` vectorization and `-pthread` worker threads sharing a `SharedArrayBuffer` heap; CPU fallback when WebGPU is absent.
- Why here: TBD
- Gotcha (from code): `SharedArrayBuffer` needs cross-origin isolation (COOP+COEP response headers) or threads won't start; tinygpt also ships a wasm64 (`-sMEMORY64`) build where pointer args/returns surface in JS as `BigInt`.
- Source: https://emscripten.org/docs/porting/pthreads.html | ../../tinygpt/wasm/build_wasm.sh, browser/src/backend.ts

## In-browser LLM inference (WebLLM / transformers.js)
- What: Run a pre-trained chat/embedding model fully client-side on the WebGPU backend — no server round-trip.
- Why here: TBD
- Gotcha (from code): tinygpt is a tiny char-level GPT, NOT a chat model — reuse its plumbing (device/feature detect, OPFS weight cache, WASM fallback), but the chat model itself comes from WebLLM/transformers.js.
- Source: https://github.com/mlc-ai/web-llm | https://huggingface.co/docs/transformers.js

## OPFS — Origin Private File System
- What: Fast, origin-scoped local file storage; backs save games, asset caches, and model weights.
- Why here: TBD
- Gotcha (from code): subject to storage quota and wiped by "clear site data" — tinygpt requests durable/persistent storage up front (`storage.ts`).
- Source: https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system | ../../tinygpt/browser/src/storage.ts

## WebNN — Web Neural Network API
- What: Browser API routing inference to OS ML backends (CoreML / DirectML / NPU).
- Why here: TBD
- Gotcha (from code): `navigator.ml` can exist while the backend is non-functional — tinygpt ships a numerics-gated probe (one-matmul graph vs hand-computed ref) before trusting it.
- Source: https://www.w3.org/TR/webnn/ | ../../tinygpt/browser/src/webnn_probe.ts

## WebTransport (HTTP/3 / QUIC)
- What: Low-latency client↔server transport over QUIC; both reliable streams and unreliable/unordered datagrams. PRD replacement for SSE.
- Why here: TBD
- Source: https://developer.mozilla.org/en-US/docs/Web/API/WebTransport

## WebCodecs
- What: Low-level access to the browser's video/audio encoders and decoders for cutscene decode and gameplay clip export.
- Why here: TBD
- Gotcha (from code): TBD — `VideoFrame` holds native/GPU memory and must be `.close()`'d to avoid leaks (verify when implemented).
- Source: https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API

## Gaussian splatting
- What: Render captured 3D scenes as millions of anisotropic 3D gaussians instead of meshes — photoreal environments. Optional PRD flex.
- Why here: TBD
- Source: https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/

## Web Speech API (TTS + STT)
- What: Built-in browser speech synthesis (`speechSynthesis`) and recognition (`SpeechRecognition`) — NPC voices + voice dictation, no model/dependency.
- Why here: TBD
- Gotcha (from code): `SpeechRecognition` is unprefixed in some browsers and `webkitSpeechRecognition` in others, and isn't in our TS lib — read it off `globalThis` with a hand-written type. See `web3d/src/platform/voice.ts`.
- Source: https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API

## PWA — service worker + web manifest
- What: Installable, offline-capable app via a manifest + a service worker that intercepts fetches.
- Why here: TBD
- Gotcha (from code): the SW is **network-first** (try network, cache fresh, fall back to cache offline) so it never serves stale assets online; API paths are skipped; registered prod-only; scope is `/game/` (the Vite base). See `web3d/public/sw.js`, `web3d/src/main.tsx`.
- Source: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps

## WebXR (immersive-VR via @react-three/xr)
- What: Enter the 3D town in a VR headset; @react-three/xr integrates XR frame timing with the R3F render loop.
- Why here: TBD
- Gotcha (from code): hand-rolling `renderer.xr` on R3F does NOT pump XR frames — you need the r3f/xr store + `<XR>` wrapper. Outside a session `<XR>` is a passthrough. See `web3d/src/platform/xr.ts`, `web3d/src/scene/GameWorld.tsx`.
- Source: https://github.com/pmndrs/xr
