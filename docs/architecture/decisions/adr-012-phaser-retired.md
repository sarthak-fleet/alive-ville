---
title: ADR-012 — Phaser 2D retired, R3F is the only runtime
description: The 2D Phaser client was deleted on 2026-06-12; R3F is now the only runtime.
---

Decided 2026-06-12 (Phaser retired).

## Context

The project started with Phaser for the 2D prototype
([`agent-town-handoff.md`](../../archive/agent-town-handoff.md),
[`init.md`](../../archive/init.md)), then built a parallel R3F 3D client that
became the active track.

## Decision

Phaser 2D client was deleted on 2026-06-12; R3F is now the only runtime.

## Rationale

The 2D client served its purpose (prove the simulation core, deliver a first
playable loop) but fell behind the 3D client in features and test coverage.
Maintaining two render targets was slowing the roadmap. The simulation engine
(`src/`) was always runtime-agnostic; retiring the 2D shell did not affect any
sim logic.

## Tradeoffs

Phaser's built-in tilemap, camera, and input systems were convenient for 2D
prototyping. R3F required more manual wiring (pointer-lock, navgraph, NPC
locomotion) but gave full control over the 3D scene. The Phaser dependency
remains in `package.json` and
[`recommendation-context.md`](../../product/recommendation-context.md) as an
artifact of the audit snapshot; it is not used in the active build.

## Related

- Retro: [`2026-05-21-phaser-to-r3f.md`](../../knowledge/retros/2026-05-21-phaser-to-r3f.md)
