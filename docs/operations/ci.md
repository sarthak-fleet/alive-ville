---
title: CI (GitHub Actions)
description: Workflows that gate main and deploy the landing site.
---

# CI (GitHub Actions)

Workflows live in `.github/workflows/`.

## `ci.yml`

Runs on push/PR to `main`. Steps:

1. Checkout + setup Node 22 + pnpm (via corepack, pinned to `pnpm@10.33.2`).
2. `pnpm install --frozen-lockfile`
3. `pnpm typecheck`
4. `pnpm lint` (Biome)
5. `pnpm test` (Vitest)
6. `pnpm build` (Vite 3D build)
7. `pnpm run size` (size-limit bundle check)

This is the gate that keeps `main` releasable.

## `deploy-aliveville.yml`

Manual (`workflow_dispatch`) deploy of the Astro landing site to Cloudflare
Pages. Steps:

1. Checkout + setup Node 22 (npm, cache `astro-landing/package-lock.json`).
2. `npm ci` + `npm run build` in `astro-landing/`.
3. `wrangler pages deploy astro-landing/dist --project-name=aliveville --branch=main`.
4. Smoke production: `curl --fail https://aliveville.com/`.

## `docs.yml`

Runs on push/PR. Validates the docs tree (links, frontmatter, structure) via
`node scripts/check-docs.mjs`. See
[`../development/docs.md`](../development/docs.md).

## What CI does NOT do

- **Does not deploy the game Worker.** Game deploys are manual. See
  [`deploy.md`](./deploy.md) and
  [`runbooks/deploy-game-worker.md`](./runbooks/deploy-game-worker.md).
- **Does not run the lifelikeness probes.** Probes require LLM calls and are
  run manually via `pnpm probe:lifelikeness`. See
  [`../architecture/probes-harness.md`](../architecture/probes-harness.md).
- **Does not run the Playwright headless smoke.** The smoke requires running
  dev servers and is run manually via `pnpm playtest:game`. See
  [`../development/visual-verification.md`](../development/visual-verification.md).
