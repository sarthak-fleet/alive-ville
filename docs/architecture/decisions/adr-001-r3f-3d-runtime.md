---
title: ADR-001 — Three.js + React Three Fiber as the 3D runtime
description: Chose R3F + drei over Babylon.js for schema-driven 3D worldgen.
---

Decided ~2026-05-21 (first 3D commits).

## Context

The project needed a browser-native 3D renderer that could generate a full
walkable town from a JSON schema with zero pre-authored scene assets.

## Decision

Three.js + R3F + drei, not Babylon.js.

## Rationale

R3F exposes Three.js as React components, which fits the data-driven worldgen
approach — scenes built from world JSON, not from a visual editor. Drei supplies
camera controls, postprocessing, and physics helpers without extra framework
lock-in. Babylon.js was the stated runner-up; it has built-in physics and
navmesh tools, but it would have imposed a separate scene-graph API on top of
Three's, making the React HUD boundary messier.

## Alternatives considered

- Babylon.js (built-in navmesh, physics)
- PlayCanvas (ECS-native)
- Godot export to WebGL (shelved as out-of-scope)

## Tradeoffs

R3F's `useFrame` loop requires discipline about re-renders — NPC and player
positions are driven imperatively from refs rather than React state to avoid
per-frame reconciliation overhead. See
[`web3d-client.md`](../web3d-client.md) §"Sim ↔ client sync".
