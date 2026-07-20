/**
 * Curated CC0 GLB pack registry.
 *
 * Source packs (all CC0):
 *   - Kenney Nature Kit          https://kenney.nl/assets/nature-kit          (pulled 2026-06-13)
 *   - Kenney City Kit (Suburban) https://kenney.nl/assets/city-kit-suburban   (pulled 2026-06-13)
 *   - Kenney Furniture Kit       https://kenney.nl/assets/furniture-kit       (pulled 2026-06-14)
 *
 * The intent maps below are used by scene code to swap procedural primitives
 * for real GLBs. Procedural fallbacks remain wired in callsites so a missing
 * key or a GLB load failure degrades gracefully.
 *
 * Paths are absolute under `web3d/public/` so they resolve at runtime via
 * `import.meta.env.BASE_URL`.
 */

const BASE = (import.meta.env?.BASE_URL ?? '/') as string;

function url(path: string): string {
  return `${BASE}${path}`.replace(/\/+/g, '/');
}

/** Plants and natural props — replaces procedural boxes/spheres in `Prop`. */
export const NATURE_ASSETS = {
  tree: [
    url('assets/nature/tree-oak.glb'),
    url('assets/nature/tree-default.glb'),
    url('assets/nature/tree-detailed.glb'),
    url('assets/nature/tree-pine.glb'),
    url('assets/nature/tree-palm.glb'),
  ],
  bush: [
    url('assets/nature/bush-small.glb'),
    url('assets/nature/bush-detailed.glb'),
    url('assets/nature/bush-large.glb'),
  ],
  grass: [url('assets/nature/grass-small.glb'), url('assets/nature/grass-large.glb')],
  flower: [
    url('assets/nature/flower-red.glb'),
    url('assets/nature/flower-yellow.glb'),
    url('assets/nature/flower-purple.glb'),
  ],
  rock: [url('assets/nature/rock-large.glb'), url('assets/nature/rock-small.glb')],
  mushroom: [url('assets/nature/mushroom-red.glb')],
} as const;

/** Modular building shells — replaces the procedural facade boxes. */
export const BUILDING_ASSETS = {
  /** Generic suburban shells; 10 variants for visual variety. */
  shell: [
    url('assets/buildings/building-a.glb'),
    url('assets/buildings/building-b.glb'),
    url('assets/buildings/building-c.glb'),
    url('assets/buildings/building-d.glb'),
    url('assets/buildings/building-e.glb'),
    url('assets/buildings/building-f.glb'),
    url('assets/buildings/building-g.glb'),
    url('assets/buildings/building-h.glb'),
    url('assets/buildings/building-j.glb'),
    url('assets/buildings/building-k.glb'),
  ],
  fence: [url('assets/buildings/fence.glb'), url('assets/buildings/fence-low.glb')],
  planter: [url('assets/buildings/planter.glb')],
} as const;

/**
 * Interior furniture props — replaces the procedural boxes in `Interior.tsx`'s
 * `Furniture` component. Keys mirror the `FurnitureKind` union in
 * `worldgen/interiors.ts`. Kinds the Furniture Kit can't sensibly cover
 * (`hearth`, `anvil`) are intentionally absent — the renderer falls back to the
 * existing procedural body for those so forge identity (glowing coals, anvil
 * silhouette) stays intact.
 */
export const FURNITURE_ASSETS = {
  bed: [
    url('assets/furniture/bed-single.glb'),
    url('assets/furniture/bed-double.glb'),
    url('assets/furniture/bed-bunk.glb'),
  ],
  table: [
    url('assets/furniture/table.glb'),
    url('assets/furniture/table-round.glb'),
    url('assets/furniture/table-cross.glb'),
    url('assets/furniture/side-table.glb'),
    url('assets/furniture/side-table-drawers.glb'),
    url('assets/furniture/table-coffee.glb'),
  ],
  chair: [
    url('assets/furniture/chair.glb'),
    url('assets/furniture/chair-cushion.glb'),
    url('assets/furniture/chair-rounded.glb'),
    url('assets/furniture/stool-bar.glb'),
    url('assets/furniture/lounge-chair.glb'),
  ],
  counter: [
    url('assets/furniture/kitchen-bar.glb'),
    url('assets/furniture/kitchen-bar-end.glb'),
    url('assets/furniture/lounge-sofa.glb'),
  ],
  shelf: [
    url('assets/furniture/bookcase-closed.glb'),
    url('assets/furniture/bookcase-open.glb'),
    url('assets/furniture/bookcase-open-low.glb'),
    url('assets/furniture/cabinet.glb'),
    url('assets/furniture/cabinet-drawer.glb'),
  ],
  rug: [
    url('assets/furniture/rug-rectangle.glb'),
    url('assets/furniture/rug-round.glb'),
    url('assets/furniture/rug-square.glb'),
  ],
  plant: [url('assets/furniture/plant-potted.glb'), url('assets/furniture/plant-small.glb')],
  crate: [
    url('assets/furniture/crate-closed.glb'),
    url('assets/furniture/crate-open.glb'),
    url('assets/furniture/books.glb'),
  ],
  /** Lamps and other ambient decoratives — not driven by a FurnitureKind yet,
   *  but available for future placement passes. */
  lamp: [
    url('assets/furniture/lamp-floor-round.glb'),
    url('assets/furniture/lamp-floor-square.glb'),
    url('assets/furniture/lamp-table-round.glb'),
  ],
} as const;

/**
 * Deterministically pick one entry from an asset list using a stable hash.
 * Mirrors the pattern in scene code that uses `stableHash(prop.id)`.
 */
export function pickAsset(list: readonly string[], hash: number): string {
  if (list.length === 0) throw new Error('pickAsset: empty list');
  const index = Math.abs(hash) % list.length;
  return list[index]!;
}
