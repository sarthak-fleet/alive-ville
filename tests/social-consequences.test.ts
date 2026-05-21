import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { applyAction } from "../src/simulation.ts";
import type { World } from "../src/types.ts";

const fixture = (): World => JSON.parse(readFileSync(new URL("../worlds/village.json", import.meta.url), "utf8")) as World;

describe("social consequences", () => {
  test("helpful talk changes relationship axes without forcing a quest score reward", () => {
    const world = fixture();
    const before = world.npcs.find((npc) => npc.id === "mira")!.relationshipAxes?.["player"]?.trust ?? 0;

    const result = applyAction(world, {
      type: "talk",
      actorId: "player",
      targetId: "mira",
      text: "I am working on the task and will return the shears safely.",
    });

    expect(result.applied).toBe(true);
    expect(world.npcs.find((npc) => npc.id === "mira")!.relationshipAxes?.["player"]?.trust).toBeGreaterThan(before);
    expect(world.npcs.find((npc) => npc.id === "mira")!.relationships["player"]).toBeUndefined();
  });

  test("gossip raises suspicion toward the subject and leaves a memory trail", () => {
    const world = fixture();
    const lenaBefore = world.npcs.find((npc) => npc.id === "lena")!.relationshipAxes?.["pax"]?.suspicion ?? 0;

    const result = applyAction(world, {
      type: "gossip",
      actorId: "orrin",
      targetId: "lena",
      aboutId: "pax",
      text: "Pax may know why metal keeps vanishing near the notice board.",
    });

    expect(result.applied).toBe(true);
    const lena = world.npcs.find((npc) => npc.id === "lena")!;
    expect(lena.relationshipAxes?.["pax"]?.suspicion).toBeGreaterThan(lenaBefore);
    expect(lena.memories.at(-1)?.text).toMatch(/shared a rumor/i);
  });

  test("confrontation increases stress and suspicion for the target", () => {
    const world = fixture();
    const tomas = world.npcs.find((npc) => npc.id === "tomas")!;
    const stressBefore = tomas.mood!.stress;

    const result = applyAction(world, {
      type: "confront",
      actorId: "mira",
      targetId: "tomas",
      text: "You hid what happened near the bridge.",
    });

    expect(result.applied).toBe(true);
    expect(tomas.mood!.stress).toBeGreaterThan(stressBefore);
    expect(tomas.relationshipAxes?.["mira"]?.suspicion).toBeGreaterThan(1);
  });

  test("quest completion writes a trusted aftermath when the giver trusts the player", () => {
    const world = fixture();
    applyAction(world, {
      type: "talk",
      actorId: "player",
      targetId: "mira",
      text: "I will help, return the shears, and keep the garden safe.",
    });
    applyAction(world, { type: "accept_quest", actorId: "player", questId: "return_shears" });
    applyAction(world, { type: "move", actorId: "player", locationId: "forge" });
    applyAction(world, { type: "pickup", actorId: "player", itemId: "shears" });
    applyAction(world, { type: "move", actorId: "player", locationId: "square" });
    applyAction(world, { type: "move", actorId: "player", locationId: "garden" });
    const result = applyAction(world, { type: "give", actorId: "player", itemId: "shears", targetId: "mira" });

    expect(result.applied).toBe(true);
    const mira = world.npcs.find((npc) => npc.id === "mira")!;
    expect(mira.memories.some((memory) => /Trusted quest outcome/i.test(memory.text))).toBe(true);
  });

  test("quest completion can leave a wary aftermath when suspicion is higher than trust", () => {
    const world = fixture();
    applyAction(world, { type: "confront", actorId: "player", targetId: "mira", text: "You hide bridge details and blame others." });
    applyAction(world, { type: "confront", actorId: "player", targetId: "mira", text: "You are still hiding something about the missing tools." });
    applyAction(world, { type: "accept_quest", actorId: "player", questId: "return_shears" });
    applyAction(world, { type: "move", actorId: "player", locationId: "forge" });
    applyAction(world, { type: "pickup", actorId: "player", itemId: "shears" });
    applyAction(world, { type: "move", actorId: "player", locationId: "square" });
    applyAction(world, { type: "move", actorId: "player", locationId: "garden" });
    const result = applyAction(world, { type: "give", actorId: "player", itemId: "shears", targetId: "mira" });

    expect(result.applied).toBe(true);
    const mira = world.npcs.find((npc) => npc.id === "mira")!;
    expect(mira.memories.some((memory) => /Wary quest outcome/i.test(memory.text))).toBe(true);
  });
});
