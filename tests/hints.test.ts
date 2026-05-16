import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { questHintsFor } from "../src/hints.ts";
import { applyAction, getQuest } from "../src/simulation.ts";
import type { World } from "../src/types.ts";

const fixture = (): World => JSON.parse(readFileSync(new URL("../worlds/village.json", import.meta.url), "utf8")) as World;

describe("learned quest hints", () => {
  test("active quests show non-spoilery starting hints", () => {
    const world = fixture();
    applyAction(world, { type: "accept_quest", actorId: "player", questId: "return_shears" });

    const hints = questHintsFor(world, getQuest(world, "return_shears")!);
    expect(hints.map((hint) => hint.text).join(" ")).toMatch(/Tomas and the forge/);
    expect(hints.some((hint) => hint.text.includes("Bring them back"))).toBe(false);
  });

  test("item-specific hint appears only after the player holds the quest item", () => {
    const world = fixture();
    applyAction(world, { type: "accept_quest", actorId: "player", questId: "return_shears" });
    applyAction(world, { type: "move", actorId: "player", locationId: "forge" });
    applyAction(world, { type: "pickup", actorId: "player", itemId: "shears" });

    const hints = questHintsFor(world, getQuest(world, "return_shears")!);
    expect(hints.map((hint) => hint.text).join(" ")).toMatch(/Bring them back to Mira/);
  });

  test("director clues can surface bridge-whisper guidance", () => {
    const world = fixture();
    applyAction(world, { type: "accept_quest", actorId: "player", questId: "bridge_whisper" });
    world.eventLog.push({
      tick: 1,
      actions: [
        {
          action: { type: "remember", actorId: "lena", text: "Director clue: A blue pulse runs from the bridge toward every missing metal object." },
          text: "Lena noted: Director clue: A blue pulse runs from the bridge toward every missing metal object.",
          fromDirector: true,
        },
      ],
      rejected: [],
      checksum: "test",
      clock: { ...world.clock },
    });

    const hints = questHintsFor(world, getQuest(world, "bridge_whisper")!);
    expect(hints.some((hint) => hint.source === "director")).toBe(true);
  });
});
