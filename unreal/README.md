# Ashment Unreal Client

This is the real 3D client track. The existing web app remains useful as a debug/admin surface for world ingest, agent state, saves, and playtests. Unreal owns player-facing camera, movement, rendering, environment composition, and game feel.

## Local Loop

1. Start the existing simulation server:
   ```sh
   pnpm dev:server
   ```
2. Open `unreal/AshmentUnreal/AshmentUnreal.uproject` in Unreal Engine 5.4+.
3. Create a blank level at `/Game/Ashment/Maps/L_AshmentRuntime`.
4. Place `AshmentWorldClient` in the level, or use the default game mode to spawn it.
5. Press Play. The client fetches `http://127.0.0.1:5174/api/unreal/state` and spawns the current world.

## Bridge Contract

- `GET /api/unreal/state`: spawnable world scene, actors, items, props, objectives, recent agent activity.
- `POST /api/unreal/action`: accepts the same player action envelope as `/api/tick`, advances simulation, returns updated Unreal scene state.

The bridge intentionally sends Unreal-friendly centimeters, colors, active objective metadata, and location roles so Blueprints/C++ can build a proper environment instead of parsing the raw simulation schema.
