# VRM baseline — visual snapshot of the live game

**One-liner:** Headless Playwright capture of `localhost:5175/game/` after a recent VRM character swap, with three screenshots, full console log, and a verdict per visual question. Verdict: **VRMs load (loader logs confirm) and characters render at default camera distance, but anime/MToon cel-shading is not visually distinct in screenshots, several Kenney GLB textures fail to load, and one WebGL context-loss was observed during the run.**

Recipe (for re-running):

```
# servers already up: pnpm dev (5175), pnpm dev:server (5174)
pnpm tsx scripts/snapshot-game.ts
# outputs: tmp/experiments/vrm-baseline-{1,2,3}.png + vrm-baseline-console.log
```

## Game state at snapshot

- World: **The Ember Beneath Ashmont** (Ashmont Village) — selected by clicking the first world card on the start menu. No `tmp/sessions/autosave-world.json` was claimed by the backend's start flow (`Continue` card was absent on this run; the autosave-world.json on disk corresponds to a stale prior session).
- Clock: day 15, hour 19 (evening).
- 6 locations, 5 NPCs registered (`mira`, `tomas`, `lena`, plus two more).
- Player spawn: `(82.5, 0.05, 51.4)` — registered LiveActor positions show NPCs scattered across `~30..132` on X.
- Character chosen: default Wanderer.

## Three screenshots

### 1. Initial spawn — `tmp/experiments/vrm-baseline-1.png`

Wide third-person view from behind the player on a tiled plaza ("Returning Square"). Player avatar visible in centre: distinct head + hair, fair skin, red sleeveless top, dark trousers. White/grey low-poly buildings frame the plaza; banner-like cyan signs in the distance. Quest tracker visible upper-left, mini-map lower-right. No NPCs in frame at this angle.

### 2. Close-up attempt — `tmp/experiments/vrm-baseline-2.png`

Intended to zoom in by mutating `__game.cameraState.distance` to 3.6. The runtime overwrites cameraState each frame (`PlayerController.tsx:364`), so the mutation does NOT stick — shot 2 looks visually identical to shot 1. **Bug for the snapshot harness, not the game.** One NPC (blue outfit) now visible left of frame in roughly the same pose/proportions as the player.

### 3. Walked forward 3s — `tmp/experiments/vrm-baseline-3.png`

Player has crossed the plaza to a road/crosswalk near a covered bridge (`The Path Through the Ember-Beneath-Ashmont`). NPC in cyan/teal visible to the left (possibly Lena per quest log). The world reveals more depth — a bridge, distant rooftops, sky. Still no visible "anime cel-shaded" cue; the scene reads as flat-lit stylized PBR.

## Console log (`tmp/experiments/vrm-baseline-console.log`)

VRM activity (positive signal):
- `VRMUtils.removeUnnecessaryJoints: ... deprecated` — fires 8+ times. VRM loader IS running, models ARE being processed. Deprecation warning is benign (we should switch to `combineSkeletons` eventually).

Errors:

```
THREE.GLTFLoader: Couldn't load texture Textures/colormap.png   (×9+)
THREE.WebGLRenderer: Context Lost.                              (×1)
```

Warnings (not actionable in this experiment):
- `THREE.Clock deprecated — use THREE.Timer` (twice; harmless)
- `THREE.WebGLShadowMap: PCFSoftShadowMap deprecated. Using PCFShadowMap` (repeated; downgrade is cosmetic)
- `using deprecated parameters for the initialization function; pass a single object instead` (likely a Drei or Three helper)
- `GL_CLOSE_PATH_NV ... GPU stall due to ReadPixels` (will-not-repeat warning, headless GPU quirk)

No autoplay-block message present → either music never tried to start, or autoplay actually worked. Inconclusive from this run.

## Verdict per question

| Question | Verdict |
|---|---|
| VRM characters rendering at all? | **Yes — loaders fire, character bodies visible in scene.** Cannot distinguish a VRM body from the previous low-poly avatar at default camera distance, but at minimum a humanoid mesh is present and moves with player input. |
| Oriented correctly? | **Yes** — feet on ground, head up, facing camera-forward by default; walking animation/transform plays when W held (Shot 3 shows the player at a new position with the same upright orientation). |
| MToon cel shading visible? | **Not visually obvious.** No characteristic anime hard-edge shading bands at the camera distance the runtime enforces. Could be: (a) MToon working but invisible at this LOD, (b) MToon downgraded to standard material on import, (c) lighting too flat for cel bands to read. Needs verification with a working close-up shot. |
| Right height (uniform-height fix)? | **Plausibly yes** — player and the visible NPC (shot 2) appear to be the same height in frame. Cannot positively confirm without a side-by-side. No floating-feet or partly-underground artefacts visible. |
| Kenney trees / buildings visible? | **Buildings yes** (the white plaza and the bridge). **Trees:** none clearly identifiable in any shot — the cyan/green shapes left of the road in shot 3 may be the Kenney foliage but read more like crystals/jewels than trees. |
| Bushes / grass / flowers / rocks / mushroom (new scatter)? | **Not visible** in any of the three shots. The plaza tiles are clean. Either the scatter is in non-square areas the screenshots didn't reach, or it isn't being placed in this district. |
| Music playing? | **Inconclusive.** No autoplay-block error in console; no positive "audio started" log either. Headless Chromium routinely blocks audio. |

## Bugs found

1. **Repeated GLB texture failure** — `THREE.GLTFLoader: Couldn't load texture Textures/colormap.png` fires 9+ times. Suggests a Kenney GLB is referencing `Textures/colormap.png` with a relative path that doesn't resolve from the loader's base URL. Likely lives in `web3d/src/worldgen/` or `web3d/src/scene/` GLB loader call sites — search for the loader's `setResourcePath` / `setPath` usage and confirm Kenney prop GLBs are served from a directory that exposes `Textures/`.

2. **WebGL context loss during world load** — `THREE.WebGLRenderer: Context Lost.` printed once at `15:09:39`, mid-world-load. The renderer recovered (subsequent screenshots succeeded), but on a real user this can manifest as a blank canvas. May be triggered by simultaneously decoding 5×10MB VRMs + several Kenney GLBs.

3. **Deprecated `removeUnnecessaryJoints`** — VRM 1.x will remove it. Trivial swap to `combineSkeletons` in whatever helper does VRM post-processing (`web3d/src/characters/vrm.ts` is the likely site).

4. **Snapshot harness limitation** — direct mutation of `__game.cameraState.distance` is overwritten by `PlayerController.tsx:364` every frame. To get a real close-up, the script needs to dispatch a `wheel` event on the canvas instead.

## Next steps

1. **Fix the colormap.png texture-resolution bug first** — it spams the console and may explain missing trees/scatter (props that lose their texture could be invisible / black).
2. **Re-run snapshot with a wheel-driven zoom** so we can visually confirm MToon cel-shading on the player at ≤2m distance.
3. **Probe NPC scatter density** by panning the camera around the village square via the in-game `requestTeleport` global, then shooting from a known good vantage point.
4. **Confirm uniform-height fix** by spawning two NPCs at equal Y and capturing a side-on shot.
5. **Audio check** must be done in a headed browser; headless autoplay block makes this run inconclusive.

## Artefacts

- Script: `scripts/snapshot-game.ts`
- Screenshots: `tmp/experiments/vrm-baseline-1.png`, `-2.png`, `-3.png`
- Console log: `tmp/experiments/vrm-baseline-console.log`
