---
title: Aliveville docs
description: The canonical knowledge system for the Aliveville / ai-game repository.
sidebar:
  order: 0
---

# Aliveville docs

This is the canonical knowledge system for the Aliveville / `ai-game`
repository. The committed Markdown here is the source of truth;
[Blume](https://useblume.dev) is only the presentation and search layer.

- **Short current view**: [`../STATUS.md`](../STATUS.md)
- **Deep timeline + feature log**: [`../PROJECT_STATUS.md`](../PROJECT_STATUS.md)
- **Agent bootloader**: [`../AGENTS.md`](../AGENTS.md)
- **Product readme**: [`../README.md`](../README.md)

## Product

- [overview.md](./product/overview.md) — what Aliveville is, scope, capability matrix.
- [positioning.md](./product/positioning.md) — differentiation vs AI Dungeon; product lane.
- [assets-and-licenses.md](./product/assets-and-licenses.md) — third-party assets, code references, licenses.
- [recommendation-context.md](./product/recommendation-context.md) — Starboard recommendation audit snapshot.

## Architecture

- [how-it-works.md](./architecture/how-it-works.md) — end-to-end runtime tour: tick loop, agent brains, LLM routing, fandom ingest.
- [overview.md](./architecture/overview.md) — layers, runtime surfaces, critical invariants.
- [web3d-client.md](./architecture/web3d-client.md) — 3D browser client (R3F + Three + Rapier) module map.
- [llm-routing.md](./architecture/llm-routing.md) — local-LLM backends, env vars, precedence.
- [probes-harness.md](./architecture/probes-harness.md) — lifelikeness regression probe design.

### Decisions

- [adr-001-r3f-3d-runtime.md](./architecture/decisions/adr-001-r3f-3d-runtime.md) — R3F + Three.js over Babylon.js.
- [adr-002-rapier-physics.md](./architecture/decisions/adr-002-rapier-physics.md) — @react-three/rapier for physics.
- [adr-003-street-waypoint-graph.md](./architecture/decisions/adr-003-street-waypoint-graph.md) — waypoint graph over Recast navmesh.
- [adr-004-durable-objects-per-session.md](./architecture/decisions/adr-004-durable-objects-per-session.md) — one DO per visitor session.
- [adr-005-interval-agent-loop.md](./architecture/decisions/adr-005-interval-agent-loop.md) — interval polling agent loop.
- [adr-006-openai-compatible-router.md](./architecture/decisions/adr-006-openai-compatible-router.md) — OpenAI-compatible endpoint abstraction.
- [adr-007-tiered-model-selection.md](./architecture/decisions/adr-007-tiered-model-selection.md) — normal/quest/propose/research tiers.
- [adr-008-engine-validated-json-actions.md](./architecture/decisions/adr-008-engine-validated-json-actions.md) — LLM proposes, engine validates.
- [adr-009-prompt-format-no-tool-calling.md](./architecture/decisions/adr-009-prompt-format-no-tool-calling.md) — system+user turns, JSON-in-reply.
- [adr-010-cloudflare-workers-assets.md](./architecture/decisions/adr-010-cloudflare-workers-assets.md) — Workers + Assets single deploy.
- [adr-011-canvas-generated-textures.md](./architecture/decisions/adr-011-canvas-generated-textures.md) — runtime canvas textures, zero binary assets.
- [adr-012-phaser-retired.md](./architecture/decisions/adr-012-phaser-retired.md) — Phaser 2D retired, R3F is the only runtime.

## Development

- [setup.md](./development/setup.md) — dev environment, ports, env vars.
- [testing.md](./development/testing.md) — test commands, structure, coverage.
- [visual-verification.md](./development/visual-verification.md) — headless screenshot harness for 3D changes.
- [performance.md](./development/performance.md) — web3d perf notes and profiling plan.
- [docs.md](./development/docs.md) — how the docs tree is organized, validated, and rendered.

## Operations

- [ci.md](./operations/ci.md) — GitHub Actions workflows.
- [deploy.md](./operations/deploy.md) — manual deploy process and guards.
- [runbooks/deploy-game-worker.md](./operations/runbooks/deploy-game-worker.md) — ship the game Worker + 3D client.
- [runbooks/deploy-landing.md](./operations/runbooks/deploy-landing.md) — ship the Astro marketing site.

## Knowledge

- [prior-art-port-plan.md](./knowledge/prior-art-port-plan.md) — what to steal from OSS agent projects.
- [research-lifelikeness.md](./knowledge/research-lifelikeness.md) — evidence-ranked lifelikeness mechanisms + gap analysis.
- [failed-approaches.md](./knowledge/failed-approaches.md) — retired approaches and why they failed.

### Learnings

- [lessons.md](./knowledge/learnings/lessons.md) — hard-won implementation lessons.
- [external-references.md](./knowledge/learnings/external-references.md) — one-line "what / why here / link" entries.
- [new-things.md](./knowledge/learnings/new-things.md) — technologies and patterns that were genuinely new during the build.

### Experiments

- [index.md](./knowledge/experiments/index.md) — spike conventions and index.
- [image-to-3d-bakeoff.md](./knowledge/experiments/image-to-3d-bakeoff.md) — TRELLIS vs Hunyuan3D-2.
- [sadtalker-dialogue.md](./knowledge/experiments/sadtalker-dialogue.md) — animated NPC dialogue close-ups.
- [vrm-baseline.md](./knowledge/experiments/vrm-baseline.md) — VRM character swap snapshot.

### Research

- [game-mechanics-audit.md](./knowledge/research/game-mechanics-audit.md) — AAA RPG mechanics scorecard + OSS libraries.

### Retros

- [2026-05-21-phaser-to-r3f.md](./knowledge/retros/2026-05-21-phaser-to-r3f.md) — Phaser 2D → R3F 3D transition.
- [2026-06-12-single-to-cf-worker.md](./knowledge/retros/2026-06-12-single-to-cf-worker.md) — local dev server → CF Workers + DO.

## Current

- [core-gameplay-fix.md](./current/core-gameplay-fix.md) — capped milestone plan (the gate for north-star work).
- [roadmap.md](./current/roadmap.md) — 2026-06-13 paused roadmap snapshot.

## Archive

- [init.md](./archive/init.md) — original research-phase brief (superseded by PROJECT_STATUS.md).
- [agent-town-handoff.md](./archive/agent-town-handoff.md) — retired 2D Agent Town client handoff.
- [future-prd-deferred-north-star-2026-06-12.md](./archive/future-prd-deferred-north-star-2026-06-12.md) — deferred XL north-star PRD.
- [web-frontier-prd-shipped-2026-06-14.md](./archive/web-frontier-prd-shipped-2026-06-14.md) — shipped web-frontier capability PRD.
