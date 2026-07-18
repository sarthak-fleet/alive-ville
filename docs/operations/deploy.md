---
title: Deploy process
description: Manual deploy guards for the game Worker and the landing site.
---

# Deploy process

Production deploys are **manual**. `main` should stay releasable and green,
but CI is not an automatic production trigger. This matches the fleet standard
in `../AGENTS.md`.

## Game Worker (manual)

The game Worker (`aliveville`) is deployed by hand after `pnpm build:3d`. See
[`runbooks/deploy-game-worker.md`](./runbooks/deploy-game-worker.md).

```sh
pnpm build:3d && npx wrangler deploy
```

The `scripts/manual-deploy.mjs` guard is available for workflow-triggered
deploys (used by `deploy-aliveville.yml`); it checks branch, dirty tree, and
upstream sync before invoking a workflow. The game Worker deploy does not use
it — it is a direct `wrangler deploy`.

## Landing site (manual via workflow_dispatch)

The Astro landing site is deployed via the `deploy-aliveville.yml` workflow,
triggered manually from the GitHub Actions UI. See
[`runbooks/deploy-landing.md`](./runbooks/deploy-landing.md).

## Secrets

Wrangler secret names (names only — never commit values):

- `LLM_API_KEY` — set via `npx wrangler secret put LLM_API_KEY`.
- `ADMIN_TOKEN` — set via `npx wrangler secret put ADMIN_TOKEN`.

Vars (`LLM_BASE_URL`, `LLM_MODEL_*`, `LLM_TIMEOUT_MS`, `LLM_PROJECT_ID`) are
declared in `wrangler.jsonc`.

## Pre-deploy checks

Before deploying the game Worker:

1. `pnpm verify:readiness` passes (typecheck + lint + test + build:3d).
2. `pnpm playtest:game` passes (headless smoke, zero console/page errors).
3. Working tree is clean and on `main`, synced with `origin/main`.
4. Real-device GPU verification for any frontier-feature changes (WebGPU,
   Kokoro, local LLM) — headless smoke is not sufficient.

## Related

- CI: [`ci.md`](./ci.md)
- `wrangler.jsonc`: `../../wrangler.jsonc`
- Manual deploy guard: `../../scripts/manual-deploy.mjs`
