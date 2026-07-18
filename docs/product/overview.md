---
title: Product overview
description: What Aliveville is, durable scope, capability matrix, and strategy.
---

# Aliveville — product overview

**Aliveville** is a browser-playable AI world simulator at
**aliveville.com/game**. The product thesis: a living town where autonomous
NPC agents, quests, combat, and LLM dialogue make a small district feel alive
— not a tech demo of frontier APIs.

## Naming

- **Local checkout**: `ai-game`
- **GitHub repository**: `sarthakagrawal927/aliveville`
- **Public product name**: AliveVille

## Users

- Players exploring a 3D anime-chibi town.
- Fleet operators deploying the sim edge stack.
- Future creators importing fandom or original worlds.

## Scope

**In scope**: 3D client (`web3d/`), simulation server (`src/`), Cloudflare
Worker edge (`worker/`), probes, headless playtests.

**Out of scope**: 2D Phaser client (retired — see
[`adr-012-phaser-retired.md`](../architecture/decisions/adr-012-phaser-retired.md)),
Unreal bridge, broad marketing changes, production frontier deploy without
real-device GPU verification.

## Current state (2026-07-13)

**Support / capped experiment.** The Rival-readiness milestone is closed for
now under an explicit product-owner deferment. No human fun/not-fun verdict was
recorded; require one before resuming feature expansion. See
[`../STATUS.md`](../../STATUS.md) and
[`../current/core-gameplay-fix.md`](../current/core-gameplay-fix.md) §5.

## Capability matrix

| Capability | Status | Notes |
| --- | --- | --- |
| 3D walkable town from schema | shipped | deterministic worldgen; see [`web3d-client.md`](../architecture/web3d-client.md) |
| Real-time melee combat | shipped | combo, dodge i-frames, lock-on, enemy AI, HP bars |
| LLM dialogue with engine-validated actions | shipped | see [`adr-008-engine-validated-json-actions.md`](../architecture/decisions/adr-008-engine-validated-json-actions.md) |
| Autonomous agent loop | shipped | interval polling; see [`adr-005-interval-agent-loop.md`](../architecture/decisions/adr-005-interval-agent-loop.md) |
| Rumor → confrontation pipeline | shipped | NPC↔NPC drama loop |
| Director system (villain plan, story pressure) | shipped | mood shifts, cutscenes |
| Chronicle + reflection | shipped | Smallville-style reflection |
| Fandom world ingest | shipped | Demon Slayer, One Punch Man, custom |
| In-browser LLM (WebGPU) | shipped | cloud fallback; see [`llm-routing.md`](../architecture/llm-routing.md) |
| Kokoro TTS + Web Speech | shipped | see `web3d/src/platform/` |
| OPFS multi-slot saves | shipped | |
| PWA | shipped | manifest + service worker (prod-only) |
| Director Console (operator rail) | shipped | see `openspec/specs/director-console/spec.md` |
| Rival guided onboarding | shipped (capped) | see `openspec/specs/rival-guided-onboarding/spec.md` |
| Human fun verdict | deferred | gate for north-star work |
| Vendor/shop UI | planned | economy actions exist, UI not wired |
| Interior depth + interactables | planned | |
| Worker DO parity with local server | blocked | 5 endpoints missing |

## Strategy

The differentiator is **structured world compilation + autonomous agents whose
drama is made legible as player-caused consequence** inside a high-fidelity,
instantly playable 3D browser surface, at sustainable cost. See
[`positioning.md`](./positioning.md) and
[`../knowledge/research-lifelikeness.md`](../knowledge/research-lifelikeness.md).

## Related

- Deep feature log: [`../../PROJECT_STATUS.md`](../../PROJECT_STATUS.md)
- Differentiation: [`positioning.md`](./positioning.md)
- Assets and licenses: [`assets-and-licenses.md`](./assets-and-licenses.md)
