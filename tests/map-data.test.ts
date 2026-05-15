import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import type { World } from "../src/types.ts";
import {
  AREA_LAYOUT,
  buildGroundLayer,
  COLLISION_RECTS,
  ITEM_PLACEMENTS,
  MAP_COLS,
  MAP_ROWS,
  TILE,
  VILLAGE_MAP,
} from "../web/src/phaser/VillageMap.ts";

const fixture = (): World => JSON.parse(readFileSync(new URL("../worlds/village.json", import.meta.url), "utf8")) as World;

describe("LDtk-style village map data", () => {
  test("imports a complete editor-style map contract", () => {
    expect(VILLAGE_MAP.identifier).toBe("ashbend_village");
    expect(MAP_COLS).toBe(50);
    expect(MAP_ROWS).toBe(33);
    expect(Object.keys(AREA_LAYOUT).sort()).toEqual(["bridge", "forge", "garden", "inn", "square", "wood"]);
    expect(COLLISION_RECTS.length).toBeGreaterThan(8);
  });

  test("ground layer dimensions and important tiles stay stable", () => {
    const layer = buildGroundLayer();
    expect(layer).toHaveLength(MAP_ROWS);
    expect(layer.every((row) => row.length === MAP_COLS)).toBe(true);
    expect(layer[27]?.[1]).toBe(TILE.water);
    expect(layer[26]?.[13]).toBe(TILE.bridge);
    expect(layer[12]?.[20]).toBe(TILE.plaza);
  });

  test("map item placements reference real world items and locations", () => {
    const world = fixture();
    for (const [itemId, placement] of Object.entries(ITEM_PLACEMENTS)) {
      expect(world.items.some((item) => item.id === itemId)).toBe(true);
      expect(world.locations.some((location) => location.id === placement.locationId)).toBe(true);
    }
  });
});
