import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { consolidatePlayerImpressionScripted, impressionDue } from "../src/consolidation.ts";
import type { World } from "../src/types.ts";

const fixture = (): World => JSON.parse(readFileSync(new URL("../worlds/village.json", import.meta.url), "utf8")) as World;

describe("sleep-time consolidation", () => {
  test("impressionDue: true once the refresh window passed and there's new player material", () => {
    const world = fixture();
    world.tick = 20;
    const npc = world.npcs[0]!;
    npc.memories = [{ tick: 15, text: "The player helped me at the forge.", meta: { subject: "player", importance: 5 } }];
    expect(impressionDue(npc, world.tick)).toBe(true);
  });

  test("impressionDue: false inside the refresh window", () => {
    const world = fixture();
    world.tick = 20;
    const npc = world.npcs[0]!;
    npc.memories = [{ tick: 15, text: "The player helped me.", meta: { subject: "player", importance: 5 } }];
    npc.plan = { ...(npc.plan ?? {}), lastImpressionTick: 18 };
    expect(impressionDue(npc, world.tick)).toBe(false);
  });

  test("scripted consolidation sets a standing impression and advances the tick", () => {
    const world = fixture();
    world.tick = 30;
    const npc = world.npcs[0]!;
    npc.memories = [{ tick: 25, text: "The player returned my stolen shears.", meta: { subject: "player", importance: 7 } }];
    const impression = consolidatePlayerImpressionScripted(world, npc);
    expect(impression).toBeTruthy();
    expect(npc.playerImpression).toBe(impression);
    expect(npc.plan?.lastImpressionTick).toBe(30);
    expect(npc.playerImpression).toContain("returned my stolen shears");
  });

  test("scripted consolidation returns null with no player material", () => {
    const world = fixture();
    const npc = world.npcs[0]!;
    npc.memories = [];
    npc.relationshipAxes = {};
    expect(consolidatePlayerImpressionScripted(world, npc)).toBeNull();
    expect(npc.playerImpression).toBeUndefined();
  });
});
