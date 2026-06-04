# Project Status

Last updated: 2026-06-04

## Current Scope

Aliveville is a browser-playable AI world simulator. The active product track is the 2D Agent Town RPG: a spatial world with rooms, quests, visible NPCs, persistent state, save/load, and replayable route completion.

## Done

- The default browser route opens the 2D Agent Town prototype.
- The current map includes a larger Z-City overworld, enterable rooms, room-only NPCs and props, and a small quest chain.
- Character and prop interactions work through the side panel and room interaction model.
- Save/load and route-complete replay support the core exploration loop.
- The project direction is documented as spatial, stateful, and simulation-led rather than a generic text adventure.

## Planned Next

1. Replace reused room maps with distinct room layouts, object placement, and room-specific interaction affordances.
2. Add real combat or encounter resolution so quests can depend on more than traversal and dialogue.
3. Introduce actual AI-agent conversations and behaviors behind visible NPCs instead of mostly scripted interactions.
4. Tighten the RPG HUD and side panel so it feels like game UI rather than a web control panel.

## Deferred / Parked

- The older 3D browser prototype is parked while the 2D Agent Town loop is the active product path.
- Unreal/native experiments are shelved unless the browser game proves the simulation loop first.
- Generic AI Dungeon-style text adventure scope is explicitly out of scope.
