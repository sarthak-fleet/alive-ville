# Aliveville / AI World Simulator

Website: https://aliveville.com

Aliveville is an AI world simulator moving toward an Unreal-first 3D game client. The TypeScript app in this repo owns the simulation server, world ingest, autonomous agent loop, quests, saves, and browser debug surface. The Unreal project under `unreal/AshmentUnreal` is the player-facing 3D client track.

## Current Shape

- `src/`: simulation, agent loop, director, ingest, story package, and Unreal bridge.
- `web/`: browser debug/admin client and legacy playable prototype.
- `astro-landing/`: public marketing site.
- `unreal/AshmentUnreal/`: Unreal C++ client scaffold.

## Run The Simulation

```sh
pnpm install
pnpm dev:server
```

The server listens on `http://localhost:5174`.

Useful endpoints:

- `GET /api/state`: raw simulation state.
- `GET /api/unreal/state`: Unreal-friendly scene state in centimeters.
- `POST /api/unreal/action`: player action bridge for Unreal.
- `POST /api/import-world-source`: reviewed world-source ingest.

## Run The Browser Debug Client

```sh
pnpm dev
```

Open `http://localhost:5173`.

## Run The Unreal Client

1. Install Unreal Engine 5.7 from Epic Games Launcher.
2. Install full Xcode and select it:
   ```sh
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   sudo xcodebuild -license accept
   ```
3. Start the simulation server:
   ```sh
   pnpm dev:server
   ```
4. Open:
   ```sh
   open unreal/AshmentUnreal/AshmentUnreal.uproject
   ```

See [unreal/README.md](unreal/README.md) for the Unreal-specific setup notes.

## Verification

```sh
pnpm verify:readiness
```

This runs typecheck, lint, unit tests, build, bundle budget, readiness benches, and browser playtests. The commercial readiness gate now requires the Unreal bridge/client path.
