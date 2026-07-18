---
title: ADR-011 — Canvas-generated textures (zero binary assets)
description: Building/ground/prop textures generated at runtime on <canvas> for deterministic reproducibility.
---

Decided ~2026-05-21.

## Context

Building facades, ground tiles, and set-dressing textures need to vary by
district type and world palette without a large asset download.

## Decision

All building, ground, and prop textures are generated at runtime on `<canvas>`
elements and uploaded as `DataTexture`/`CanvasTexture` to the GPU.

## Rationale

Zero binary assets means deterministic reproducibility (same world JSON → same
visual output) and no CDN hosting cost for a potentially unlimited number of
world palettes. Textures cache by color/floors/seed so identical buildings
share GPU memory.

## Tradeoffs

Runtime canvas generation has a one-time CPU cost on world load (invisible in
practice on M-series; ~200 ms on mid-range laptops). The transition to
Kenney/Poly Haven GLB assets (see
[`assets-and-licenses.md`](../../product/assets-and-licenses.md)) replaces the
procedural path for buildings and nature while keeping canvas as the fallback.
See [`web3d-client.md`](../web3d-client.md) §"Look" for the full texture list.
