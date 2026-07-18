---
title: ADR-003 — Street waypoint graph for NPC navigation
description: Dijkstra over a deterministic waypoint graph instead of Recast/Detour navmesh.
---

Decided ~2026-05-21.

## Context

NPCs need to walk between districts across a schema-generated city that changes
shape with each imported world.

## Decision

Deterministic street waypoint graph — courtyards → gate midpoints → street
polylines — with Dijkstra for routing.

## Rationale

Recast/Detour requires a baked navmesh tied to finalized geometry; schema-
generated cities change layout per world, so a bake step would either run at
import time (slow) or be impossible ahead of time. The belt-layout worldgen
keeps paths unobstructed, making a waypoint graph sufficient. The graph is
generated from the same data that drives rendering, so it is always consistent
and is unit-tested for connectivity.

## Alternatives considered

- Recast/Detour WASM (navmesh bake per import)
- A* on a uniform grid (wasteful for open streets)
- pathfinding-js (not navmesh-aware)

## Tradeoffs

The waypoint graph does not handle dynamically placed obstacles. Combat does
not reroute around fighters. This is acceptable for the current scale.
