import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import type { World } from "../src/types.ts";
import { buildWorldSceneModel } from "../web/src/three/world-scene.ts";

const fixture = (path = "../worlds/village.json"): World =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as World;

describe("3D world scene model", () => {
  test("projects world locations, actors, and loose items into 3D coordinates", () => {
    const world = fixture();
    const model = buildWorldSceneModel(world);

    expect(model.locations.map((location) => location.id)).toContain("square");
    expect(model.locations.find((location) => location.id === world.player.locationId)?.active).toBe(true);
    expect(model.locations.find((location) => location.id === "forge")).toMatchObject({
      structureColor: "#8a4c2e",
      accentColor: "#f08a38",
      landmarks: ["forge_chimney"],
    });
    expect(model.paths.map((path) => `${path.fromId}->${path.toId}`)).toContain("square->garden");
    expect(model.atmosphere.map((node) => node.kind)).toEqual(expect.arrayContaining(["signal", "spark", "firefly", "dust"]));
    expect(model.actors.find((actor) => actor.id === "player")?.player).toBe(true);
    expect(model.actors.some((actor) => actor.id === "mira")).toBe(true);
    expect(model.items.some((item) => item.id === "shears")).toBe(true);
    expect(model.props.some((prop) => prop.id === "forge_tool_rack")).toBe(true);
    expect(model.objectives[0]).toMatchObject({
      targetType: "npc",
      targetId: "mira",
      locationId: "garden",
      primary: true,
    });
    expect(model.bounds.width).toBeGreaterThan(0);
    expect(model.bounds.depth).toBeGreaterThan(0);
  });

  test("uses appearance palettes for anime-world character color", () => {
    const world = fixture("../worlds/one-punch-man.json");
    const model = buildWorldSceneModel(world);

    expect(model.actors.find((actor) => actor.id === "mira")?.color).toBe("#f6d85f");
    expect(model.actors.find((actor) => actor.id === "pax")?.color).toBe("#2b2337");
    expect(model.locations.find((location) => location.id === "bridge")).toMatchObject({
      accentColor: "#8d5cff",
      landmarks: ["bridge_span"],
    });
    expect(model.objectives[0]).toMatchObject({
      targetType: "npc",
      targetId: "mira",
      label: "Recover Saitama's grocery coupon",
    });
    expect(model.atmosphere.map((node) => node.kind)).toEqual(expect.arrayContaining(["spark", "dust", "signal"]));
  });

  test("moves the camera target with the active player location", () => {
    const world = fixture();
    const squareTarget = buildWorldSceneModel(world).cameraTarget;
    world.player.locationId = "bridge";
    const bridgeTarget = buildWorldSceneModel(world).cameraTarget;

    expect(bridgeTarget).not.toEqual(squareTarget);
    expect(bridgeTarget.x).toBeGreaterThanOrEqual(0);
    expect(bridgeTarget.z).toBeGreaterThanOrEqual(0);
  });

  test("moves the primary 3D objective beacon from giver to active item", () => {
    const world = fixture();
    const openObjective = buildWorldSceneModel(world).objectives[0];
    world.quests!.find((quest) => quest.id === "return_shears")!.status = "active";
    const activeObjective = buildWorldSceneModel(world).objectives[0];

    expect(openObjective?.targetType).toBe("npc");
    expect(activeObjective).toMatchObject({
      targetType: "item",
      targetId: "shears",
      locationId: "forge",
      primary: true,
    });
    expect(activeObjective?.x).not.toBe(openObjective?.x);
    expect(activeObjective?.z).not.toBe(openObjective?.z);
  });
});
