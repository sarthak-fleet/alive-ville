---
title: ADR-002 — @react-three/rapier for physics
description: WASM Rapier via R3F binding for kinematic character controller + colliders.
---

Decided ~2026-05-21.

## Context

The 3D client needs a character controller that stops the player walking through
buildings, plus future sensor colliders for combat hitboxes.

## Decision

`@react-three/rapier` (WASM Rapier via the React Three Fiber binding).

## Rationale

Rapier is the only mature WASM physics engine with a first-class R3F binding.
Its kinematic character controller (with slope, step, and gravity configuration)
handles player movement without manual AABB math. Building colliders are
generated deterministically from the same worldgen rectangles used for
rendering, so physics geometry stays in sync with visuals at zero extra cost.

## Alternatives considered

- Cannon.js (no kinematic character controller, weaker WASM story)
- Ammo.js (large binary)
- Oimo (abandoned)
- Hand-rolled AABB (rejected — too many edge cases for slope + step-up +
  multi-building layouts)

## Tradeoffs

WASM cold-start adds ~80 ms on first load. Hit detection for melee combat was
ultimately implemented as cone checks against the NPC position registry rather
than Rapier sensor colliders, because NPC actors are visual-only (no rigid
bodies). This is a documented deviation — see
[`web3d-client.md`](../web3d-client.md) §"Combat".
