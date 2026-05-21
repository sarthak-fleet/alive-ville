import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { activeObjectives } from "../src/objectives.ts";
import { applyAction } from "../src/simulation.ts";
import { isCutsceneUnlocked, STARTER_QUEST_IDS, syncStoryProgress } from "../src/story-progress.ts";
import type { World } from "../src/types.ts";

const fixture = (): World => JSON.parse(readFileSync(new URL("../worlds/village.json", import.meta.url), "utf8")) as World;

describe("story progress", () => {
  test("starts in starter phase with only intro available", () => {
    const world = fixture();
    syncStoryProgress(world);

    expect(world.storyProgress?.phase).toBe("starter");
    expect(isCutsceneUnlocked(world, "ashbend_intro_square")).toBe(true);
    expect(isCutsceneUnlocked(world, "villain_lantern_shadow")).toBe(false);
    expect(isCutsceneUnlocked(world, "dawn_after_tasks")).toBe(false);
  });

  test("completing all starter quests advances to nightfall warning and unlocks villain scene", () => {
    const world = fixture();
    completeStarterQuests(world);

    expect(world.storyProgress?.phase).toBe("nightfall_warning");
    expect(isCutsceneUnlocked(world, "villain_lantern_shadow")).toBe(true);
    expect(activeObjectives(world)[0]?.questTitle).toBe("Go to Lantern Inn before nightfall");
  });

  test("dawn unlocks only after the shadow confrontation resolves", () => {
    const world = fixture();
    completeStarterQuests(world);

    expect(isCutsceneUnlocked(world, "dawn_after_tasks")).toBe(false);
    applyAction(world, { type: "move", actorId: "player", locationId: "inn" });
    expect(world.storyProgress?.phase).toBe("shadow_confrontation");
    expect(isCutsceneUnlocked(world, "dawn_after_tasks")).toBe(false);

    applyAction(world, {
      type: "confront",
      actorId: "player",
      targetId: "lena",
      text: "The lantern shadow is here. Step into the light.",
    });
    expect(world.storyProgress?.phase).toBe("dawn_after_tasks");
    expect(isCutsceneUnlocked(world, "dawn_after_tasks")).toBe(true);
  });

  test("quest cutscenes unlock only after their quests complete", () => {
    const world = fixture();
    expect(isCutsceneUnlocked(world, "garden_morning")).toBe(false);

    applyAction(world, { type: "accept_quest", actorId: "player", questId: "return_shears" });
    applyAction(world, { type: "complete_quest", actorId: "player", questId: "return_shears" });

    expect(isCutsceneUnlocked(world, "garden_morning")).toBe(true);
    expect(isCutsceneUnlocked(world, "forge_rekindled")).toBe(false);
  });
});

function completeStarterQuests(world: World): void {
  for (const questId of STARTER_QUEST_IDS) {
    applyAction(world, { type: "accept_quest", actorId: "player", questId });
    applyAction(world, { type: "complete_quest", actorId: "player", questId });
  }
}
