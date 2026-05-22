# Ashment Unreal Client

This is the real 3D client track for Aliveville / AI World Simulator. The existing web app remains useful as a debug/admin surface for world ingest, agent state, saves, and playtests. Unreal owns player-facing camera, movement, rendering, environment composition, and game feel.

## Engine Target

- Preferred: Unreal Engine 5.7 from Epic Games Launcher.
- Project file: `unreal/AshmentUnreal/AshmentUnreal.uproject`.
- Backend bridge: `http://127.0.0.1:5174/api/unreal/state`.

If Unreal prompts to convert or rebuild C++ modules on first open, accept it. The project is intentionally a small C++ scaffold so we can iterate toward a proper vertical slice instead of polishing the browser prototype.

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

This is not the final art/gameplay layer. The next milestone is a small handcrafted level plus marketplace-quality assets wired to the same bridge, with the generated primitives demoted to debug visualization.

## Product Direction

Treat the TypeScript server as the living world brain and Unreal as the game client:

- Unreal: camera, input, animation, environment art, materials, VFX, UI, combat feel.
- TypeScript server: ingest, simulation, agent loop, director pressure, quests, saves.
- Bridge: scene state and player actions.

This keeps the AI/world systems testable while letting the player-facing client reach actual commercial 3D quality.
