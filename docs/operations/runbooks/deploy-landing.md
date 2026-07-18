---
title: Runbook — deploy the landing site
description: Ship the Astro marketing site to Cloudflare Pages.
---

# Runbook — deploy the landing site

Ship the Astro marketing site (`astro-landing/`) to Cloudflare Pages project
`aliveville`. The landing site is live at https://aliveville.com/ and is
**do not modify** product surface — only deploy it.

## Prerequisites

- `main` is green (CI passing).
- The change you are deploying has been reviewed. The landing site is a live
  marketing surface; treat edits as production.

## Steps

1. **Trigger the workflow.**

   Go to GitHub Actions → `Deploy aliveville landing` → `Run workflow` on
   `main`. This is a `workflow_dispatch` workflow
   (`.github/workflows/deploy-aliveville.yml`).

   The workflow:
   - Checks out the repo.
   - Sets up Node 22 (npm, cache `astro-landing/package-lock.json`).
   - Runs `npm ci` + `npm run build` in `astro-landing/`.
   - Deploys `astro-landing/dist` to Cloudflare Pages project `aliveville`
     on `main` branch.
   - Smokes production: `curl --fail https://aliveville.com/`.

2. **Verify in a real browser.**

   Open https://aliveville.com/ and confirm:
   - Hero renders, no layout shift.
   - Navigation works.
   - `/privacy` and `/terms` are reachable.
   - No console errors.

## Notes

- The landing site uses `npm` (not pnpm) — see
  `astro-landing/package-lock.json`. Do not introduce a `pnpm-lock.yaml`
  there; dual-lockfile drift broke Pages in May 2026 (fleet lesson).
- The landing site is a separate Cloudflare Pages project from the game
  Worker. They share the `aliveville.com` zone but are independent deploys.

## Related

- [`../deploy.md`](../deploy.md) — deploy process overview.
- [`../ci.md`](../ci.md) — `deploy-aliveville.yml` workflow details.
- `astro-landing/` — the marketing site source.
