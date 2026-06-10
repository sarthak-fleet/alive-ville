# Project Status

Last updated: 2026-06-10

## Current Scope

Aliveville is a browser-playable AI world simulator. The active product track is the new 3D browser client (`web3d/`): a first-principles rebuild where an imported world auto-generates a walkable 3D town and the player talks, explores, and (next) fights inside it. Architecture and milestones: `docs/web3d-architecture.md`.

## Done

- 3D client milestone 1: walkable procedurally generated district (from world schema), third-person controller + follow camera, procedural toon characters with appearance-driven variation, wandering NPCs, talk-to-NPC dialogue through `/api/tick`, quest/objective/toast HUD. Verified end-to-end with a Playwright smoke run (`pnpm dev:server` + `pnpm dev:3d`).
- 3D client milestone 2 "living town": the whole city generates from the schema (every location + plot-avoiding streets from exits, gate arches), NPCs visibly walk between districts along the street graph when the simulation moves them, the agent loop streams live over SSE (`/api/events`) with a HUD toggle, quest tracker panel, and a world-import screen (verified by importing the One Punch Man ingest fixture in-app). Walking into a district posts a `move` action back to the sim.
- 3D client milestone 3 "combat": real-time melee — 3-hit combo with input buffering, dodge roll with i-frames, Q lock-on, enemy AI (chase → telegraph → strike → retreat at low HP), HP bars, hit sparks/damage numbers, death/respawn. Client-resolved fights reconcile to the sim via finisher `fight` actions (verified: scripted bot killed an NPC and `/api/state` showed `defeated: true`).
- 3D client milestone 4 "director events": `fromDirector` actions and villain-plan stage advances trigger letterboxed cutscenes (camera push-in on the actor, player frozen, hostile AI paused, Esc to skip), and rising story pressure visibly shifts the whole city toward an ominous mood (fog, sky, sun). All four planned 3D milestones are now complete.
- 3D beauty + feel pass: canvas-generated facade textures with night-lit windows, paved courtyards/asphalt streets/speckled ground, toon trees, rooftop clutter and awnings, bloom + vignette + ACES + FXAA post chain (`?nofx` to disable), night stars, minimap with live NPC dots, pointer-lock mouse look with drag fallback, movement acceleration with turn lean, FOV kick, camera hit-shake, run dust. Characters rebuilt as procedural anime-chibi v2 (two-segment limbs, knee/elbow flex, anime faces, hair styles from appearance text). Measured ~120 fps headed at 1280×800.

- The default browser route opens the 2D Agent Town prototype.
- The current map includes a larger Z-City overworld, enterable rooms, room-only NPCs and props, and a small quest chain.
- Character and prop interactions work through the side panel and room interaction model.
- Save/load and route-complete replay support the core exploration loop.
- The project direction is documented as spatial, stateful, and simulation-led rather than a generic text adventure.

- LLM dialogue in the 3D client: `POST /api/dialogue` generates in-character NPC replies (persona + memories + secrets + quests) without consuming sim ticks, records both turns as NPC memories, and falls back to scripted tick-talk when no LLM credentials are configured. Enable by setting `LLM_API_KEY`/`LLM_BASE_URL` (see `.env.example`).

## Planned Next

1. Combat polish: rigged CC0 characters (Quaternius pack needs manual download — itch-gated), posture/stagger, character-specific movesets from `src/combat.ts`.
2. Living-world depth: LLM-backed NPC dialogue/proposals in the 3D client (enable LLM mode on the server), interiors for enterable buildings, richer prop kits per district role.
3. Make `web3d` the default production build target once it fully supersedes the 2D client.

## Deferred / Parked

- The 2D Phaser Agent Town (`web/`) remains playable but is no longer the active client track.
- The older diorama 3D prototype (`web/src/three/`) is parked; its schema→visual mapping logic was extracted into `web3d/src/mapping/`.
- Unreal/native experiments are shelved unless the browser game proves the simulation loop first.
- Generic AI Dungeon-style text adventure scope is explicitly out of scope.
