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
    expect(world.items.find((item) => item.id === "route_token")?.visual).toMatchObject({
      material: "metal",
      shape: "token",
      palette: { primary: "#d8a441" },
    });
    expect(world.items.find((item) => item.id === "prism_gear")?.visual).toMatchObject({
      material: "metal",
      shape: "gear",
      palette: { primary: "#9fc3ff" },
    });
    expect(world.items.find((item) => item.id === "painted_flag_scrap")?.visual).toMatchObject({
      material: "cloth",
      shape: "scrap",
      palette: { primary: "#e05f7a" },
    });
    expect(world.quests?.map((quest) => [quest.id, quest.giverId])).toEqual([
      ["recover_route_token", "mara"],
      ["recover_prism_gear", "ivo"],
      ["recover_painted_flag_scrap", "nell"],
    ]);
    expect(world.locations.map((location) => location.id)).toEqual([
      "harbor_ring",
      "signal_mast",
      "rookery_deck",
      "guild_counter",
      "chain_bridge",
      "cloud_engine",
    ]);
    expect(world.player.locationId).toBe("harbor_ring");
    expect(world.exits.map((exit) => `${exit.from}->${exit.to}`)).toContain("harbor_ring->rookery_deck");
    expect(world.interactables?.map((prop) => [prop.relatedQuestId, prop.locationId, prop.involvedIds])).toContainEqual(["recover_route_token", "signal_mast", ["mara", "signal_mast"]]);
    expect(world.tensions?.[0]).toMatchObject({
      id: "a_false_pirate_alarm_threatens_the_harbor_route",
      involvedIds: ["vex", "chain_bridge"],
    });
    expect(world.villainPlans?.[0]).toMatchObject({
      id: "a_false_pirate_alarm_threatens_the_harbor_route_plan",
      actorId: "vex",
    });
    expect(world.npcs.map((npc) => npc.name)).toContain("Vex");
    expect(world.locations.find((location) => location.id === "harbor_ring")?.visual).toMatchObject({
      role: "hub",
      palette: { ground: "#1f3f58", structure: "#6fa6c8", accent: "#f5d782" },
      landmarks: ["notice_board"],
    });
    expect(world.locations.find((location) => location.id === "signal_mast")?.visual).toMatchObject({
      palette: { ground: "#1f3f58", structure: "#6fa6c8" },
    });
    expect(world.locations.find((location) => location.id === "chain_bridge")?.visual?.description).toContain("false pirate flags");
    expect(activeObjectives(world)[0]?.questTitle).toBe("Recover Route token for Mara");
    expect(validateStoryPackage(pkg)).toEqual([]);
    expect(JSON.stringify(pkg)).not.toMatch(/mira|tomas|lena|orrin|pax|shears|bellows_leather|blue_ember|rumor_note|lantern|return_shears|rekindle_forge|bridge_whisper|overpass_alert/);
  });

  test("compiles a second non-anime genre without anime-specific labels", () => {
    const world = worldSourceToWorld(source("../fixtures/worlds/conservatory-source.json"));
    const pkg = storyPackageFromWorld(world);

    expect(world.id).toBe("clockwork_conservatory");
    expect(world.name).toBe("Clockwork Conservatory Playable Slice");
    expect(world.story?.title).toBe("Clockwork Conservatory: World Ingest Slice");
    expect(world.story?.currentObjective).toBe("Stabilize Atrium Gate before the core conflict escalates.");
    expect(world.story?.opening).toContain("Cale");
    expect(world.story?.opening).not.toMatch(/anime/i);
    expect(world.rules?.find((rule) => rule.id === "canon_review")?.text).not.toMatch(/anime/i);
    expect(world.locations.map((location) => location.id)).toEqual([
      "atrium_gate",
      "gear_hall",
      "spore_library",
      "inspector_desk",
      "moon_bridge",
      "root_engine",
    ]);
    expect(world.locations.find((location) => location.id === "atrium_gate")?.visual).toMatchObject({
      palette: { ground: "#203d2d", structure: "#5e8f68", accent: "#d8c77a" },
    });
    expect(world.locations.find((location) => location.id === "gear_hall")?.visual).toMatchObject({
      palette: { ground: "#3a3028", structure: "#9b6438", accent: "#f08a38" },
    });
    expect(world.locations.find((location) => location.id === "moon_bridge")?.visual).toMatchObject({
      palette: { ground: "#202b3d", structure: "#6b7f99", accent: "#9fc3ff" },
    });
    expect(world.npcs.map((npc) => npc.id)).toEqual(["eda", "brin", "sal", "merrow", "cale"]);
    expect(world.quests?.map((quest) => [quest.id, quest.giverId])).toEqual([
      ["recover_verdigris_key", "eda"],
      ["recover_glass_gear", "brin"],
      ["recover_luminous_shell", "sal"],
    ]);
    expect(world.items.find((item) => item.id === "verdigris_key")?.visual).toMatchObject({
      material: "metal",
      shape: "token",
    });
    expect(world.items.find((item) => item.id === "glass_gear")?.visual).toMatchObject({
      material: "metal",
      shape: "gear",
    });
    expect(world.items.find((item) => item.id === "luminous_shell")?.visual).toMatchObject({
      material: "organic",
      shape: "scale",
    });
    expect(world.items.find((item) => item.id === "ink_map")?.visual).toMatchObject({
      material: "paper",
      shape: "note",
    });
    expect(world.interactables?.map((prop) => prop.id)).toContain("world_origin_clue");
    expect((world.interactables ?? []).flatMap((prop) => prop.clueTags ?? [])).not.toContain("anime");
    expect(activeObjectives(world)[0]).toMatchObject({
      questId: "recover_verdigris_key",
      targetType: "npc",
      targetId: "eda",
    });
    expect(world.tensions?.[0]).toMatchObject({
      id: "a_forged_ward_alarm_threatens_the_moon_bridge",
      involvedIds: ["cale", "moon_bridge"],
    });
    expect(validateStoryPackage(pkg)).toEqual([]);
    expect(JSON.stringify(pkg)).not.toMatch(/Anime Ingest Slice|anime conflict|anime_origin|anime_report|anime_antagonist|"id":"(?:mira|tomas|lena|orrin|pax|shears|bellows_leather|blue_ember|rumor_note|lantern)"/);
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
      locationId: "signal_mast",
    });
    expect(applyAction(world, { type: "move", actorId: "player", locationId: "signal_mast" }).applied).toBe(true);
    expect(applyAction(world, { type: "pickup", actorId: "player", itemId: "route_token" }).applied).toBe(true);
    expect(activeObjectives(world)[0]).toMatchObject({
      questId: "recover_route_token",
      targetType: "npc",
      targetId: "mara",
      locationId: "harbor_ring",
    });
    expect(applyAction(world, { type: "move", actorId: "player", locationId: "harbor_ring" }).applied).toBe(true);
    expect(applyAction(world, { type: "give", actorId: "player", itemId: "route_token", targetId: "mara" }).applied).toBe(true);
    expect(getQuest(world, "recover_route_token")?.status).toBe("done");
  });

  test("uses source-derived story objectives after a generic world's starter quests", () => {
    const world = worldSourceToWorld(source("../fixtures/worlds/skyfront-source.json"));

    for (const questId of ["recover_route_token", "recover_prism_gear", "recover_painted_flag_scrap"]) {
      expect(applyAction(world, { type: "accept_quest", actorId: "player", questId }).applied).toBe(true);
      expect(applyAction(world, { type: "complete_quest", actorId: "player", questId }).applied).toBe(true);
    }

    expect(world.storyProgress?.phase).toBe("nightfall_warning");
    expect(activeObjectives(world)[0]).toMatchObject({
      questTitle: "Report to Guild Counter before pressure peaks",
      locationId: "guild_counter",
      text: "Reach Guild Counter before a false pirate alarm threatens the harbor route escalates.",
    });

    expect(applyAction(world, { type: "move", actorId: "player", locationId: "guild_counter" }).applied).toBe(true);
    expect(world.storyProgress?.phase).toBe("shadow_confrontation");
    expect(activeObjectives(world)[0]).toMatchObject({
      questTitle: "Confront Vex",
      storyTargetId: "vex",
      text: "Call Vex into the open with Nell watching.",
    });

    expect(applyAction(world, {
      type: "confront",
      actorId: "player",
      targetId: "vex",
      text: "The fresh paint and false flag plan end here.",
    }).applied).toBe(true);
    expect(world.storyProgress?.phase).toBe("dawn_after_tasks");
    expect(activeObjectives(world)[0]?.questTitle).toBe("Skyfront Couriers Playable Slice route stabilized");
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

  test("reports duplicate generic source entries without anime wording", () => {
    const duplicate = source("../fixtures/worlds/conservatory-source.json");
    duplicate.locations[1] = { ...duplicate.locations[1]!, name: duplicate.locations[0]!.name };

    expect(validateWorldIngestSource(duplicate).find((issue) => issue.path === "locations")?.message)
      .toBe("Duplicate world source entry \"Atrium Gate\" is not allowed.");
  });
});
