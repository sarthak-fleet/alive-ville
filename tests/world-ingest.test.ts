import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { activeObjectives } from "../src/objectives.ts";
import { storyPackageFromWorld, validateStoryPackage } from "../src/story-package.ts";
import { validateWorldIngestSource, type WorldIngestSource, worldSourceToWorld } from "../src/world-ingest.ts";

const source = (path: string): WorldIngestSource =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as WorldIngestSource;

describe("generic world ingest", () => {
  test("compiles a non-anime reviewed world source into the same playable contract", () => {
    const world = worldSourceToWorld(source("../fixtures/worlds/skyfront-source.json"));
    const pkg = storyPackageFromWorld(world);

    expect(world.id).toBe("skyfront_couriers");
    expect(world.name).toBe("Skyfront Couriers Playable Slice");
    expect(world.npcs.map((npc) => npc.name)).toContain("Vex");
    expect(world.locations.find((location) => location.id === "square")?.visual).toMatchObject({
      role: "hub",
      landmarks: ["notice_board"],
    });
    expect(world.locations.find((location) => location.id === "bridge")?.visual?.description).toContain("false pirate flags");
    expect(activeObjectives(world)[0]?.questTitle).toBe("Recover Route token for Mara");
    expect(validateStoryPackage(pkg)).toEqual([]);
  });

  test("keeps anime as one fixture rather than a special ingest path", () => {
    const anime = source("../fixtures/anime/opm-ingest-source.json");

    expect(validateWorldIngestSource(anime)).toEqual([]);
    expect(worldSourceToWorld(anime).id).toBe("opm_ingested_z_city");
  });
});
