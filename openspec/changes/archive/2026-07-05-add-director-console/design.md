## Context

Aliveville's current HUD is player-first: objective, quest tracker, minimap, Chronicle modal, dialogue, and a few utility chips. The simulation already exposes most operator primitives through existing endpoints: agent loop status/start/stop/step, checkpoints, world state, SSE tick summaries, and Chronicle events.

GOD's UI is better for operator work because it keeps replay controls, resident roster, downloads, and operator trace in one map-adjacent rail. Aliveville should adopt that product pattern inside the 3D HUD without replacing its gameplay UI.

## Goals / Non-Goals

**Goals:**

- Add an optional Director Console opened from a HUD chip.
- Keep the console local to the current live session and reuse existing APIs.
- Let an operator pause/resume/step the world, inspect latest loop status, scan NPCs, read latest summary actions, and inspect Chronicle entries.
- Use a right-side rail similar to GOD's map-first control-room layout when open.

**Non-Goals:**

- No GOD code import.
- No Python/FastAPI/AgentSociety/JiuwenClaw runtime integration.
- No new production dependencies.
- No creator setup wizard, pack import/export, map editor, or hosted replay viewer in this slice.
- No default player-flow takeover; the console is hidden until opened.

## Decisions

1. **Use existing agent-loop endpoints instead of new backend routes.**
   - Rationale: local and Worker paths already expose status/start/stop/step. The console can add value with a thin client wrapper.
   - Alternative considered: add a new `/api/director` aggregate endpoint. Rejected for this slice because it broadens API parity work and duplicates state already available from `/api/state` and `/api/agent-loop/status`.

2. **Use a HUD rail instead of a separate route.**
   - Rationale: tuning the live 3D game requires seeing the scene while stepping the simulation.
   - Alternative considered: GOD-style standalone replay page. Useful later, but it would not help the immediate playability gate as directly.

3. **Keep intervention read-only/control-only in v1.**
   - Rationale: step/pause/inspect is safe and already supported. Free-form intervention changes world semantics and needs a separate proposal.
   - Alternative considered: add `/intervene` commands immediately. Rejected to avoid an untested authoring surface before the Rival slice is fun.

4. **Use text buttons/chips consistent with the existing HUD.**
   - Rationale: this repo does not already carry an icon library, and adding one only for this rail would violate the small-diff/no-new-dependency constraint.

## Risks / Trade-offs

- **Rail overlaps gameplay HUD on small screens** -> make it responsive, width-bounded, scrollable, and dismissible.
- **Step while loop is running creates confusing state** -> pause before stepping from the console.
- **Operator UI distracts from player polish** -> keep it hidden behind a Director chip and avoid adding onboarding text.
- **Worker/local endpoint parity may differ** -> use endpoints that exist in both local server and Worker DO; handle unavailable restore/checkpoints defensively.
