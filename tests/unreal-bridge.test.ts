import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import type { World } from "../src/types.ts";
import { unrealWorldStateFromWorld } from "../src/unreal-bridge.ts";

const fixture = (): World =>
  JSON.parse(readFileSync(new URL("../worlds/village.json", import.meta.url), "utf8")) as World;

describe("Unreal bridge", () => {
  test("projects world state into an Unreal-friendly scene contract", () => {
    const world = fixture();
    const state = unrealWorldStateFromWorld(world, {
      state: "running",
      ticksRun: 7,
      checkpoints: [{ tick: 5 }],
    });

    expect(state.protocol).toBe("ashment-unreal-v1");
    expect(state.worldId).toBe("ashment");
    expect(state.locations).toHaveLength(world.locations.length);
    expect(state.locations.find((location) => location.id === world.player.locationId)).toMatchObject({
      active: true,
      center: { x: 3300, y: 2400 },
    });
    expect(state.actors.find((actor) => actor.player)).toMatchObject({
      name: "Wanderer",
      locationId: "square",
    });
    expect(state.objectives[0]).toMatchObject({
      questTitle: "Return the pruning shears",
      targetType: "npc",
      targetId: "mira",
      actionLabel: "Talk",
      primary: true,
    });
    expect(state.agentLoop).toEqual({
      state: "running",
      ticksRun: 7,
      checkpointTicks: [5],
    });
  });

  test("moves objective targets as quest state changes", () => {
    const world = fixture();
    world.player.locationId = "forge";
    world.quests!.find((quest) => quest.id === "return_shears")!.status = "active";

    const state = unrealWorldStateFromWorld(world);

    expect(state.objectives[0]).toMatchObject({
      targetType: "item",
      targetId: "shears",
      actionLabel: "Pick up",
      locationId: "forge",
    });
    expect(state.items.find((item) => item.id === "shears")).toMatchObject({
      locationId: "forge",
      shape: "gear",
      material: "metal",
    });
  });
});
