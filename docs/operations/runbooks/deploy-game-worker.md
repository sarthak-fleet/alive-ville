---
title: Runbook — deploy the game Worker
description: Ship the Aliveville game Worker and 3D client to Cloudflare.
---

# Runbook — deploy the game Worker

Ship the Aliveville game Worker (`aliveville`) and the built 3D client to
Cloudflare. The Worker serves the static 3D client via Workers Assets and
routes `/game/api/*` to per-visitor `GameSessionDO` instances.

## Prerequisites

- `main` is green (CI passing).
- Working tree is clean and on `main`, synced with `origin/main`.
- `pnpm verify:readiness` passes locally.
- `pnpm playtest:game` passes (zero console/page errors).
- For frontier-feature changes: real-device GPU verification done.
- Wrangler authed (`npx wrangler login` or `CLOUDFLARE_API_TOKEN` env).
- Secrets set: `LLM_API_KEY`, `ADMIN_TOKEN`
  (`npx wrangler secret put <name>`).

## Steps

1. **Build the 3D client.**

   ```sh
   pnpm build:3d
   ```

   Output: `dist/site/game/`. Served by the Worker via the `ASSETS` binding
   (`wrangler.jsonc` `assets.directory`).

2. **Deploy the Worker.**

   ```sh
   npx wrangler deploy
   ```

   This ships both the static assets and the DO-backed Worker in one command.
   Route: `aliveville.com/game*`.

3. **Smoke production.**

   ```sh
   curl --fail --silent --show-error --location https://aliveville.com/game/ --output /dev/null
   ```

   Then open https://aliveville.com/game in a real browser and:
   - Confirm the start screen renders.
   - Start a session and walk the player.
   - Open dialogue with an NPC.
   - Check the browser console for errors.

## Rollback

Wrangler keeps recent deployments. To roll back:

```sh
npx wrangler deployments list
npx wrangler rollback
```

If the rollback is insufficient, redeploy the previous `main` commit:

```sh
git checkout <previous-good-sha>
pnpm build:3d && npx wrangler deploy
git checkout main
```

## Related

- [`../deploy.md`](../deploy.md) — deploy process overview.
- [`../../architecture/overview.md`](../../architecture/overview.md) —
  Worker + DO architecture.
- `wrangler.jsonc` — Worker config, routes, DO migrations, service bindings.
