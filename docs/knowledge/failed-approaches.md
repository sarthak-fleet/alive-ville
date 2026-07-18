---
title: Failed approaches
description: Retired approaches, why they failed, and the standing guards.
---

# Failed approaches

Retired approaches and why they failed. Each entry names the approach, what
happened, and the standing guard. Detailed retros and experiments are linked
rather than duplicated.

## 2D Phaser client

**Approach**: Build a 2D top-down RPG client with Phaser + OpenRTP tiles +
Tiled JSON maps as the active player surface.

**What happened**: A parallel R3F 3D client was built alongside it and
surpassed it in features and test coverage. Maintaining two render targets
slowed the roadmap. The simulation engine (`src/`) was always runtime-agnostic,
so the 2D shell could be retired without affecting sim logic.

**Verdict**: Retired 2026-06-12. R3F is the only runtime.

**Standing guard**: The Phaser dependency remains in `package.json` as an
audit artifact; do not reintroduce the 2D client. See
[`adr-012-phaser-retired.md`](../architecture/decisions/adr-012-phaser-retired.md)
and [`retros/2026-05-21-phaser-to-r3f.md`](./retros/2026-05-21-phaser-to-r3f.md).

## Unreal bridge

**Approach**: Build an Unreal project (`unreal/AshmentUnreal`) as a later
rebuild target for high-fidelity rendering.

**What happened**: Shelved as out-of-scope. The browser 3D client reaches
sufficient fidelity for the current product thesis, and the Unreal bridge
added build complexity without a clear player-facing win.

**Verdict**: Shelved. Out of scope.

**Standing guard**: Do not reintroduce an Unreal track without a product
owner decision and a real fidelity gap that R3F cannot close.

## SadTalker dialogue close-ups

**Approach**: Generate animated NPC dialogue close-ups (talking-head MP4s)
with SadTalker + Parler-TTS on Modal.

**What happened**: End-to-end worked (3.0s, 256×256 H.264+AAC MP4 in ~34s
warm gen). But SadTalker aggressively face-crops, losing the costume
silhouette that makes each NPC visually distinct in the HUD. Anime lip-sync
was barely perceptible at the default camera distance.

**Verdict**: Skip. AniPortrait is the next candidate if we revisit.

**Standing guard**: Do not adopt SadTalker for NPC dialogue. See
[`experiments/sadtalker-dialogue.md`](./experiments/sadtalker-dialogue.md).

## Image-to-3D (TRELLIS vs Hunyuan3D-2)

**Approach**: Generate unique-per-NPC character meshes from portraits via
TRELLIS or Hunyuan3D-2 on Modal.

**What happened**: Both pipelines produce a textured GLB, but neither is
rigged. The OSS auto-rigging gap is the actual blocker — an unrigged mesh is
not usable for animated characters without a closed-source rigger.

**Verdict**: Defer — stick with VRM until a humanoid auto-rigging pipeline
ships or we accept a closed-source rigger.

**Standing guard**: Do not adopt image-to-3D for characters without a
rigging plan. See [`experiments/image-to-3d-bakeoff.md`](./experiments/image-to-3d-bakeoff.md).

## WebGPU game renderer swap

**Approach**: Swap the WebGL render path (R3F/Three) for WebGPU.

**What happened**: The game renders via WebGL; the WebGPU work is
inference/compute/an isolated demo, none of it on the game's render path.
Swapping the renderer would be a full rewrite with no player-facing win at
current fidelity.

**Verdict**: Closed won't-do.

**Standing guard**: Do not plan a WebGPU renderer swap. See
[`archive/web-frontier-prd-shipped-2026-06-14.md`](../archive/web-frontier-prd-shipped-2026-06-14.md).

## WebTransport / WebRTC live transport

**Approach**: Replace SSE with WebTransport or WebRTC for the agent loop
event stream.

**What happened**: SSE remains sufficient for the current tick cadence and
fan-out. WebTransport detection is exposed as a capability pill, but no live
transport uses it.

**Verdict**: Closed won't-do.

## Gaussian splatting

**Approach**: Use Gaussian splatting for scene rendering.

**What happened**: Not a fit for schema-generated, deterministic worldgen.
Closed as won't-do in the web-frontier PRD.

**Verdict**: Closed won't-do.

## Whisper STT

**Approach**: Use Whisper for in-browser speech-to-text dictation.

**What happened**: Replaced by Web Speech API fallback (lighter, no model
download). Whisper STT closed as won't-do.

**Verdict**: Closed won't-do. Web Speech is the dictation path.

## WebNN inference path

**Approach**: Use WebNN for in-browser inference.

**What happened**: WebNN is probed as a capability but not used for
inference. The in-browser LLM path uses `@mlc-ai/web-llm` (WebGPU/WASM).

**Verdict**: Closed won't-do for inference.

## WebXR / VR mode

**Approach**: Add a WebXR VR mode to the 3D client.

**What happened**: Referenced in older PRDs but never implemented in the
codebase (no `@react-three/xr` dependency). Closed.

**Verdict**: Closed / not implemented. See
[`archive/future-prd-deferred-north-star-2026-06-12.md`](../archive/future-prd-deferred-north-star-2026-06-12.md).

## Dual package manager (npm + pnpm) on the landing site

**Approach**: Allow both `package-lock.json` (npm) and `pnpm-lock.yaml`
(pnpm) in `astro-landing/`.

**What happened**: Dual-lockfile drift broke Cloudflare Pages in May 2026
(fleet lesson). The landing site is now npm-only; the game is pnpm-only.

**Verdict**: Retired. One package manager per surface.

**Standing guard**: Do not introduce `pnpm-lock.yaml` in `astro-landing/`.
See [`../operations/runbooks/deploy-landing.md`](../operations/runbooks/deploy-landing.md).
