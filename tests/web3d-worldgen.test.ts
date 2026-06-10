import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { World } from "../src/types.ts";
import { generateDistrict } from "../web3d/src/worldgen/district.ts";
import { findDistrictPath, generateWorldModel } from "../web3d/src/worldgen/index.ts";
import { SIDEWALK_INSET, WORLD_SCALE } from "../web3d/src/worldgen/model.ts";

const world = JSON.parse(readFileSync(new URL("../worlds/one-punch-man.json", import.meta.url), "utf8")) as World;

describe("web3d worldgen", () => {
  it("is deterministic: same world produces identical models", () => {
    const a = generateWorldModel(world);
    const b = generateWorldModel(world);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("generates every district with buildings and a courtyard", () => {
    const model = generateWorldModel(world);
    expect(model.districts).toHaveLength(world.locations.length);
    for (const district of model.districts) {
      expect(district.buildings.length).toBeGreaterThanOrEqual(3);
      expect(district.courtyard.radius).toBeGreaterThan(3);
    }
    const active = model.districts.find((d) => d.locationId === world.player.locationId)!;
    expect(active.npcSpawns.length).toBeGreaterThan(0);
  });

  it("builds a street per unique exit pair, avoiding other plots", () => {
    const model = generateWorldModel(world);
    const uniquePairs = new Set(world.exits.map((exit) => [exit.from, exit.to].sort().join("--")));
    expect(model.streets).toHaveLength(uniquePairs.size);
    for (const street of model.streets) {
      expect(street.points.length).toBeGreaterThanOrEqual(2);
      // no interior street point may sit inside a foreign district plot
      for (const point of street.points.slice(1, -1)) {
        for (const location of world.locations) {
          if (location.id === street.fromId || location.id === street.toId) continue;
          const inside =
            point.x > location.x * WORLD_SCALE &&
            point.x < (location.x + location.w) * WORLD_SCALE &&
            point.z > location.y * WORLD_SCALE &&
            point.z < (location.y + location.h) * WORLD_SCALE;
          expect(inside).toBe(false);
        }
      }
    }
  });

  it("connects every exit pair in the nav graph", () => {
    const model = generateWorldModel(world);
    for (const exit of world.exits) {
      const path = findDistrictPath(model.nav, exit.from, exit.to);
      expect(path, `${exit.from} -> ${exit.to}`).not.toBeNull();
      expect(path!.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps buildings inside the district plot", () => {
    const location = world.locations.find((l) => l.id === world.player.locationId)!;
    const district = generateDistrict(world, location);
    const minX = location.x * WORLD_SCALE + SIDEWALK_INSET - 0.5;
    const maxX = (location.x + location.w) * WORLD_SCALE - SIDEWALK_INSET + 0.5;
    for (const building of district.buildings) {
      expect(building.x - building.width / 2).toBeGreaterThanOrEqual(minX - 0.01);
      expect(building.x + building.width / 2).toBeLessThanOrEqual(maxX + 0.01);
      expect(building.height).toBeGreaterThan(2);
    }
  });

  it("keeps buildings clear of the courtyard so the player can roam", () => {
    const location = world.locations.find((l) => l.id === world.player.locationId)!;
    const district = generateDistrict(world, location);
    for (const building of district.buildings) {
      const dx = Math.abs(building.x - district.courtyard.x) - building.width / 2;
      const dz = Math.abs(building.z - district.courtyard.z) - building.depth / 2;
      const clear = Math.max(dx, dz);
      expect(clear).toBeGreaterThanOrEqual(district.courtyard.radius * 0.5);
    }
  });

  it("generates one enterable interior per district, furniture inside walls", () => {
    const model = generateWorldModel(world);
    expect(model.interiors).toHaveLength(world.locations.length);
    expect(model.doors).toHaveLength(world.locations.length);
    for (const interior of model.interiors) {
      expect(interior.furniture.length).toBeGreaterThanOrEqual(4);
      for (const piece of interior.furniture) {
        expect(piece.x).toBeGreaterThan(interior.origin.x + 0.5);
        expect(piece.x).toBeLessThan(interior.origin.x + interior.width - 0.5);
        expect(piece.z).toBeGreaterThan(interior.origin.z + 0.5);
        expect(piece.z).toBeLessThan(interior.origin.z + interior.depth - 0.5);
      }
      // rooms live outside the city footprint
      expect(interior.origin.z).toBeGreaterThan(model.bounds.maxZ + 50);
      // spawn is clear of the spawn-lane furniture slots
      const nearSpawn = interior.furniture.filter(
        (piece) => Math.hypot(piece.x - interior.spawn.x, piece.z - interior.spawn.z) < 1
      );
      expect(nearSpawn).toHaveLength(0);
    }
    // doors sit on their anchor building's face toward the courtyard
    for (const door of model.doors) {
      const district = model.districts.find((entry) => entry.locationId === door.districtId)!;
      const inPlot =
        door.x >= district.origin.x - 1 &&
        door.x <= district.origin.x + district.width + 1 &&
        door.z >= district.origin.z - 1 &&
        door.z <= district.origin.z + district.depth + 1;
      expect(inPlot).toBe(true);
    }
  });

  it("places every co-located NPC and loose item", () => {
    const location = world.locations.find((l) => l.id === world.player.locationId)!;
    const district = generateDistrict(world, location);
    const expectedNpcs = world.npcs.filter((npc) => npc.locationId === location.id && npc.id !== world.player.characterId);
    expect(district.npcSpawns.map((s) => s.npcId).sort()).toEqual(expectedNpcs.map((n) => n.id).sort());
    const looseItems = world.items.filter((item) => item.locationId === location.id && !item.holderId);
    expect(district.items).toHaveLength(looseItems.length);
  });
});
