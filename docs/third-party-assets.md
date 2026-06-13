# Third-party Assets and Code References

## Agent Town

- Source: https://github.com/geezerrrr/agent-town
- License: MIT
- Use in this repo: the new `AgentTownPrototype` uses Agent Town's office map and character sprites as a donor asset pack. The implementation is adapted for this repo's Vite/React/Phaser runtime and does not require Agent Town's Next.js or OpenClaw stack.

## OpenRTP Tiles

- Source: https://finalbossblues.itch.io/openrtp-tiles
- License: Creative Commons Zero v1.0 Universal
- Use in this repo: outdoor overworld tiles for the city-scale map. The office map remains available as an interior room target for the Hero HQ building.

## AI Town

- Source: https://github.com/a16z-infra/ai-town
- License: MIT
- Use in this repo: retained as architecture/product reference for agent conversations, persistent world state, and simulation loops. Not directly copied into the current prototype.

## Quaternius Universal Animation Library

- Source: https://quaternius.com/packs/universalanimationlibrary.html
- License: CC0 1.0 Universal (public domain)
- Use in this repo: `web3d/public/assets/characters/ual.glb` — the rigged mannequin + 45 animation clips drive every character in the 3D client (locomotion blending, combat moves, death). Bodies are palette-tinted per character; procedural hair/eyes/capes attach to the Head/spine bones at runtime.

## VRM Characters (Anime Avatars)

- Loader: [`@pixiv/three-vrm`](https://github.com/pixiv/three-vrm) `v3.5.3` (MIT). Adds VRM 0.x + 1.0 support to `three.js`'s `GLTFLoader` via a plugin (`VRMLoaderPlugin`).
- Status: **pulled 2026-06-13** into `web3d/public/assets/characters/vrm/` (5 `.vrm` files, ~63 MB total).
- Renderer: `web3d/src/characters/VrmCharacter.tsx` mounts each VRM as a singleton instance per key, drives the humanoid bones procedurally (hip bob + arm/leg swing keyed off `setSpeed`), tweens combat poses (`attack1/2/3`, `dodge`, `hit`, `telegraph`), and calls `vrm.update(delta)` every frame so spring-bone hair / skirt physics and `aa` expression lipsync stay live.
- Material handling: VRMs ship **MToon** materials by default (the correct anime-toon shading). We do **not** swap them to `MeshToonMaterial` (unlike Kenney/Quaternius GLBs). Damage flash / telegraph pulse writes to the MToon `emissive` channel and restores the per-material original.
- Picker: `web3d/src/characters/vrm.ts::pickVrm` maps persona text + role + visual tags to a VRM key, or returns `null` to fall through to the procedural UAL mannequin (`RiggedCharacter.tsx`). Hash-rotates across the three "villager" VRMs so the population reads as varied while staying deterministic per persona.
- Coverage: only NPCs (`Npc.tsx`) route through the picker. The player (`PlayerController.tsx`), interior NPCs, and HUD portraits still render on UAL. The previous Quaternius "Ultimate Modular Characters" archetype path (below) is superseded but `ArchetypeCharacter.tsx` and `archetypes.ts` remain on disk for rollback.

| Slot | File | Author | Source URL | License + redistribute? | Attribution required? |
|---|---|---|---|---|---|
| `villagerA` | `villager-a.vrm` | VRoid Project (pixiv) | https://github.com/tegnike/aituber-kit/raw/main/public/vrm/AvatarSample_A.vrm | VRM Public License 1.0; redistribution=allow, modification=allow, corporate_commercial_use=allow | credit=unnecessary |
| `villagerB` | `villager-b.vrm` | VRoid Project (pixiv) | https://github.com/tegnike/aituber-kit/raw/main/public/vrm/AvatarSample_B.vrm | VRM Public License 1.0; redistribution=allow, modification=allow, corporate_commercial_use=allow | credit=unnecessary |
| `villagerC` | `villager-c.vrm` | VRoid Project (pixiv) | https://github.com/tegnike/aituber-kit/raw/main/public/vrm/AvatarSample_C.vrm | VRM Public License 1.0; redistribution=allow, modification=allow, corporate_commercial_use=allow | credit=unnecessary |
| `hero` | `hero.vrm` (Seed-san) | VirtualCast, Inc. | https://github.com/vrm-c/vrm-specification/raw/master/samples/Seed-san/vrm/Seed-san.vrm | VRM Public License 1.0; `allowRedistribution=true`, `commercialUsage=corporation`, `modification=allowModificationRedistribution` | **Required** — credit "Seed-san model by VirtualCast, Inc." |
| `acolyte` | `acolyte.vrm` (VRM1_Constraint_Twist_Sample) | pixiv Inc. | https://github.com/pixiv/three-vrm/raw/dev/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm | VRM Public License 1.0; `allowRedistribution=true`, `commercialUsage=corporation`, `modification=allowModificationRedistribution` | `creditNotation=unnecessary` — but preserve "(c) 2022 pixiv Inc." copyright string in file |

Required attribution string (include in credits / about screen):

> "Seed-san" 3D character model © VirtualCast, Inc. — used under the [VRM Public License 1.0](https://vrm.dev/licenses/1.0/).
>
> Includes 3D models © pixiv Inc. and VRoid Project, used under the [VRM Public License 1.0](https://vrm.dev/licenses/1.0/).

Anchor for license terms: each `.vrm` file embeds its own machine-readable License Settings (`VRMC_vrm.meta` for VRM 1.0; `VRM.meta` for VRM 0.x). The license obligations in the table above were extracted directly from those embedded blocks at pull time, not from third-party README claims.

Skipped sources (license unclear or prohibits redistribution): AliciaSolid (Dwango custom license with attribution + ambiguous redistribution clause), Nikechan v1/v2 (`licenseName=Redistribution_Prohibited`). The pixiv/three-vrm GitHub repo's `examples/models` directory only contains the one VRM1_Constraint_Twist_Sample at this time; "vrm-c" and "awesome-vrm" listings either had login walls or per-file license declarations we couldn't verify cleanly.

## Quaternius Ultimate Modular Characters (superseded)

> Superseded by the VRM characters above. Files remain on disk and code paths
> (`ArchetypeCharacter.tsx`, `archetypes.ts`) are intact for rollback; the
> picker is no longer wired into `Npc.tsx`.

- Source: https://poly.pizza/bundle/Ultimate-Modular-Men-Pack-ZiH8muWqwQ and https://poly.pizza/bundle/Ultimate-Modular-Women-Pack-aCBDXDdTNN (mirrored from https://quaternius.com/)
- License: CC0 1.0 Universal (public domain)
- Status: **pulled 2026-06-13** into `web3d/public/assets/characters/archetypes/` (12 GLBs).
- Subset selected: `adventurer`, `king`, `farmer`, `worker`, `punk`, `swat`, `astronaut`, `businessman` (men pack) and `witch`, `woman`, `soldier`, `scifi` (women pack).
- Rig note: these GLBs do **not** share the UAL skeleton. They carry their own armature (`Hips/Torso/Chest/Head` with `.L`/`.R` limb naming) plus 24 baked clips per file (`CharacterArmature|Idle`, `Walk`, `Run`, `Punch_Left`, `Sword_Slash`, `Roll`, `HitRecieve`, `Death`, `Interact`, ...). Cross-pack and cross-character consistency is exact, so a single loader handles all 12.
- Renderer: `web3d/src/characters/ArchetypeCharacter.tsx` clones via `SkeletonUtils` per instance, swaps every Standard/Basic material for `MeshToonMaterial` (gradient ramp + preserved per-mesh source colour), and plays the rig's own clips. The picker in `web3d/src/characters/archetypes.ts` maps persona text + role + visual tags to one of the archetype keys (or `null` to keep the UAL mannequin path).
- Coverage: only NPCs (`web3d/src/characters/Npc.tsx`) route through the picker. The player (`PlayerController.tsx`), interior NPCs, and HUD portraits still render on UAL so the procedural identity layer (hair, face, decor) is unchanged where it was wired.

## Kenney Nature Kit

- Source: https://kenney.nl/assets/nature-kit
- License: CC0 1.0 Universal (public domain) — attribution recorded, none required.
- Status: **pulled 2026-06-13** into `web3d/public/assets/nature/` (16 GLBs).
- Subset selected: trees (`tree-oak`, `tree-default`, `tree-pine`, `tree-detailed`, `tree-palm`), bushes (`bush-small`, `bush-detailed`, `bush-large`), grass (`grass-small`, `grass-large`), flowers (`flower-red`, `flower-yellow`, `flower-purple`), rocks (`rock-large`, `rock-small`), and `mushroom-red`. Trees are wired into `scene/District.tsx::Tree` via `scene/asset-registry.ts`; the rest are registered for future prop kinds.
- Material handling: GLBs are loaded via `scene/kenneyGlb.tsx::useToonGlb`, deep-cloned, and have their materials swapped to `MeshToonMaterial` keyed off the existing `toonGradientMap()` so the toon look survives the asset swap. Procedural meshes remain as Suspense fallbacks.

## Kenney City Kit (Suburban)

- Source: https://kenney.nl/assets/city-kit-suburban
- License: CC0 1.0 Universal (public domain) — attribution recorded, none required.
- Status: **pulled 2026-06-13** into `web3d/public/assets/buildings/` (13 GLBs).
- Subset selected: 10 modular shells (`building-a` through `building-k`, skipping `i`), 2 fences (`fence`, `fence-low`), and `planter`. Shells are wired into `scene/District.tsx::Building` and uniformly scaled to fit the worldgen `BuildingModel` footprint so colliders + courtyard layout stay unchanged.
- Material handling: same toon material swap as the nature kit. The procedural facade is the Suspense fallback so a missing or failing GLB degrades to the previous look.

## Kenney Furniture Kit

- Source: https://kenney.nl/assets/furniture-kit
- License: CC0 1.0 Universal (public domain) — attribution recorded, none required.
- Status: **pulled 2026-06-14** into `web3d/public/assets/furniture/` (33 GLBs from the 140-piece kit).
- Subset selected:
  - **Beds** — `bed-single`, `bed-double`, `bed-bunk`
  - **Tables** — `table`, `table-round`, `table-cross`, `side-table`, `side-table-drawers`, `table-coffee`
  - **Chairs** — `chair`, `chair-cushion`, `chair-rounded`, `stool-bar`, `lounge-chair`
  - **Shelves / cabinets** — `bookcase-closed`, `bookcase-open`, `bookcase-open-low`, `cabinet`, `cabinet-drawer`
  - **Counters / sofa** — `kitchen-bar`, `kitchen-bar-end`, `lounge-sofa`
  - **Lamps** — `lamp-floor-round`, `lamp-floor-square`, `lamp-table-round`
  - **Rugs** — `rug-rectangle`, `rug-round`, `rug-square`
  - **Plants** — `plant-potted`, `plant-small`
  - **Storage / decoratives** — `crate-closed`, `crate-open`, `books`
- Wired into `scene/Interior.tsx::Furniture` via `scene/asset-registry.ts::FURNITURE_ASSETS`. Worldgen `FurnitureKind` keys map onto the asset lists; the procedural primitive body is the `<Suspense>` fallback so a missing or streaming GLB still draws something sensible.
- `hearth`, `anvil`, and `barrel` deliberately stay on the procedural path — the kit has no good match for hot coals / forge anvil / wooden barrel, and substituting (e.g.) a kitchen stove would wreck the forge identity.
- Material handling: same toon material swap as the nature + city kits. The Furniture Kit ships with **inline material colors** only (PBR `baseColorFactor` per `wood`/`fabric`/`metal` material — no texture atlas), so no `colormap.png` is shipped with the pack. The `MeshToonMaterial` rebuild in `kenneyGlb.tsx::useToonGlb` preserves each material's source color so the props read as wood/fabric/metal etc. against the existing toon gradient ramp.

---

## Future Asset Pipeline (2026+)

See `docs/future-prd.md` §5 for the full hybrid strategy. This section will be expanded as the pipeline lands.

### Curated CC0 High-Fidelity (priority base layer)
- **Poly Haven** (https://polyhaven.com/models): Hundreds of hyper-real PBR models (props, furniture, nature, industrial, etc.) + textures/HDRIs. **CC0**. Primary source for detailed environmental dressing and reference. No login required; excellent Blender addon.
- **Kenney** (https://kenney.nl/assets): Thousands of game-ready 3D kits (modular buildings/props, dungeons, vehicles, platformers, space, etc.). **CC0**. Ideal for fast modular variety and low-poly game assets. All-in-1 bundles available.
- **BlenderKit** (https://blenderkit.com): Large community library of models, materials, HDRIs (substantial free tier). Good for rapid authoring before catalog export.
- Supporting: Sketchfab (free/CC filters), MyMiniFactory Scan the World (heritage scans), Printables/Thingiverse (targeted STLs if needed).

### AI Auto-Generation (custom/fandom-specific variety)
- **Meshy.ai**, **Tripo AI**, **Rodin (Hyper3D)** — via direct access or aggregator **3D AI Studio** (multi-model + pipeline tools at strong value). Text + image-to-3D, PBR/texture support, remesh, rigging/animation hooks, broad exports (GLB/FBX/OBJ/STL/USDZ). Free tiers (credit-limited; public gens often CC BY). Paid for private/full commercial rights + volume.
- **Sloyd.ai**: Hybrid parametric + AI. Strong for consistent stylized game-ready props/characters with real-time controls.
- **Luma AI (lumalabs.ai)**: Capture (mobile 3D scanning) and historical text-to-3D strengths. Useful for reference or real-object fidelity. (Note: text-to-3D "Genie" sunset ~Jan 2026; capture remains relevant.)
- Supporting / pay-per-use: JAI Portal and similar (Rodin/Hunyuan3D access with starter credits).

### Local / Fully Free High-Control
- **Tencent Hunyuan3D** (v2+): High-quality textured output. Runnable locally via ComfyUI workflows (MV Adapter etc.). Zero per-gen cost after setup; maximum control for detailed assets. Requires GPU.

### Policy & Process
- Default to **CC0** sources for bundled worlds. Track every addition here and (eventually) a machine-readable catalog.
- AI generations for production worlds use paid plans with private licenses.
- Generation happens at compile/creator time (cached), never per-player-session.
- Preserve current runtime procedural strengths (canvas facades, palette mapping, deterministic worldgen) + Quaternius rig as the animation/attachment base.
- Target visual language remains stylized/toon (MeshToon + generated textures) with optional higher-fidelity props for hero moments.
- See also `docs/future-prd.md` for pipeline requirements (determinism, perf budgets, LOD, licensing audit, fandom consistency via ingest prompts/references).

Current usage remains minimal binary assets (procedural + the one Quaternius GLB). The hybrid pipeline is the major upcoming vertical.

## Music

Ambient looping tracks in `web3d/public/assets/audio/music/`. All tracks are by **Kevin MacLeod (incompetech.com)** under **Creative Commons Attribution 4.0** (CC BY 4.0). Re-encoded to 96 kbps stereo MP3 for shipping size.

Required attribution string (include in credits / about screen):

> Music by Kevin MacLeod (incompetech.com), licensed under Creative Commons Attribution 4.0.

| Slot file | Source track | License | Source URL |
|---|---|---|---|
| `village-day.mp3` | "Suonatore di Liuto" | CC BY 4.0 | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Suonatore%20di%20Liuto.mp3 |
| `village-night.mp3` | "Heartbreaking" | CC BY 4.0 | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Heartbreaking.mp3 |
| `city.mp3` | "Floating Cities" | CC BY 4.0 | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Floating%20Cities.mp3 |
| `interior.mp3` | "Comfortable Mystery" | CC BY 4.0 | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Comfortable%20Mystery.mp3 |
| `combat.mp3` | "Anamalie" | CC BY 4.0 | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Anamalie.mp3 |
| `menu.mp3` | "Meditation Impromptu 03" | CC BY 4.0 | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Meditation%20Impromptu%2003.mp3 |

Pixabay and FreePD were tried first; FreePD has permanently shut down (2025) and Pixabay CDN URLs require session cookies that fail under `curl`. Incompetech serves direct MP3 URLs, so the entire pack is sourced there with attribution.
