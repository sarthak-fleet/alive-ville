import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import type { World } from "../src/types.ts";
import { sceneTargetForWorld } from "../web/src/three/scene-targets.ts";

const fixture = (): World =>
  JSON.parse(readFileSync(new URL("../worlds/village.json", import.meta.url), "utf8")) as World;

describe("3D interaction target priority", () => {
  test("prefers the local objective NPC over incidental local items", () => {
    const world = fixture();
    world.player.locationId = "garden";
    world.items.unshift({
      id: "loose_seed_packet",
      name: "Loose seed packet",
      description: "A non-objective item in the same location as Mira.",
      locationId: "garden",
    });

    expect(sceneTargetForWorld(world)).toEqual({
      kind: "npc",
      id: "mira",
      label: "Mira",
      action: "Talk",
    });
  });

  test("prefers the active objective item over incidental local items", () => {
    const world = fixture();
    world.player.locationId = "forge";
    world.quests!.find((quest) => quest.id === "return_shears")!.status = "active";
    world.items.unshift({
      id: "loose_hammer",
      name: "Loose hammer",
      description: "A non-objective tool on the forge bench.",
      locationId: "forge",
    });

    expect(sceneTargetForWorld(world)).toEqual({
      kind: "item",
      id: "shears",
      label: "Pruning shears",
      action: "Pick up",
    });
  });

  test("keeps a valid hovered target ahead of objective fallback", () => {
    const world = fixture();
    world.player.locationId = "forge";
    world.quests!.find((quest) => quest.id === "return_shears")!.status = "active";

    expect(sceneTargetForWorld(world, {
      kind: "prop",
      id: "forge_tool_rack",
      label: "Sooty tool rack",
      action: "Inspect",
    })).toEqual({
      kind: "prop",
      id: "forge_tool_rack",
      label: "Sooty tool rack",
      action: "Inspect",
    });
  });
});
