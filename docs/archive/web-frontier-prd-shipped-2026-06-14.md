# Aliveville Web-Frontier PRD: The Platform Capability Showcase

**Status**: Shipped (archived 2026-06-20) — all code AC closed; headless smoke
re-verified 2026-06-20 (`pnpm playtest:game`, zero console/page errors). Real-device
GPU/AI/VR verification and deploy remain manual follow-ups, not PRD blockers.
**Canonical home**: this archive file (supersedes `docs/web-frontier-prd.md`).
**Owner**: Engineering (fleet)
**Goal in one line**: Make Aliveville the broadest *legible* demonstration of the modern web platform — every frontier capability used for a real in-game reason, and made visible.
**⚠️ Prerequisite gate**: Do NOT start Phase 0 until the core game is fun. A
frontier-tech flex on a game that isn't fun reads as a broken tech demo and drags
the tech down with it. Fundamentals first: see **`docs/core-gameplay-fix.md`** and
clear its §5 acceptance bar before touching anything below.
**Related (do not duplicate)**:
- `PROJECT_STATUS.md` — current baseline (M1–M4 shipped)
- `docs/web3d-architecture.md` — current WebGL client (R3F + Three + Rapier)
- `docs/local-llm.md` — existing local-LLM notes (extend, don't restate)
- `docs/archive/future-prd-deferred-north-star-2026-06-12.md` — content/lifelikeness north-star (deferred; orthogonal axis)
- `docs/roadmap.md` — sequencing
- **`../tinygpt`** — sibling repo; source of most in-browser compute plumbing (see §4)

---

## 1. Thesis

A 3D AI game is one of the few app types that can *honestly* consume nearly the
entire web platform — it spans rendering, GPU compute, audio, video, networking,
storage, input, and AI in one coherent surface. So the question "can Aliveville
showcase the web's latest capability?" is **yes**.

The discipline is **not** "does it fit" — almost everything fits. The discipline
is **legibility**. In a game the engineering hides itself: WebGPU compute driving
10k agents just looks like "a crowd," and a local LLM looks like... dialogue. A
flex only lands if the viewer is *told what shouldn't be possible*. So every
capability below ships with instrumentation, and the headline is always the same:

> **Everything runs on your GPU, in your tab, with no server.**

The single most on-thesis differentiator is **local inference**: today NPC brains
are a cloud API call (`src/llm/router.ts` → DeepSeek), which is not a web-platform
flex. Moving the brains to WebGPU/WASM **in the browser** is the keystone.

## 2. Current state (baseline)

| Layer | Today | Frontier gap |
| --- | --- | --- |
| Render | WebGL2 (R3F `<Canvas>`, `web3d/src/scene/GameWorld.tsx`) | no WebGPU render/compute |
| Physics | Rapier (Rust→WASM) | only WASM in use, and it's a dep |
| AI brains | cloud LLM via `src/llm/router.ts` | no in-browser inference |
| Net | SSE (`connectLive`) | no WebTransport/WebRTC |
| Media | none | no WebCodecs |
| Storage | server saves | no OPFS/PWA |
| Input | pointer lock | no XR/gamepad |

## 3. Build order (capability-per-effort)

Ordered by **impact × reuse**, not by subsystem. Phases 0–1 are cheap because
they reuse `../tinygpt` (§4) and carry the strongest "no server" story.

### Phase 0 — Legibility spine *(cheap; unblocks every later flex)*
The instrumentation that makes the whole project read as a flex.
- **Backend + capability HUD** — a pill showing the live compute path
  (`WebGPU` / `WASM+SIMD` / `WebNN` / `WebGL2 fallback`), agent count, FPS, and
  GPU frame time. Source detection from tinygpt (`runtime_detect.ts`,
  `webnn_probe.ts`) + WebGPU `timestamp-query`.
- **"No server" badge + fallback toggle** — a switch that drops to the
  cloud/WebGL path so viewers *see* it choke. The delta is the demo.
- **OPFS persistence** — save games + asset cache locally. Source `storage.ts`.

### Phase 1 — Local NPC brains *(keystone flex)*
- In-browser LLM for dialogue/decisions on the WebGPU backend. Pragmatic path:
  **WebLLM / transformers.js** for a chat-grade model; reuse tinygpt's *plumbing*
  (device/adapter mgmt, `shader-f16` detection, WASM+SIMD CPU fallback, OPFS
  weight cache, WebNN probe) rather than rebuilding it.
- Local **embeddings** for semantic NPC memory retrieval.
- **Worker offload** so inference never janks the frame — source the
  `browser/src/worker.ts` pattern + the WASM pthreads build.
- Later: **Whisper** (talk to NPCs by voice) + local **TTS** for NPC voices.
- Extend `docs/local-llm.md`; keep router as the cloud fallback.

**Landed (2026-06-14)** — `@mlc-ai/web-llm` added. Implemented:
- `web3d/src/ai/capabilities.ts` — WebGPU/shader-f16/timestamp-query, WASM SIMD/threads, WebNN, OPFS, COI detection.
- `web3d/src/ai/local-llm.ts` — capability-gated, lazy-loaded, code-split engine (zustand store).
- `web3d/src/ai/npc-prompt.ts` + `hud/Dialogue.tsx` — **NPC dialogue now generates in-browser** when a model is resident; falls through to the server `/api/dialogue` path otherwise (Phase 1 keystone, wired into the live flow).
- `hud/LocalBrain.tsx` — "🧠 Local AI" panel: capability readout, one-click model load, on-device generation demo.
- `hud/FrontierHud.tsx` — Phase-0 legibility overlay: FPS, NPC count, active backend pill, "no server" badge.
- `platform/opfs-save.ts` + `platform/clip.ts` + `hud/PlatformControls.tsx` — OPFS local save (Phase 0) and canvas clip recording (Phase 4).

- `web3d/src/ai/gpu-compute.ts` — **first-party WebGPU compute**: a WGSL square-matmul benchmark (GFLOP/s readout), isolated from the render path.
- `web3d/src/ai/gpu-render.ts` — **isolated WebGPU render** pipeline (WGSL vertex+fragment plasma on its own canvas) — Phase-2 render capability without touching the game's WebGL renderer.
- `web3d/src/platform/voice.ts` — **Web Speech**: NPC text-to-speech + speech-to-text dictation in dialogue (opt-in, built-in APIs, no dep).
- `web3d/src/platform/xr.ts` + `<XR>` wrap + 🥽 VR chip — **WebXR** immersive-VR via @react-three/xr.
- `web3d/src/platform/webtransport.ts` — **WebTransport** (HTTP/3) client + detection pill (provided, not yet the default transport — needs a QUIC endpoint).
- `web3d/public/{manifest.webmanifest,sw.js,icon.svg}` + prod-only registration — **PWA**: installable + offline via a network-first service worker.
- `web3d/src/scene/GameWorld.tsx` (`?perf`) — **r3f-perf** profiler overlay (FPS, GPU/CPU ms, draw calls, triangles), off by default.

Verified by a **headless Chromium smoke run**: app boots with zero console
errors, town renders, all HUD additions mount, the `<XR>` wrapper does NOT
disturb normal rendering, manifest resolves, and the profiler overlay renders.
**Still needs a real-device check** for the GPU-bound behavior that software
rendering can't represent: local generation actually running, real GPU-ms, VR.

## PRD closure (2026-06-14)

**Done (code shipped + build/headless-verified; runtime needs a real device):**
Phase 0 (capability detect + legibility HUD + OPFS), Phase 1 (in-browser LLM in
dialogue), Phase 2 *compute* + *isolated render demo*, Phase 4 (WebCodecs clip,
Web Speech voice, WebXR), Phase 5 (PWA), + the r3f-perf profiler.

**Won't-do (closed with reason — not just deferred):**
- Phase 2 **game-renderer swap** to WebGPU+TSL — `@react-three/postprocessing` is
  WebGL-only; swapping blind risks the whole scene. Revisit only if postprocessing
  gains WebGPU support or the FX chain is dropped.
- Phase 3 **WebTransport/WebRTC as live transport** — needs an HTTP/3 / signalling
  server we don't run. The client module exists and is detected; SSE stays.
- **Gaussian splatting** (no scene asset), **Whisper STT** (Web Speech covers it),
  **WebNN inference path** (redundant with web-llm).

**Needs you (cannot be done solo):** real-device verification of the GPU/AI
features, and a **deploy** to `aliveville.com/game`. PRD closed — these are ops
follow-ups, not open AC.

**Headless re-verification (2026-06-20):** `pnpm dev:server` + `pnpm dev` +
`pnpm playtest:game` — exit 0, zero console/page errors. Software WebGL (SwiftShader)
does not exercise WebGPU local-LLM/compute; that remains a real-device check only.

### Phase 2 — WebGPU render + compute *(visual flex; higher effort, mostly fresh)*
- Swap Three.js `WebGLRenderer` → **`WebGPURenderer` + TSL** node materials.
  R3F supports it; keep the WebGL2 path as the Phase-0 fallback toggle.
- **WebGPU compute** for the agent sim (thousands of NPCs: steering, flow-field
  pathfinding, needs) + GPU particles / cloth / hair VFX. Different kernels than
  tinygpt's matmul, so build fresh — but reuse tinygpt's GPU buffer/dispatch
  *patterns* (`webgpu/tensor.ts`, `ops.ts`) as the reference implementation.
- Optional: **Gaussian splatting** for hero environments.

### Phase 3 — Networking / multiplayer *(fresh)*
- **WebTransport** (HTTP/3 QUIC datagrams) to replace SSE for low-latency state.
- **WebRTC** P2P co-op + voice chat.

### Phase 4 — Media & immersion *(fresh; breadth)*
- **WebCodecs** for cutscene decode + gameplay clip export (+ `ffmpeg.wasm`).
- **WebXR** VR walkthrough; **Web Audio + AudioWorklet** spatial sound;
  **Gamepad** + **Keyboard Lock** for immersive input.

### Phase 5 — Platform polish *(fresh; cheap breadth)*
- **PWA / Service Worker** (installable, offline) + **Background Fetch** asset
  precache; **File System Access** for mod/world import; **Compression Streams**;
  **View Transitions** for menus.

**Honest non-fits** — don't force these; only add with a real peripheral use
case: WebHID / WebSerial / WebUSB / WebBluetooth.

## 4. Sourcing from `../tinygpt`  ⟵ READ THIS BEFORE BUILDING PHASE 0–2

`tinygpt` (fleet sibling: `/Users/sarthak/Desktop/fleet/tinygpt`) is a
from-scratch **in-browser ML engine**. It already solves the hard, unglamorous
compute plumbing that Phases 0–2 need. **Do not rebuild these — vendor or extract
a shared package.**

| Need (this PRD) | Source in `../tinygpt` | Reuse as |
| --- | --- | --- |
| WebGPU device/adapter/buffer mgmt, GPU-resident tensors | `webgpu/tensor.ts`, `webgpu/ops.ts`, `webgpu/kernels.ts` | foundation for compute + custom-model inference |
| WGSL matmul (tiled/blocked/vec4/f16/coopmat) + **Flash-Attention 2** | `webgpu/matmul_*.wgsl`, `webgpu/attention_fa2.wgsl` | reference/fallback kernels for a custom small model |
| `shader-f16` / cooperative-matrix feature detection | `webgpu/gpu_model.ts`, `browser/src/runtime_detect.ts` | Phase-0 capability HUD |
| WASM + **SIMD (`-msimd128`)** + **pthreads + SharedArrayBuffer** CPU fallback | `wasm/src/*.cpp`, `wasm/build_wasm.sh`, `browser/src/backend.ts` | CPU inference path when WebGPU absent |
| **wasm64 / MEMORY64** build | `wasm/build_wasm64.sh` | large-model path |
| **OPFS** persistence (durable storage, quota, binary+JSON snapshot) | `browser/src/storage.ts` | Phase-0 saves / asset + weight cache |
| **WebNN** active numerics-gated probe | `browser/src/webnn_probe.ts` | extra inference backend + HUD pill |
| Backend auto-selection + hardware profiling | `browser/src/runtime_detect.ts`, `backend.ts` | quality auto-tune |
| Quantization (int4 / f16) | `browser/` int4/f16 paths (`smoke_int4*`, `convert_to_fp16.ts`) | shrink local model weights |

**What tinygpt does NOT provide** (build fresh in Aliveville):
- No **rendering** — it is compute/training only. The WebGPU *render* path
  (Phase 2) is all new.
- No **chat-grade model** — tinygpt is a tiny char-level GPT. For NPC dialogue
  prefer **WebLLM/transformers.js**; take tinygpt's *infrastructure*, not its model.
- No **networking, media, XR, audio** — Phases 3–4 are unrelated to tinygpt.

**Integration note**: tinygpt and ai-game are sibling repos in the same fleet
(no published package). Vendor the needed modules into `web3d/` or lift a shared
`@fleet/webgpu-compute` workspace package; preserve attribution/headers.

## 5. Acceptance — "is it legible?"

A capability counts as *shipped for the flex* only when a viewer can perceive it:
- it appears in the Phase-0 HUD (backend pill / counter / GPU timing), **and**
- the fallback toggle demonstrates the with/without delta, **and**
- there is a one-line on-screen claim of what's happening ("8,000 agents · 0
  server calls · WebGPU compute").

Capability wired but invisible = not done.
