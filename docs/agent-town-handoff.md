# Agent Town Handoff

Last updated: 2026-05-26

## Current Product Direction

The active game track is a 2D browser RPG prototype. Keep the 3D and Unreal work shelved for now. The near-term goal is a playable, good-looking, anime-inspired town where the player can walk, enter rooms, meet characters, inspect clues, and progress through small quest chains.

Quality bar: this should feel more alive and useful than a character-chat website. A plain map with labels is not enough. Every element should have a purpose:

- Decoration: roads, walls, trees, farms, water, windows, signs, shop counters.
- Entry: doors, thresholds, rooms, gates.
- Pickup: inventory/clue objects.
- Interaction: characters, evidence markers, quest objects.

Avoid random clutter that looks clickable but does nothing.

## How To Run

```sh
pnpm install
pnpm dev
```

Open the printed Vite URL. In this session the local server was running at `http://127.0.0.1:5576/`.

## What Works Now

- Default app route opens the 2D Phaser Agent Town prototype.
- Player can move with WASD/arrow keys and click-to-move.
- Player can walk into door triggers to enter rooms.
- Player can enter and exit:
  - Hero HQ
  - Market Hall
  - Dojo
  - Alley Gate
- Side panel has fallback travel/room buttons.
- Quest chain works:
  - Inspect coupon box.
  - Give coupon to Saitama.
  - Unlock Market Street.
  - Inspect alert board.
  - Unlock Monster Alley.
  - Inspect challenge mark.
  - Talk to Sonic.
- Outdoor and indoor casts are separated so the same named characters are not duplicated inside and outside.
- Room-only NPCs exist:
  - HQ Dispatcher
  - Records Clerk
  - Market Keeper
  - Ramen Vendor
  - Dojo Attendant
  - Alley Watch
- Room-only props exist:
  - Case file
  - Market ledger
  - Dojo bell
  - Gate report

## Important Files

- `web/src/organisms/AgentTownPrototype.tsx`: Phaser scene, map switching, door triggers, room rendering, interaction routing, React side panel.
- `web/src/organisms/agent-town-world.ts`: zones, cast, props, quest state, unlock logic.
- `web/openrtp/zcity-outdoor.json`: authored outdoor Tiled JSON map.
- `web/openrtp/*.png`: OpenRTP CC0 tile assets.
- `web/agent-town/maps/office2.json`: donor office/interior map currently reused for rooms.
- `web/style.css`: side panel and game shell styles.
- `docs/third-party-assets.md`: attribution and license notes.

## Assets And Attribution

Current prototype uses:

- Agent Town assets from `geezerrrr/agent-town`, MIT.
- OpenRTP tiles from Final Boss Blues, CC0.
- AI Town from `a16z-infra/ai-town` only as a product/architecture reference, not directly copied into the current prototype.

Keep attribution current when adding more assets. Do not add GPL or unlicensed assets unless that is an intentional product decision.

## Known Gaps

- Room maps are still reused from the same office donor map. This is functional but visually repetitive.
- Outdoor map is improved but still tile-authored by script, not a professionally designed Tiled map.
- Side UI is still too web-panel-like. It should become a smaller in-game HUD/dialog surface.
- There is no real combat loop yet.
- There are no AI-agent conversations beyond static character lines/memories.
- Door triggers work, but each room should eventually have a proper doorway/threshold tile and unique interior.
- Market/Dojo/Alley rooms need unique layouts, not just different NPCs on the office map.

## Recommended Next Agent Tasks

1. Create distinct room maps.
   - Keep `office2.json` for Hero HQ.
   - Add a market interior, dojo interior, and alley gate interior.
   - Use the existing `OFFICE_TILESETS` assets unless a better permissive asset pack is added.

2. Improve the side UI.
   - Convert the right panel into a compact game HUD.
   - Keep only active quest, current interaction, inventory, and a small travel/room fallback.
   - Avoid dashboard/card-heavy styling.

3. Add richer room interactions.
   - Each room should have at least one NPC and one prop with useful text.
   - Props should either unlock a quest step, add evidence, or reveal character context.

4. Expand the overworld with purpose.
   - More houses are fine, but each visible doorway should eventually be enterable or clearly decorative.
   - Add landmarks only if they support navigation, story, or interaction.

5. Add agent behavior.
   - Start with lightweight local behavior: NPC daily roles, conversation state, and room schedules.
   - Only after that, wire LLM-backed agents.

## Verification Commands Used

```sh
pnpm typecheck
pnpm lint
pnpm build
```

Browser smoke tests were run with Playwright against the local Vite server to verify canvas rendering, room entry/exit, and quest progression. Screenshots from this pass are under `tmp/playtest-artifacts/` and are not tracked.
