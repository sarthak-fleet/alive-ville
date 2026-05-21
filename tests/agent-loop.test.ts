import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { createAgentLoop } from "../src/agent-loop.ts";
import { createEngine } from "../src/simulation.ts";
import type { World } from "../src/types.ts";

const fixture = (): World => JSON.parse(readFileSync(new URL("../worlds/village.json", import.meta.url), "utf8")) as World;

describe("long-running agent loop", () => {
  test("runs autonomous ticks and checkpoints the world", async () => {
    const engine = createEngine(fixture(), { propose: async () => [] });
    const checkpoints: number[] = [];
    const loop = createAgentLoop(engine, {
      checkpointEveryTicks: 2,
      now: () => new Date("2026-05-21T00:00:00.000Z"),
      onCheckpoint: (checkpoint) => checkpoints.push(checkpoint.tick),
    });

    await loop.step();
    await loop.step();

    expect(engine.state.tick).toBe(2);
    expect(loop.status()).toMatchObject({ state: "idle", ticksRun: 2, lastError: null });
    expect(checkpoints).toEqual([2]);
    expect(loop.checkpoints()[0]?.world.tick).toBe(2);
  });

  test("starts and stops with injectable timers for server control", async () => {
    const scheduled: Array<() => void> = [];
    let cleared = false;
    const engine = createEngine(fixture(), { propose: async () => [] });
    const loop = createAgentLoop(engine, {
      intervalMs: 250,
      setIntervalFn: (callback) => {
        scheduled.push(callback);
        return "timer";
      },
      clearIntervalFn: (handle) => {
        if (handle === "timer") cleared = true;
      },
    });

    expect(loop.start().state).toBe("running");
    scheduled[0]?.();
    await waitForMicrotasks();
    expect(loop.status().ticksRun).toBe(1);
    expect(loop.stop().state).toBe("stopped");
    expect(cleared).toBe(true);
  });

  test("skips overlapping interval ticks without killing a long-running loop", async () => {
    const scheduled: Array<() => void> = [];
    let releaseTick: () => void = () => {
      throw new Error("agent loop tick was not scheduled");
    };
    const engine = createEngine(fixture(), {
      propose: () => new Promise((resolve) => {
        releaseTick = () => resolve([]);
      }),
    });
    const loop = createAgentLoop(engine, {
      intervalMs: 250,
      setIntervalFn: (callback) => {
        scheduled.push(callback);
        return "timer";
      },
    });

    expect(loop.start().state).toBe("running");
    scheduled[0]?.();
    await waitForMicrotasks();
    scheduled[0]?.();
    await waitForMicrotasks();

    expect(loop.status()).toMatchObject({ state: "running", ticksRun: 0, lastError: null });
    releaseTick();
    await waitForMicrotasks();
    expect(loop.status()).toMatchObject({ state: "running", ticksRun: 1, lastError: null });
  });

  test("stops at a configured max tick limit", async () => {
    const engine = createEngine(fixture(), { propose: async () => [] });
    const loop = createAgentLoop(engine, { maxTicks: 1 });

    await loop.step();

    await expect(loop.step()).rejects.toThrow("agent_loop_max_ticks_reached");
    expect(loop.status().ticksRun).toBe(1);
  });
});

function waitForMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
