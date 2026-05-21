import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import type { World } from "../src/types.ts";
import { type WorldIngestSource, worldSourceToWorld } from "../src/world-ingest.ts";
import { buildWorldSceneModel } from "../web/src/three/world-scene.ts";

const fixture = (path = "../worlds/village.json"): World =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as World;
const source = (path: string): WorldIngestSource =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as WorldIngestSource;

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

  test("projects source-derived artifact visuals into generic 3D item nodes", () => {
    const world = worldSourceToWorld(source("../fixtures/worlds/skyfront-source.json"));
    const model = buildWorldSceneModel(world);

    expect(model.items.find((item) => item.id === "route_token")).toMatchObject({
      color: "#d8a441",
      emissiveColor: "#3d2a05",
      material: "metal",
      shape: "token",
      visualTags: expect.arrayContaining(["route", "token", "brass"]),
    });
    expect(model.items.find((item) => item.id === "prism_gear")).toMatchObject({
      color: "#9fc3ff",
      material: "metal",
      shape: "gear",
      visualTags: expect.arrayContaining(["prism", "gear", "glass"]),
    });
    expect(model.items.find((item) => item.id === "painted_flag_scrap")).toMatchObject({
      color: "#e05f7a",
      material: "cloth",
      shape: "scrap",
      visualTags: expect.arrayContaining(["painted", "flag", "scrap"]),
    });
  });

  test("uses source-derived location palettes for visually distinct imported worlds", () => {
    const skyfront = buildWorldSceneModel(worldSourceToWorld(source("../fixtures/worlds/skyfront-source.json")));
    const conservatory = buildWorldSceneModel(worldSourceToWorld(source("../fixtures/worlds/conservatory-source.json")));

    expect(skyfront.locations.find((location) => location.id === "harbor_ring")).toMatchObject({
      groundColor: "#1f3f58",
      structureColor: "#6fa6c8",
      accentColor: "#f5d782",
    });
    expect(conservatory.locations.find((location) => location.id === "atrium_gate")).toMatchObject({
      groundColor: "#203d2d",
      structureColor: "#5e8f68",
      accentColor: "#d8c77a",
    });
    expect(conservatory.locations.find((location) => location.id === "moon_bridge")).toMatchObject({
      groundColor: "#202b3d",
      structureColor: "#6b7f99",
      accentColor: "#9fc3ff",
    });
    expect(conservatory.locations.find((location) => location.id === "atrium_gate")?.groundColor)
      .not.toBe(skyfront.locations.find((location) => location.id === "harbor_ring")?.groundColor);
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

  test("changes 3D lighting mood with the world clock", () => {
    const world = fixture();

    world.clock.hour = 7;
    const dawn = buildWorldSceneModel(world).mood;
    world.clock.hour = 14;
    const day = buildWorldSceneModel(world).mood;
    world.clock.hour = 20;
    const dusk = buildWorldSceneModel(world).mood;
    world.clock.hour = 23;
    const night = buildWorldSceneModel(world).mood;

    expect(dawn).toMatchObject({ phase: "dawn", sunColor: "#ffd28a" });
    expect(day).toMatchObject({ phase: "day", sunIntensity: 2.2 });
    expect(dusk).toMatchObject({ phase: "dusk", fogColor: "#3b2b3d" });
    expect(night).toMatchObject({ phase: "night", skyColor: "#050812" });
    expect(night.sunIntensity).toBeLessThan(day.sunIntensity);
    expect(night.fogDensity).toBeGreaterThan(day.fogDensity);
  });
});
