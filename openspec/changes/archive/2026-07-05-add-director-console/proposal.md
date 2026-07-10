## Why

GOD's strongest idea for Aliveville is not its pixel map or Python stack; it is the operator control room: one map-first surface for stepping the society, inspecting residents, and reading the run trace. Aliveville already has the sim loop, Chronicle, agent-loop controls, and a 3D HUD, but those controls are scattered and developer-hostile when tuning the "Rival" vertical slice.

## What Changes

- Add an optional in-game Director Console rail opened from the HUD.
- Borrow GOD's useful UI shape: world controls, resident roster, and operator trace in one right-side rail beside the live world.
- Use existing Aliveville APIs for pause/resume and step; do not import GOD's backend, runtime, or UI code.
- Keep normal player HUD behavior unchanged when the console is closed.
- Surface enough state to tune playability: agent loop status, tick, pressure, current objective, NPC locations/statuses, latest summary actions, Chronicle entries, and checkpoints when available.

## Capabilities

### New Capabilities

- `director-console`: Optional operator rail for inspecting and stepping a live Aliveville session.

### Modified Capabilities

- None.

## Impact

- `web3d/src/hud/`: new Director Console component and HUD entry point.
- `web3d/src/api/client.ts`: thin client wrappers for existing agent-loop step/status/restore endpoints as needed.
- `web3d/src/store/world.ts`: store actions for explicit step/status refresh if needed.
- `web3d/src/hud/hud.css`: rail layout and responsive styles.
- Tests: focused component/unit coverage where practical plus `pnpm typecheck`; visual verification through the existing game playtest harness if the local servers can run.
