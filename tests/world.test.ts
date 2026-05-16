import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { applyAction, createEngine, getItem, hasExit, itemsHeldBy } from "../src/simulation.ts";
import { isNight, timeOfDay, type World } from "../src/types.ts";

const fixture = (): World => JSON.parse(readFileSync(new URL("../worlds/village.json", import.meta.url), "utf8")) as World;

describe("spatial + exits", () => {
  test("hasExit honors bidirectional", () => {
    const world = fixture();
    expect(hasExit(world, "square", "forge")).toBe(true);
    expect(hasExit(world, "forge", "square")).toBe(true);
    expect(hasExit(world, "forge", "garden")).toBe(false);
  });

  test("move rejected when no exit edge", () => {
    const world = fixture();
    const result = applyAction(world, { type: "move", actorId: "player", locationId: "wood" });
    expect(result.applied).toBe(true);

    const blocked = applyAction(world, { type: "move", actorId: "tomas", locationId: "garden" });
    expect(blocked.applied).toBe(false);
    if (!blocked.applied) expect(blocked.reason).toBe("No exit to that location.");
  });

  test("move rejects no-op moves", () => {
    const world = fixture();
    const result = applyAction(world, { type: "move", actorId: "mira", locationId: "garden" });
    expect(result.applied).toBe(false);
    if (!result.applied) expect(result.reason).toBe("Actor is already there.");
  });
});

describe("items", () => {
  test("pickup requires co-location", () => {
    const world = fixture();
    const fail = applyAction(world, { type: "pickup", actorId: "player", itemId: "lantern" });
    expect(fail.applied).toBe(false);

    applyAction(world, { type: "move", actorId: "player", locationId: "inn" });
    const ok = applyAction(world, { type: "pickup", actorId: "player", itemId: "lantern" });
    expect(ok.applied).toBe(true);
    expect(getItem(world, "lantern")!.holderId).toBe("player");
    expect(itemsHeldBy(world, "player").map((i) => i.id)).toEqual(["lantern"]);
  });

  test("give moves item to NPC at same location", () => {
    const world = fixture();
    applyAction(world, { type: "move", actorId: "player", locationId: "inn" });
    applyAction(world, { type: "pickup", actorId: "player", itemId: "lantern" });
    const give = applyAction(world, { type: "give", actorId: "player", itemId: "lantern", targetId: "lena" });
    expect(give.applied).toBe(true);
    expect(getItem(world, "lantern")!.holderId).toBe("lena");
  });

  test("give rejected when target elsewhere", () => {
    const world = fixture();
    const shears = getItem(world, "shears")!;
    delete shears.locationId;
    shears.holderId = "tomas";
    const result = applyAction(world, { type: "give", actorId: "tomas", itemId: "shears", targetId: "mira" });
    expect(result.applied).toBe(false);
    if (!result.applied) expect(result.reason).toBe("Target is not here.");
  });

  test("drop returns item to current location", () => {
    const world = fixture();
    applyAction(world, { type: "move", actorId: "player", locationId: "inn" });
    applyAction(world, { type: "pickup", actorId: "player", itemId: "lantern" });
    const drop = applyAction(world, { type: "drop", actorId: "player", itemId: "lantern" });
    expect(drop.applied).toBe(true);
    expect(getItem(world, "lantern")!.locationId).toBe("inn");
    expect(getItem(world, "lantern")!.holderId).toBeUndefined();
  });
});

describe("clock", () => {
  test("tick advances hours and wraps day", async () => {
    const engine = createEngine(fixture(), { propose: async () => [] });
    const day1Hour = engine.state.clock.hour;
    const summary = await engine.tick();
    expect(engine.state.clock.hour).toBe(day1Hour + engine.state.clock.hoursPerTick);
    expect(summary.clock.hour).toBe(engine.state.clock.hour);

    engine.state.clock.hour = 23;
    engine.state.clock.hoursPerTick = 2;
    await engine.tick();
    expect(engine.state.clock.hour).toBe(1);
    expect(engine.state.clock.day).toBe(2);
  });

  test("isNight + timeOfDay", () => {
    expect(isNight({ hoursPerTick: 1, hour: 23, day: 1 })).toBe(true);
    expect(isNight({ hoursPerTick: 1, hour: 12, day: 1 })).toBe(false);
    expect(timeOfDay({ hoursPerTick: 1, hour: 7, day: 1 })).toBe("dawn");
    expect(timeOfDay({ hoursPerTick: 1, hour: 14, day: 1 })).toBe("day");
    expect(timeOfDay({ hoursPerTick: 1, hour: 19, day: 1 })).toBe("dusk");
  });
});
