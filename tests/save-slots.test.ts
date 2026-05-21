import { describe, expect, test } from "vitest";

import type { Snapshot } from "../web/src/api/client.ts";
import { describeQuickSlot, loadQuickSlot, saveQuickSlot, type StorageLike } from "../web/src/save-slots.ts";

function memoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

const snapshot = (): Snapshot => ({
  capturedAt: "2026-05-21T00:00:00.000Z",
  world: {
    id: "ashbend",
    name: "Ashbend Village",
    tick: 7,
    player: { locationId: "garden" },
    clock: { day: 1, hour: 14, hoursPerTick: 1 },
    locations: [{ id: "garden", name: "Moonmint Garden", x: 0, y: 0, w: 1, h: 1 }],
    exits: [],
    npcs: [],
    items: [],
    eventLog: [],
  },
});

describe("quick save slots", () => {
  test("stores resumable world metadata with the snapshot", () => {
    const storage = memoryStorage();
    const slot = saveQuickSlot(storage, snapshot());

    expect(slot.worldId).toBe("ashbend");
    expect(slot.day).toBe(1);
    expect(slot.hour).toBe(14);
    expect(slot.tick).toBe(7);
    expect(loadQuickSlot(storage)?.snapshot.world.player.locationId).toBe("garden");
  });

  test("describes a slot in player-facing terms", () => {
    const slot = saveQuickSlot(memoryStorage(), snapshot());

    expect(describeQuickSlot(slot)).toBe("Ashbend Village · Day 1, 14:00 · t7");
  });

  test("drops malformed slot data instead of returning a broken save", () => {
    const storage = memoryStorage();
    storage.setItem("ai-game.quick-save.v1", JSON.stringify({ snapshot: { world: { id: "" } } }));

    expect(loadQuickSlot(storage)).toBeNull();
    expect(storage.getItem("ai-game.quick-save.v1")).toBeNull();
  });
});
