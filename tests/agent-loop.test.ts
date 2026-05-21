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

  test("restores a captured checkpoint without exposing mutable checkpoint state", async () => {
    const engine = createEngine(fixture(), { propose: async () => [] });
    const loop = createAgentLoop(engine, {
      checkpointEveryTicks: 1,
      now: () => new Date("2026-05-21T00:00:00.000Z"),
    });

    await loop.step();
    const checkpoint = loop.checkpoints()[0]!;
    await loop.step();
    expect(engine.state.tick).toBe(2);
    checkpoint.world.tick = 99;

    const restored = loop.restoreCheckpoint(1);

    expect(restored.tick).toBe(1);
    expect(engine.state.tick).toBe(1);
    expect(loop.status()).toMatchObject({
      state: "stopped",
      lastTick: null,
      restoredCheckpoint: { tick: 1, worldId: "ashbend" },
    });
    expect(loop.checkpoints()[0]?.world.tick).toBe(1);
    expect(() => loop.restoreCheckpoint(99)).toThrow("agent_loop_checkpoint_not_found");
  });

  test("hydrates persisted checkpoints into a fresh loop and caps retention", async () => {
    const firstEngine = createEngine(fixture(), { propose: async () => [] });
    const firstLoop = createAgentLoop(firstEngine, {
      checkpointEveryTicks: 1,
      now: () => new Date("2026-05-21T00:00:00.000Z"),
    });

    await firstLoop.step();
    await firstLoop.step();
    const persisted = JSON.parse(JSON.stringify(firstLoop.checkpoints())) as ReturnType<typeof firstLoop.checkpoints>;
    persisted[0]!.world.tick = 99;

    const nextEngine = createEngine(fixture(), { propose: async () => [] });
    const nextLoop = createAgentLoop(nextEngine, {
      checkpointEveryTicks: 1,
      initialCheckpoints: persisted,
      maxCheckpoints: 2,
      now: () => new Date("2026-05-21T00:01:00.000Z"),
    });

    expect(nextLoop.checkpoints().map((checkpoint) => checkpoint.tick)).toEqual([1, 2]);
    expect(nextLoop.restoreCheckpoint(2).world.tick).toBe(2);
    expect(nextEngine.state.tick).toBe(2);

    await nextLoop.step();

    expect(nextLoop.checkpoints().map((checkpoint) => checkpoint.tick)).toEqual([2, 3]);
    expect(() => nextLoop.restoreCheckpoint(1)).toThrow("agent_loop_checkpoint_not_found");
  });

  test("clears checkpoints when the owning world is replaced", async () => {
    const engine = createEngine(fixture(), { propose: async () => [] });
    const loop = createAgentLoop(engine, {
      checkpointEveryTicks: 1,
      now: () => new Date("2026-05-21T00:00:00.000Z"),
    });

    await loop.step();

    expect(loop.checkpoints().map((checkpoint) => checkpoint.tick)).toEqual([1]);
    expect(loop.status().lastTick).not.toBeNull();
    expect(loop.status().ticksRun).toBe(1);
    const status = loop.clearCheckpoints();

    expect(status.checkpoints).toEqual([]);
    expect(status.restoredCheckpoint).toBeNull();
    expect(status.lastTick).toBeNull();
    expect(status.ticksRun).toBe(0);
    expect(loop.checkpoints()).toEqual([]);
    expect(() => loop.restoreCheckpoint()).toThrow("agent_loop_checkpoint_missing");
  });

  test("waits for an in-flight autonomous step before replacement cleanup", async () => {
    let releaseTick: () => void = () => {
      throw new Error("agent loop tick was not scheduled");
    };
    const engine = createEngine(fixture(), {
      propose: () => new Promise((resolve) => {
        releaseTick = () => resolve([]);
      }),
    });
    const loop = createAgentLoop(engine);

    const step = loop.step();
    let settled = false;
    const idle = loop.waitForIdle().then(() => {
      settled = true;
      return undefined;
    });
    await waitForMicrotasks();

    expect(settled).toBe(false);
    releaseTick();
    await step;
    await idle;

    expect(settled).toBe(true);
    expect(loop.status().ticksRun).toBe(1);
  });
});

function waitForMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
