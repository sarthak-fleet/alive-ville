# Aliveville / AI World Simulator

Website: https://aliveville.com

Aliveville is an AI world simulator with a 2D browser RPG client as the active player-facing track. The TypeScript app in this repo owns the simulation server, world ingest, autonomous agent loop, quests, saves, and browser game surface. The Unreal project under `unreal/AshmentUnreal` remains a shelved bridge target for a later rebuild.

## Direction

We are finishing the browser 2D RPG first: readable top-down exploration, quest objectives, stateful fights, visible AI agents, save/load, world ingest, and route-complete replay. The 3D browser and Unreal tracks stay available as old experimental surfaces, but they should not block the playable 2D route.

If 3D work resumes later, do not rebuild from scratch. Start from a proven official sample or open-source game foundation, then wire Aliveville's world/agent bridge into it. Preferred base candidates:

- Epic Cropout-style top-down sample: best fit for readable agents, locations, and village simulation.
- Epic Lyra Starter Game: strong Unreal architecture if we need modern input/gameplay systems.
- MIT/BSD/Apache Unreal samples: acceptable when license and attribution are clear.

Avoid GPL or unlicensed code/assets unless we intentionally accept those obligations. The unique product should be the living world brain, ingest pipeline, and long-running agents, not custom engine basics.

## Current Shape

- `src/`: simulation, agent loop, director, ingest, story package, and Unreal bridge.
- `web/`: active 2D Phaser RPG client, HUD, save/load, import, and legacy 3D view.
- `astro-landing/`: public marketing site.
- `unreal/AshmentUnreal/`: shelved Unreal C++ client scaffold and bridge target.

## Current Playable Snapshot

The default browser route now opens the 2D Agent Town prototype: one larger Z-City overworld, enterable rooms, a small quest chain, and character/prop interactions. See [docs/agent-town-handoff.md](docs/agent-town-handoff.md) before continuing this track.

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

## Run The Browser Game

```sh
pnpm dev
```

Open `http://localhost:5173`.

## Run The Shelved Unreal Client

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

This runs typecheck, lint, unit tests, build, bundle budget, readiness benches, and browser playtests. The commercial readiness gate should protect the playable 2D RPG by default while keeping the 3D/Unreal bridge covered as optional evidence.

<!-- ACTIVE-AI-TASK-LOG:START -->
## Active AI Task Log

This section is maintained by the SaaS Maker Active-AI product/design loop so future agents do not reopen duplicate UI tasks.

- Business lane: Core/status context
- Rule: do not create another broad "improve the UI" task unless the acceptance criteria differ materially from the tasks listed here.
- Source of truth for task status: SaaS Maker task board. README entries are durable context only.

| Task | Status | Priority | Last known note |
| --- | --- | --- | --- |
| `a31f2db5` [fleet-audit] ai-game CI failing on main | todo | high | 2026-05-25 17:06:22 |
<!-- ACTIVE-AI-TASK-LOG:END -->
