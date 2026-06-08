# Project Recommendation Context

Generated: 2026-06-06T21:14:19.558Z

This file is a CodeVetter Repo Unpacked-inspired audit written for Starboard recommendations. It is intentionally local, evidence-oriented, and safe to commit: it records product context, feature areas, stack inventory, and recommendation guidance without secrets or environment values.

## Project Identity

- Slug: `ai-game`
- Registry description: Persistent AI world simulator — interactive RPG-style multi-agent game.
- Product grouping: `internal-first`
- Source path: `ai-game`

## Product Context

Persistent AI world simulator — interactive RPG-style multi-agent game.

Aliveville is a browser-playable AI world simulator. The active product track is the 2D Agent Town RPG: a spatial world with rooms, quests, visible NPCs, persistent state, save/load, and replayable route completion.

Aliveville / AI World Simulator Website: https://aliveville.com Aliveville is an AI world simulator with a 2D browser RPG client as the active player-facing track. The TypeScript app in this repo owns the simulation server, world ingest, autonomous agent loop, quests, saves, and browser game surface. The Unreal project under unreal/AshmentUnreal remains a shelved bridge target for a later rebuild. Direction We are finishing the browser 2D RPG first: readable top-down exploration, quest objectives, stateful fights, visible AI agents, save/load, world ingest, and route-complete replay. The 3D browser and Unreal tracks stay available as old experimental surfaces, but they should not block the p

## Feature Map

- **Game and simulation**: Game loops, simulations, world state, NPC behavior, physics, and interactive gameplay. Keywords: game, simulation, simulator, world, npc, character, gameplay, physics.
- **AI agents**: Agents, tool use, workflows, orchestration, RAG, evals, and model integration. Keywords: ai, agent, agents, llm, rag, embedding, eval, model.
- **UI workflows**: Dashboards, tables, forms, component systems, charts, and user workflows. Keywords: ui, ux, dashboard, table, component, react, next, tailwind.
- **Testing and quality**: Unit tests, browser tests, evals, CI quality gates, and regression checks. Keywords: test, testing, quality, vitest, playwright, ci, eval, benchmark.
- **Content and media**: Content production, video, reels, documents, markdown, and publishing workflows. Keywords: content, media, video, reel, markdown, document, publish, editor.
- **Browser and extensions**: Browser extensions, page capture, annotation, automation, and client-side integrations. Keywords: browser, extension, chrome, annotation, capture, webpage, reader.

## Runtime Surfaces and Entrypoints

- `src/index.ts`

## Current Stack

- Languages: `Astro`, `TypeScript`
- Frameworks/tools: `Astro`, `Playwright`, `React`, `Tailwind CSS`, `Vitest`
- Config files:
- `astro-landing/astro.config.mjs`
- `playwright.config.ts`
- `vite.config.ts`
- `vitest.config.ts`

## OSS Already In Use

Direct dependencies:
- `@tailwindcss/vite`
- `@types/three`
- `astro`
- `phaser`
- `posthog-js`
- `react`
- `react-dom`
- `tailwindcss`
- `three`
- `zustand`

Development dependencies:
- `@eslint/js`
- `@playwright/test`
- `@saas-maker/eslint-config`
- `@saas-maker/prettier-config`
- `@saas-maker/test-config`
- `@saas-maker/tsconfig`
- `@types/node`
- `@types/react`
- `@types/react-dom`
- `@types/three`
- `@vitejs/plugin-react`
- `@vitest/ui`
- `eslint`
- `lightningcss`
- `prettier`
- `prettier-plugin-tailwindcss`
- `tsx`
- `typescript`
- `vite`
- `vitest`

Package scripts:
- `astro`
- `bench:commercial`
- `bench:completion`
- `bench:differentiation`
- `bench:expanded`
- `budget:bundle`
- `build`
- `dev`
- `dev:server`
- `eval:llm`
- `eval:lmstudio`
- `lint`
- `playtest:alive`
- `playtest:all`
- `playtest:astro-landing`
- `playtest:basic-v0`
- `playtest:first-loop`
- `playtest:opm`
- `playtest:production`
- `playtest:world-ingest`
- `preview`
- `research:url`
- `serve`
- `serve:production`
- `start`
- `test`
- `test:gameplay`
- `test:ui`
- `test:watch`
- `typecheck`
- `verify:readiness`

## Testing and Quality Signals

- `astro-landing/public/assets/game/opm_test/README.md`
- `astro-landing/public/assets/game/opm_test/genos.svg`
- `astro-landing/public/assets/game/opm_test/mumen-rider.svg`
- `astro-landing/public/assets/game/opm_test/saitama.svg`
- `astro-landing/public/assets/game/opm_test/sonic.svg`
- `astro-landing/public/assets/game/opm_test/tatsumaki.svg`
- `playwright.config.ts`
- `tests/agent-checkpoint-store.test.ts`
- `tests/agent-loop.test.ts`
- `tests/agent-state.test.ts`
- `tests/agent-town-duels.test.ts`
- `tests/agent-town-gossip.test.ts`
- `tests/agent-town-initiatives.test.ts`
- `tests/agent-town-memory.test.ts`
- `tests/agent-town-upgrades.test.ts`
- `tests/agent-town-world-tick.test.ts`
- `tests/ambient.test.ts`
- `tests/anime-ingest.test.ts`
- `tests/bundle-budget.test.ts`
- `tests/commercial-readiness.test.ts`
- `tests/competitive-differentiation.test.ts`
- `tests/completion-benchmarks.test.ts`
- `tests/cutscenes.test.ts`
- `tests/director.test.ts`
- `tests/expanded-completion-benchmarks.test.ts`
- `tests/gameplay-loop.test.ts`
- `tests/hints.test.ts`
- `tests/llm.test.ts`
- `tests/map-data.test.ts`
- `tests/objectives.test.ts`
- `tests/one-punch-man.test.ts`
- `tests/playtests/alive-village.ts`
- `tests/playtests/astro-landing.ts`
- `tests/playtests/basic-v0.ts`
- `tests/playtests/first-loop.ts`
- `tests/playtests/opm-world.ts`
- `tests/playtests/production-build.ts`
- `tests/playtests/world-ingest.ts`
- `tests/proposer.test.ts`
- `tests/quests.test.ts`
- `tests/replay.test.ts`
- `tests/research.test.ts`

## Recommendation Guidance

Good matches:
- Repos that strengthen game and simulation without replacing already-installed libraries.
- Repos that strengthen ai agents without replacing already-installed libraries.
- Repos that strengthen ui workflows without replacing already-installed libraries.
- Repos that strengthen testing and quality without replacing already-installed libraries.
- Repos that strengthen content and media without replacing already-installed libraries.
- Repos that strengthen browser and extensions without replacing already-installed libraries.
- Tools with concrete support for unreal, browser, world, agent, game, rpg, simulation, active.
- Implementation repos, SDKs, CLIs, testing utilities, adapters, and focused libraries are higher value than generic awesome lists.

Avoid recommending:
- Do not recommend packages already listed under direct or development dependencies unless the task is migration research.
- Do not recommend broad framework replacements unless the project context explicitly calls for a rewrite.
- Downrank curated lists, archived repos, stale demos, and generic UI kits that do not map to the feature catalog.

## Evidence Read

Primary docs and handoff files:
- `AGENTS.md`
- `PROJECT_STATUS.md`
- `README.md`
- `docs/agent-town-handoff.md`
- `docs/ai-dungeon-differentiation.md`
- `docs/third-party-assets.md`

Package manifests:
- `astro-landing/package.json`
- `package.json`

Inventory notes:
- Files scanned: 296
- This pass uses deterministic repo inventory plus local documentation/source-path evidence. It does not claim a full manual line-by-line review of every source file.

## Confidence

Confidence: **medium**

Why:
- PROJECT_STATUS.md present
- README.md present
- package dependencies inventoried
- 42 test/quality files identified

Refresh command:

```bash
cd /Users/sarthak/Desktop/fleet/starboard
pnpm fleet:audit-recommendation-context
pnpm fleet:extract-projects
```
