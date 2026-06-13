# Retro: Phaser 2D → R3F 3D as the active client

**Date**: 2026-05-21 (first 3D commits)  
**Phase**: Parallel build of R3F client while Phaser 2D was still active

---

## What changed

A full R3F 3D client (`web3d/`) was built in parallel with the Phaser 2D client.
By 2026-05-21 the 3D client had caught up to and surpassed the 2D client in
features (procedural worldgen, walkable city, SSE agent loop, character models).
The 2D Phaser client became the legacy track and was formally retired on
2026-06-12.

---

## What went well

- Keeping the simulation engine (`src/`) runtime-agnostic meant zero sim changes
  were needed when the 3D client took over. The R3F client calls the same
  `/api/tick` and `/api/events` endpoints.
- Starting with Phaser proved the simulation core and LLM loop before investing
  in 3D complexity. The `init.md` rule ("text before visuals") held up.
- R3F's React model fit the data-driven worldgen approach naturally —
  schema JSON → scene components without a visual editor.

## What was painful

- Running two render targets slowed feature work. Every new sim feature needed
  to be surfaced in both clients until the 2D client was retired.
- The Phaser client's tilemap-based level design (OpenRTP tiles, Tiled JSON maps)
  had no direct equivalent in R3F; the 3D client needed a full worldgen system
  from scratch.
- Playwright smoke tests needed to target either the 2D or 3D client explicitly;
  this caused confusion during the transition period.

## Decision made

→ See `docs/decisions.md` ADR-012: Phaser retired 2026-06-12; R3F is the only
active runtime.

## What carries forward

- The validation discipline ("LLM proposes, engine validates") is unchanged.
- All sim tests remain valid; they never touched the render layer.
- Phaser listed in `package.json` is a dead dependency artifact; can be removed
  in a future cleanup pass.
