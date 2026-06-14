## Shared Fleet Standard

Also read and follow the shared fleet-level agent standard at `../AGENTS.md`. Treat this repository as owned product code: protect production stability, keep changes scoped, verify work, and record durable follow-up tasks when something remains incomplete or blocked.

## Visual verification (see your own 3D changes)

This is a visual product — you cannot judge layout, models, lighting, or "feel"
from code alone. Use the headless screenshot harness to eyeball changes:

```bash
pnpm dev:server     # sim API on :5174  (one terminal / backgrounded)
pnpm dev            # vite client on :5175
pnpm playtest:game  # writes tmp/playtest-artifacts/game/{01-spawn,02-walked,03-orbit}.png
```

Then open/Read the PNGs. The harness (`tests/playtests/game-shots.ts`) loads the
game, clicks through start → character → play, suppresses the onboarding modal,
walks the player, and snaps a few frames. It prints a clear error if the servers
aren't running.

Caveats: headless WebGL is software-rendered (SwiftShader), so FPS and exact
shading differ from a real GPU, and WebGPU features (in-browser LLM, Kokoro)
don't run — but geometry, character models, placement, and composition all
render, which is enough to catch most layout/look regressions. The landing site
has a sibling harness: `pnpm playtest:astro-landing`.

<claude-mem-context>
# Memory Context

# [ai-game] recent context, 2026-05-03 2:29pm GMT+5:30

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 3 obs (1,350t read) | 33,363t work | 96% savings

### May 3, 2026
765 9:56a ✅ init.md added after research phase
766 " ⚖️ ai-game project created — AI World Simulator / Interactive Fandom RPG PRD
767 " ⚖️ ai-game research references — patterns to steal from AI Town, Generative Agents, AI RPG, SoulEngine

Access 33k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
