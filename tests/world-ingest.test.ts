import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { activeObjectives } from "../src/objectives.ts";
import { applyAction, getQuest } from "../src/simulation.ts";
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
    expect(world.story?.title).toBe("Skyfront Couriers: World Ingest Slice");
    expect(world.story?.currentObjective).toBe("Stabilize Harbor Ring before the core conflict escalates.");
    expect(world.rules?.find((rule) => rule.id === "canon_review")?.text).toContain("World ingest creates");
    expect(world.interactables?.map((prop) => prop.id)).toContain("world_origin_clue");
    expect((world.interactables ?? []).flatMap((prop) => prop.clueTags ?? [])).not.toContain("anime");
    expect(world.npcs.map((npc) => npc.id)).toEqual(["mara", "ivo", "nell", "orric", "vex"]);
    expect(world.items.map((item) => item.id)).toEqual(["route_token", "prism_gear", "painted_flag_scrap", "false_alarm_note", "guild_radio"]);
    expect(world.quests?.map((quest) => [quest.id, quest.giverId])).toEqual([
      ["recover_route_token", "mara"],
      ["recover_prism_gear", "ivo"],
      ["recover_painted_flag_scrap", "nell"],
    ]);
    expect(world.interactables?.map((prop) => [prop.relatedQuestId, prop.involvedIds])).toContainEqual(["recover_route_token", ["mara", "forge"]]);
    expect(world.tensions?.[0]).toMatchObject({
      id: "a_false_pirate_alarm_threatens_the_harbor_route",
      involvedIds: ["vex", "bridge"],
    });
    expect(world.villainPlans?.[0]).toMatchObject({
      id: "a_false_pirate_alarm_threatens_the_harbor_route_plan",
      actorId: "vex",
    });
    expect(world.npcs.map((npc) => npc.name)).toContain("Vex");
    expect(world.locations.find((location) => location.id === "square")?.visual).toMatchObject({
      role: "hub",
      landmarks: ["notice_board"],
    });
    expect(world.locations.find((location) => location.id === "bridge")?.visual?.description).toContain("false pirate flags");
    expect(activeObjectives(world)[0]?.questTitle).toBe("Recover Route token for Mara");
    expect(validateStoryPackage(pkg)).toEqual([]);
    expect(JSON.stringify(pkg)).not.toMatch(/mira|tomas|lena|orrin|pax|shears|bellows_leather|blue_ember|rumor_note|lantern|return_shears|rekindle_forge|bridge_whisper|overpass_alert/);
  });

  test("keeps source-derived generic quest IDs playable through the first objective loop", () => {
    const world = worldSourceToWorld(source("../fixtures/worlds/skyfront-source.json"));

    expect(activeObjectives(world)[0]).toMatchObject({
      questId: "recover_route_token",
      targetType: "npc",
      targetId: "mara",
    });
    expect(applyAction(world, { type: "accept_quest", actorId: "player", questId: "recover_route_token" }).applied).toBe(true);
    expect(activeObjectives(world)[0]).toMatchObject({
      questId: "recover_route_token",
      targetType: "item",
      targetId: "route_token",
      locationId: "forge",
    });
    expect(applyAction(world, { type: "move", actorId: "player", locationId: "forge" }).applied).toBe(true);
    expect(applyAction(world, { type: "pickup", actorId: "player", itemId: "route_token" }).applied).toBe(true);
    expect(activeObjectives(world)[0]).toMatchObject({
      questId: "recover_route_token",
      targetType: "npc",
      targetId: "mara",
      locationId: "square",
    });
    expect(applyAction(world, { type: "move", actorId: "player", locationId: "square" }).applied).toBe(true);
    expect(applyAction(world, { type: "give", actorId: "player", itemId: "route_token", targetId: "mara" }).applied).toBe(true);
    expect(getQuest(world, "recover_route_token")?.status).toBe("done");
  });

  test("keeps anime as one fixture rather than a special ingest path", () => {
    const anime = source("../fixtures/anime/opm-ingest-source.json");

    expect(validateWorldIngestSource(anime)).toEqual([]);
    expect(worldSourceToWorld(anime).id).toBe("opm_ingested_z_city");
  });

  test("rejects malformed generic source before it can replace a playable world", () => {
    const invalid = source("../fixtures/worlds/invalid-source.json");

    expect(validateWorldIngestSource(invalid).map((issue) => issue.path)).toEqual(
      expect.arrayContaining(["title", "synopsis", "locations", "characters"])
    );
    expect(validateWorldIngestSource(invalid).find((issue) => issue.path === "title")?.message).toBe("World title is required.");
    expect(() => worldSourceToWorld(invalid)).toThrow("Invalid world ingest source");
  });
});
