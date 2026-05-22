# Ashment Unreal Client

This is the real 3D client track for Aliveville / AI World Simulator. The existing web app remains useful as a debug/admin surface for world ingest, agent state, saves, and playtests. Unreal owns player-facing camera, movement, rendering, environment composition, and game feel.

## Engine Target

- Preferred: Unreal Engine 5.7 from Epic Games Launcher.
- Project file: `unreal/AshmentUnreal/AshmentUnreal.uproject`.
- Backend bridge: `http://127.0.0.1:5174/api/unreal/state`.

If Unreal prompts to convert or rebuild C++ modules on first open, accept it. The current project is intentionally a small C++ bridge scaffold, not the final game foundation.

## Sample-First Plan

We should not build the final client from scratch. The next Unreal milestone is to evaluate an official sample or permissively licensed open-source game and port the Aliveville bridge into that base.

Preferred order:

1. **Epic Cropout-style top-down sample**: likely best fit for readable agents, schedules, village locations, and simulation visibility.
2. **Epic Lyra Starter Game**: useful for modern Unreal architecture, input, and gameplay systems if the project moves toward character action.
3. **Permissive Unreal open-source samples**: use only when the license is MIT/BSD/Apache or similarly compatible and attribution is documented.

Avoid GPL and unlicensed repos for the commercial client unless we explicitly decide to take on the license obligations.

The goal is to steal proven game feel, camera, interaction, UI, and asset-pipeline patterns legally. Aliveville's differentiator is the world brain: ingest, agents, director pressure, quests, and persistent state.

## Required Local Tools

- Unreal Engine 5.7.
- Full Xcode, not only Command Line Tools.
- Node/pnpm for the simulation server.

After installing Xcode:

```sh
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
```

## Local Loop

1. Start the existing simulation server:
   ```sh
   pnpm dev:server
   ```
2. Open `unreal/AshmentUnreal/AshmentUnreal.uproject` in Unreal Engine.
3. Create a blank level at `/Game/Ashment/Maps/L_AshmentRuntime`.
4. Place `AshmentWorldClient` in the level, or use the default game mode to spawn it.
5. Press Play. The client fetches `http://127.0.0.1:5174/api/unreal/state` and spawns the current world.

## Bridge Contract

- `GET /api/unreal/state`: spawnable world scene, actors, items, props, objectives, recent agent activity.
- `POST /api/unreal/action`: accepts the same player action envelope as `/api/tick`, advances simulation, returns updated Unreal scene state.

The bridge intentionally sends Unreal-friendly centimeters, colors, active objective metadata, and location roles so Blueprints/C++ can build a proper environment instead of parsing the raw simulation schema.

## Current C++ Scaffold

- `AshmentWorldClient`: fetches the bridge state and spawns runtime scene primitives for locations, actors, items, props, and objectives.
- `AshmentPlayerPawn`: simple free-fly camera pawn for early inspection.
- `AshmentUnrealGameMode`: spawns the world client if the level does not already contain one.

This is not the final art/gameplay layer. Once the sample base is chosen, the generated primitives should become a debug visualization while the real scene uses sample/marketplace-quality assets wired to the same bridge.

## Product Direction

Treat the TypeScript server as the living world brain and Unreal as the game client:

- Unreal: camera, input, animation, environment art, materials, VFX, UI, combat feel.
- TypeScript server: ingest, simulation, agent loop, director pressure, quests, saves.
- Bridge: scene state and player actions.

This keeps the AI/world systems testable while letting the player-facing client reach actual commercial 3D quality.
