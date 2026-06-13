import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { nextObjective, sessionOutcome } from "../src/outcome.ts";
import type { World } from "../src/types.ts";

const fixture = (): World => JSON.parse(readFileSync(new URL("../worlds/village.json", import.meta.url), "utf8")) as World;

describe("sessionOutcome", () => {
  test("ongoing by default", () => {
    expect(sessionOutcome(fixture())).toBe("ongoing");
  });

  test("won when the arc completes", () => {
    const world = fixture();
    world.arc = {
      id: "a",
      title: "t",
      stage: "complete",
      mentorId: "mira",
      villainId: null,
      sparWon: true,
      questsDoneBaseline: 0,
      stageTexts: { training: "", trial: "", confrontation: "", complete: "" },
    };
    expect(sessionOutcome(world)).toBe("won");
  });

  test("lost when director pressure maxes out", () => {
    const world = fixture();
    world.directorState = { pressure: 100, quietTicks: 0 };
    expect(sessionOutcome(world)).toBe("lost");
  });

  test("win takes precedence over a high-pressure lose", () => {
    const world = fixture();
    world.storyProgress = { phase: "dawn_after_tasks", unlockedCutsceneIds: [], playedCutsceneIds: [] };
    world.directorState = { pressure: 100, quietTicks: 0 };
    expect(sessionOutcome(world)).toBe("won");
  });
});

describe("nextObjective", () => {
  test("prefers an authored currentObjective", () => {
    const world = fixture();
    world.story = { title: "t", premise: "p", opening: "o", currentObjective: "Light the forge." };
    expect(nextObjective(world)).toBe("Light the forge.");
  });

  test("falls back to the active player quest", () => {
    const world = fixture();
    if (world.story) world.story.currentObjective = undefined;
    const quest = world.quests![0]!;
    quest.acceptedBy = "player";
    quest.status = "active";
    expect(nextObjective(world)).toContain(quest.description ?? quest.title);
  });

  test("never returns empty", () => {
    const world = fixture();
    if (world.story) world.story.currentObjective = undefined;
    world.quests = [];
    world.arc = undefined;
    expect(nextObjective(world).length).toBeGreaterThan(0);
  });
});
