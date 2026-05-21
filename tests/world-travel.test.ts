import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import type { World } from "../src/types.ts";
import { keyboardDestinationFor, shortestLocationRoute } from "../web/src/world-travel.ts";

const fixture = (): World => JSON.parse(readFileSync(new URL("../worlds/village.json", import.meta.url), "utf8")) as World;

describe("world travel helpers", () => {
  test("routes through the location graph", () => {
    const world = fixture();

    expect(shortestLocationRoute(world, "bridge", "garden")).toEqual(["square", "garden"]);
  });

  test("maps WASD and arrow keys to adjacent 3D travel directions", () => {
    const world = fixture();

    expect(keyboardDestinationFor(world, "d")).toBe("garden");
    expect(keyboardDestinationFor(world, "ArrowDown")).toBe("inn");
    expect(keyboardDestinationFor(world, "ArrowLeft")).toBe("forge");

    world.player.locationId = "garden";
    expect(keyboardDestinationFor(world, "a")).toBe("square");
    expect(keyboardDestinationFor(world, "x")).toBeNull();
  });
});
