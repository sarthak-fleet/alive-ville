# Status

Last updated: 2026-07-18

> Short current view. For the deep timeline + feature log, see
> [`PROJECT_STATUS.md`](./PROJECT_STATUS.md). For the docs index, see
> [`docs/index.md`](./docs/index.md).

## Current objective

Aliveville is a browser-playable AI world simulator at aliveville.com/game.
The current portfolio state is **support / capped experiment**. The
Rival-readiness milestone is closed for now under an explicit product-owner
deferment. No human fun/not-fun verdict was recorded; require one before
resuming feature expansion.

## Active work

- **Documentation consolidation** — this knowledge system (in progress,
  2026-07-18): reorganized `docs/` into a canonical structure, split ADRs
  into individual files, added Blume presentation layer + validation.
- **Rival guided onboarding** — shipped (capped 2026-07-13). The move →
  talk → fight → consequence guide is wired; the human playtest verdict is
  deferred.

## Blockers

- **Human Rival playtest verdict** — the product owner closed the capped
  Rival-readiness milestone without conducting the playtest. No fun/not-fun
  verdict is claimed. This is the first gate before any deferred north-star
  expansion. See
  [`docs/current/core-gameplay-fix.md`](./docs/current/core-gameplay-fix.md) §5.
- **Worker DO parity** — 5 local-server endpoints missing on the Worker DO
  (`story-package`, `import-story-package`, `load`, `restore-checkpoint`,
  `portrait`). Prod parity blocked until ported.
- **Game worker deploy is manual** — CI does not deploy the game Worker.
  See [`docs/operations/deploy.md`](./docs/operations/deploy.md).

## Unresolved questions

- Should the human Rival playtest be conducted before or after wiring the
  vendor/shop UI? (Economy actions exist; the UI does not.)
- When should the 5 missing local-only endpoints be ported to the Worker DO?
- Is a published docs domain (docs.aliveville.com) warranted, or do the
  committed Markdown + Blume local build suffice for now?

## Next steps

1. Conduct a fresh Rival session without developer help; record the
   fun/not-fun verdict plus any confusion, combat-feel, or consequence-
   legibility failures. See
   [`docs/current/core-gameplay-fix.md`](./docs/current/core-gameplay-fix.md) §5.
2. Wire the in-game buy/sell vendor/shop UI for the coin economy
   (`web3d/` HUD + `src/` economy actions).
3. Add interior depth: quest NPC inside an anchor building, interior
   interactables/clues (`web3d/src/interiors/`).
4. Enable cloud LLM mode when ready: add `LLM_API_KEY` to `.env` /
   `npx wrangler secret put LLM_API_KEY`.
5. Real-device verification of frontier GPU/AI/TTS features; deploy frontier
   build to prod when ready.
