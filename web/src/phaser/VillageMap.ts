import ashbendMap from "./maps/ashbend.ldtk.json" with { type: "json" };

export interface RectArea {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  door: { x: number; y: number };
}

export interface CollisionRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

type TileName = "grass" | "grassAlt" | "path" | "pathEdge" | "water" | "bridge" | "plaza" | "garden" | "forest";

interface LdtkLikeMap {
  identifier: string;
  tileSize: number;
  width: number;
  height: number;
  tiles: Record<TileName, number>;
  proceduralGround: {
    baseTile: TileName;
    variantTile: TileName;
    variantModulo: number;
    variantXMultiplier: number;
    variantYMultiplier: number;
  };
  paint: Array<
    | { kind: "line"; from: [number, number]; to: [number, number]; radius: number; tile: TileName }
    | { kind: "rect"; x: number; y: number; w: number; h: number; tile: TileName }
  >;
  entities: {
    locations: RectArea[];
    items: Array<{ id: string; locationId: string; x: number; y: number }>;
    collisions: CollisionRect[];
  };
}

export const VILLAGE_MAP = ashbendMap as LdtkLikeMap;
export const TILE_SIZE = VILLAGE_MAP.tileSize;
export const MAP_COLS = VILLAGE_MAP.width;
export const MAP_ROWS = VILLAGE_MAP.height;
export const WORLD_W = MAP_COLS * TILE_SIZE;
export const WORLD_H = MAP_ROWS * TILE_SIZE;
export const TILE = VILLAGE_MAP.tiles;

export const AREA_LAYOUT: Record<string, RectArea> = Object.fromEntries(
  VILLAGE_MAP.entities.locations.map((area) => [area.id, area])
);

export const ITEM_PLACEMENTS: Record<string, { locationId: string; x: number; y: number }> = Object.fromEntries(
  VILLAGE_MAP.entities.items.map(({ id, locationId, x, y }) => [id, { locationId, x, y }])
);

export const COLLISION_RECTS: CollisionRect[] = VILLAGE_MAP.entities.collisions;

export function buildGroundLayer(): number[][] {
  const { proceduralGround } = VILLAGE_MAP;
  const data = Array.from({ length: MAP_ROWS }, (_, y) =>
    Array.from({ length: MAP_COLS }, (_, x) => {
      const isVariant = (x * proceduralGround.variantXMultiplier + y * proceduralGround.variantYMultiplier) % proceduralGround.variantModulo === 0;
      return tileValue(isVariant ? proceduralGround.variantTile : proceduralGround.baseTile);
    })
  );

  for (const command of VILLAGE_MAP.paint) {
    if (command.kind === "line") {
      paintLine(data, command.from[0], command.from[1], command.to[0], command.to[1], command.radius, tileValue(command.tile));
    } else {
      paintRect(data, command.x, command.y, command.w, command.h, tileValue(command.tile));
    }
  }

  return data;
}

function tileValue(name: TileName): number {
  return TILE[name];
}

function paintRect(data: number[][], startX: number, startY: number, w: number, h: number, tile: number): void {
  for (let y = startY; y < startY + h; y += 1) {
    for (let x = startX; x < startX + w; x += 1) {
      const row = data[y];
      if (row?.[x] !== undefined) row[x] = tile;
    }
  }
}

function paintLine(data: number[][], ax: number, ay: number, bx: number, by: number, radius: number, tile: number): void {
  const dx = bx - ax;
  const dy = by - ay;
  const steps = Math.max(Math.abs(dx), Math.abs(dy)) / TILE_SIZE;
  for (let i = 0; i <= steps; i += 1) {
    const t = steps === 0 ? 0 : i / steps;
    const x = Math.round((ax + dx * t) / TILE_SIZE);
    const y = Math.round((ay + dy * t) / TILE_SIZE);
    paintRect(data, x - radius, y - radius, radius * 2 + 1, radius * 2 + 1, tile);
  }
}
