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
    expect(model.paths.map((path) => `${path.fromId}->${path.toId}`)).toContain("square->garden");
    expect(model.actors.find((actor) => actor.id === "player")?.player).toBe(true);
    expect(model.actors.some((actor) => actor.id === "mira")).toBe(true);
    expect(model.items.some((item) => item.id === "shears")).toBe(true);
    expect(model.bounds.width).toBeGreaterThan(0);
    expect(model.bounds.depth).toBeGreaterThan(0);
  });

  test("uses appearance palettes for anime-world character color", () => {
    const world = fixture("../worlds/one-punch-man.json");
    const model = buildWorldSceneModel(world);

    expect(model.actors.find((actor) => actor.id === "mira")?.color).toBe("#f6d85f");
    expect(model.actors.find((actor) => actor.id === "pax")?.color).toBe("#2b2337");
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
});
