import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import type { TickSummary, World } from "../src/types.ts";
import { cutsceneForSummary, cutscenesForScope, introCutsceneForScope, unlockedCutscenesForScope } from "../web/src/cutscenes.ts";

const scope = { worldId: "ashbend", storyId: "ember_beneath_ashbend" };
const fixture = (): World => JSON.parse(readFileSync(new URL("../worlds/village.json", import.meta.url), "utf8")) as World;

describe("cutscene catalog", () => {
  test("filters and orders scenes by world/story scope", () => {
    expect(cutscenesForScope(scope).map((cutscene) => cutscene.id)).toEqual([
      "ashbend_intro_square",
      "garden_morning",
      "forge_rekindled",
      "bridge_whisper",
      "villain_lantern_shadow",
      "dawn_after_tasks",
    ]);
  });

  test("finds the scoped intro scene", () => {
    expect(introCutsceneForScope(scope)?.id).toBe("ashbend_intro_square");
  });

  test("resolves quest-completion scenes from summary text", () => {
    expect(cutsceneForSummary(summary("Rekindle the old forge is complete."), scope)?.id).toBe("forge_rekindled");
    expect(cutsceneForSummary(summary("Listen at the old bridge is complete."), scope)?.id).toBe("bridge_whisper");
  });

  test("ignores unrelated worlds", () => {
    expect(cutsceneForSummary(summary("Rekindle the old forge is complete."), { worldId: "other_world" })).toBeNull();
  });

  test("unlock resolver starts with only the intro available", () => {
    expect(unlockedCutscenesForScope(scope, fixture()).map((cutscene) => cutscene.id)).toEqual(["ashbend_intro_square"]);
  });

  test("unrelated worlds do not unlock Ashbend scenes", () => {
    const world = fixture();
    world.id = "other_world";
    world.storyProgress = {
      phase: "dawn_after_tasks",
      unlockedCutsceneIds: [
        "ashbend_intro_square",
        "garden_morning",
        "forge_rekindled",
        "bridge_whisper",
        "villain_lantern_shadow",
        "dawn_after_tasks",
      ],
      playedCutsceneIds: [],
    };

    expect(unlockedCutscenesForScope(scope, world)).toEqual([]);
  });
});

function summary(text: string): TickSummary {
  return {
    tick: 1,
    actions: [{ action: { type: "remember", actorId: "player", text }, text }],
    rejected: [],
    checksum: "test",
    clock: { day: 1, hour: 8, hoursPerTick: 2 },
  };
}
