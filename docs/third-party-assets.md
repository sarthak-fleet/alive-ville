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
