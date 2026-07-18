---
title: Testing
description: Test commands, structure, coverage, and the lifelikeness probe harness.
---

# Testing

## Commands

```sh
pnpm test                 # Vitest (63 files)
pnpm test:gameplay        # subset: gameplay-loop, world, quests
pnpm test:coverage        # Vitest with coverage
pnpm test:watch           # Vitest watch mode
pnpm test:ui              # Vitest UI
pnpm probe:lifelikeness   # lifelikeness regression CLI (src/probes/)
pnpm playtest:game        # headless Playwright 3D smoke + screenshots
pnpm playtest:astro-landing   # Astro landing build/preview smoke
pnpm verify:readiness     # typecheck + lint + test + build:3d
```

## Structure

- **`tests/`** — 63 Vitest files covering simulation, combat, dialogue,
  coherence, chronicle, currency, director, ingest, LLM router, server
  integration, Rival onboarding, and web3d identity/worldgen/UI/mood/minimap.
- **`tests/playtests/game-shots.ts`** — headless Playwright 3D smoke plus
  Rival guide pause/resume acceptance. Writes
  `tmp/playtest-artifacts/game/*.png`.
- **`tests/playtests/astro-landing.ts`** — Astro landing smoke.
- **`src/probes/`** — lifelikeness regression harness (5 probes: identity,
  memory, sycophancy, divergence, grounding). See
  [`../architecture/probes-harness.md`](../architecture/probes-harness.md).

## CI

CI runs `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, and
`pnpm run size` on every push/PR to `main`. See
[`../operations/ci.md`](../operations/ci.md).

## Visual verification

The 3D client cannot be judged from code alone. See
[`visual-verification.md`](./visual-verification.md) for the headless
screenshot harness.

## Coverage

`pnpm test:coverage` writes to `coverage/` (gitignored). Coverage is not
enforced as a gate; the playtest + probe harnesses are the primary
behavioral gates.
