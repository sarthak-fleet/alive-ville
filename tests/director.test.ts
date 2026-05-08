import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { createDirector, findHighestTension } from "../src/director.ts";
import { createEngine } from "../src/simulation.ts";
import type { Action, World } from "../src/types.ts";

const fixture = (): World => JSON.parse(readFileSync(new URL("../worlds/village.json", import.meta.url), "utf8")) as World;

describe("director", () => {
  test("findHighestTension picks the most negative pair", () => {
    const world = fixture();
    world.npcs.find((n) => n.id === "tomas")!.relationships = { mira: -5 };
    const tension = findHighestTension(world);
    expect(tension).not.toBeNull();
    expect(tension!.fromId).toBe("tomas");
    expect(tension!.toId).toBe("mira");
    expect(tension!.score).toBe(-5);
  });

  test("injects gossip when nothing else happens", async () => {
    const world = fixture();
    world.npcs.find((n) => n.id === "orrin")!.relationships["pax"] = -3;
    world.npcs.find((n) => n.id === "lena")!.locationId = "square";
    const director = createDirector();
    const engine = createEngine(world, { propose: async () => [], director });
    const event = await engine.tick();

    const directed = event.actions.find((entry) => entry.fromDirector);
    expect(directed).toBeDefined();
    expect(directed!.action.type).toBe("gossip");
    expect(directed!.action.actorId).toBe("orrin");
    if (directed!.action.type === "gossip") expect(directed!.action.aboutId).toBe("pax");
  });

  test("silent when others act", async () => {
    const world = fixture();
    const director = createDirector();
    const propose = async (): Promise<Action[]> => [{ type: "remember", actorId: "mira", text: "calm day" }];
    const engine = createEngine(world, { propose, director });
    const event = await engine.tick();
    expect(event.actions.some((entry) => entry.fromDirector)).toBe(false);
  });

  test("returns null on tension-free worlds", async () => {
    const world = fixture();
    for (const npc of world.npcs) npc.relationships = {};
    const director = createDirector();
    expect(await director(world)).toBeNull();
  });
});
