---
title: Visual verification (headless screenshots)
description: See your own 3D changes via the headless Playwright screenshot harness.
---

# Visual verification

This is a visual product — you cannot judge layout, models, lighting, or
"feel" from code alone. Use the headless screenshot harness to eyeball changes.

## Run

```sh
pnpm dev:server     # sim API on :5174  (one terminal / backgrounded)
pnpm dev            # vite client on :5175
pnpm playtest:game  # writes tmp/playtest-artifacts/game/{01-spawn,02-walked,03-orbit}.png
```

Then open/Read the PNGs. The harness (`tests/playtests/game-shots.ts`) loads
the game, clicks through start → character → play, suppresses the onboarding
modal, walks the player, and snaps a few frames. It prints a clear error if
the servers aren't running.

The landing site has a sibling harness:

```sh
pnpm playtest:astro-landing
```

## Caveats

Headless WebGL is software-rendered (SwiftShader), so:

- FPS and exact shading differ from a real GPU.
- WebGPU features (in-browser LLM, Kokoro) don't run.

But geometry, character models, placement, and composition all render, which
is enough to catch most layout/look regressions.

## Rival guide acceptance

`tests/playtests/game-shots.ts` also exercises the Rival guided onboarding
pause/resume flow. Set `GAME_RIVAL_GUIDE=1` to force the Rival world for the
playtest.

## Related

- [`performance.md`](./performance.md) — real-device profiling plan.
- [`testing.md`](./testing.md) — full test command reference.
