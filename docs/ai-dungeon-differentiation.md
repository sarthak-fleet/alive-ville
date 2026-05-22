# AI Dungeon Differentiation

This project should not position itself as an AI Dungeon clone or an infinite text-adventure generator. AI Dungeon's public positioning is strongest around AI-native text adventures, prebuilt or custom scenarios, Story Cards and Memory Banks for context, AI image generation, multiplayer sessions, and a large community scenario library.

Last rechecked: 2026-05-22.

Sources reviewed:

- https://aidungeon.com/
- https://apps.apple.com/us/app/ai-dungeon-rpg-story-maker/id1491268416
- https://help.aidungeon.com/about-worlds-world-info-scenarios-and-story-cards
- https://help.aidungeon.com/faq/what-are-adventures

## AI Dungeon Boundary

AI Dungeon's current public surface leads with infinite AI-driven RPG stories, prebuilt or custom scenarios, Story Cards, Memory Banks, an Image Generator, multiplayer, and community scenario discovery. Its guide describes Adventures as standalone story play-throughs whose core unit is story text Actions, with Do, Say, and Story Mode inputs.

That is a strong product, but it is a different lane. This repo should not chase "the same text adventure, but with another model." Differentiation must stay anchored in spatial play, compiled world structure, visible autonomous simulation, and tested completion loops.

## Product Position

AI World Simulator is a playable 3D world simulator with an ingestible world compiler and long-running autonomous agents. The core promise is not "type anything and receive prose." The core promise is "turn a reviewed world source into a spatial, stateful, playable 3D RPG slice with agents that keep acting when the player is not directly prompting them."

## Differentiation Pillars

1. 3D-first playable runtime.
   - Default play starts in the Three.js 3D view.
   - Locations, NPCs, items, props, objective beacons, atmosphere, lighting mood, camera controls, nameplates, and source-derived landmarks are rendered as scene objects.
   - Browser playtests verify nonblank canvas pixels, visual hash changes after travel, camera movement, desktop/mobile layout, and WebGL context recovery.

2. Structured world compiler, not prompt-only scenario setup.
   - Reviewed world sources compile into typed locations, exits, NPCs, items, quests, factions, tensions, villain plans, story objectives, portraits, item visuals, location palettes, and 3D landmarks.
   - Anime is only one fixture. Skyfront, Clockwork Conservatory, Abyssal Salvage, and Neon Nocturne prove non-anime worlds can compile and play through the same path.
   - Imported worlds are not just renamed story cards: their source text drives different palettes, atmosphere, landmarks, items, objectives, and evidence loops.
   - Invalid source import is rejected before it can replace the playable world.

3. Long-running autonomous agents with operational controls.
   - Agents can step manually or run on an interval.
   - The loop records checkpoints, supports restore latest, persists checkpoint files, avoids overlapping ticks, and resets correctly on world replacement.
   - Browser gates prove live autonomous ticks visibly update both the base 3D world and a generic imported 3D world.

4. Playable objectives over open-ended prose drift.
   - Objectives drive travel, talk, pickup, give, inspect, confrontation, and story resolution.
   - The player can complete multi-step quests in 3D using buttons, keyboard activation, and scene target hover or interaction.
   - Dialogue is world-specific and checked to avoid leaking the previous imported world's framing.

5. Persistence and recoverability as product behavior.
   - The app supports downloaded saves, browser quick save/load, malformed save rejection, recoverable app errors, and agent checkpoint restore.
   - Imported world progress is quick-saved, another world is imported, and the imported world is restored back into a nonblank 3D scene.

## Claims To Avoid

- Do not claim "infinite text adventure" as the lead.
- Do not claim AI Dungeon style community scenario scale.
- Do not imply the app competes mainly through larger context windows or better prose generation.
- Do not describe generated images as the main visual strategy.

## Claims To Lead With

- "3D playable world compiler for reviewed fandom and original worlds."
- "Stateful NPC agents that keep acting and can be checkpoint-restored."
- "World source ingest turns lore into locations, quests, items, factions, visuals, and story pressure."
- "Browser-tested desktop and mobile playability, including imported worlds."
- "Playable objectives and spatial interaction before open-ended prose."

## Competitive Readiness Gate

To claim readiness against this boundary, the repo must keep all of these evidenced:

- A default 3D play surface with nonblank canvas playtests and camera/interaction checks.
- Generic world ingest for at least four non-anime worlds, including a noir mystery world with distinct visual treatment.
- Long-running autonomous agent loops with checkpoint persistence and restore.
- Objective-driven play loops that complete through travel, pickup, give, inspect, and confrontation instead of pure prose continuation.
- Production-build browser smoke tests for base and imported worlds.

## Current Evidence In Repo

- 3D runtime: `web/src/three/world-scene.ts`, `web/src/organisms/ThreeWorld.tsx`.
- World compiler: `src/world-ingest.ts`, `src/anime-ingest.ts`.
- Non-anime world fixtures: `fixtures/worlds/skyfront-source.json`, `fixtures/worlds/conservatory-source.json`, `fixtures/worlds/abyssal-source.json`, `fixtures/worlds/noir-source.json`.
- Long-running agents: `src/agent-loop.ts`, `src/agent-checkpoint-store.ts`, `web/src/organisms/AgentLoopPanel.tsx`.
- Browser playability gates: `tests/playtests/alive-village.ts`, `tests/playtests/world-ingest.ts`.
- Readiness gates: `src/completion-benchmarks.ts`, `src/expanded-completion-benchmarks.ts`.
