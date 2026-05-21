import type { Engine } from "./simulation.ts";
import type { TickSummary, World } from "./types.ts";

export type AgentLoopState = "idle" | "running" | "stopped" | "error";

export interface AgentLoopCheckpoint {
  tick: number;
  capturedAt: string;
  world: World;
}

export interface AgentLoopStatus {
  state: AgentLoopState;
  intervalMs: number;
  ticksRun: number;
  maxTicks: number | null;
  checkpointEveryTicks: number;
  startedAt: string | null;
  stoppedAt: string | null;
  lastTick: TickSummary | null;
  lastError: string | null;
  checkpoints: Array<{ tick: number; capturedAt: string; worldId: string }>;
}

export interface AgentLoopOptions {
  intervalMs?: number;
  maxTicks?: number | null;
  checkpointEveryTicks?: number;
  now?: () => Date;
  setIntervalFn?: (callback: () => void, ms: number) => unknown;
  clearIntervalFn?: (handle: unknown) => void;
  onCheckpoint?: (checkpoint: AgentLoopCheckpoint) => void;
}

export interface AgentLoop {
  start(): AgentLoopStatus;
  stop(reason?: string): AgentLoopStatus;
  step(): Promise<TickSummary>;
  status(): AgentLoopStatus;
  checkpoints(): AgentLoopCheckpoint[];
}

export function createAgentLoop(engine: Engine, options: AgentLoopOptions = {}): AgentLoop {
  const intervalMs = Math.max(250, options.intervalMs ?? 4_000);
  const maxTicks = options.maxTicks ?? null;
  const checkpointEveryTicks = Math.max(1, options.checkpointEveryTicks ?? 5);
  const now = options.now ?? (() => new Date());
  const setIntervalFn = options.setIntervalFn ?? ((callback, ms) => setInterval(callback, ms));
  const clearIntervalFn = options.clearIntervalFn ?? ((handle) => clearInterval(handle as NodeJS.Timeout));
  const checkpoints: AgentLoopCheckpoint[] = [];
  let state: AgentLoopState = "idle";
  let timer: unknown = null;
  let stepping = false;
  let ticksRun = 0;
  let startedAt: string | null = null;
  let stoppedAt: string | null = null;
  let lastTick: TickSummary | null = null;
  let lastError: string | null = null;

  const loop: AgentLoop = {
    start() {
      if (state === "running") return status();
      state = "running";
      startedAt = now().toISOString();
      stoppedAt = null;
      lastError = null;
      timer = setIntervalFn(() => {
        void loop.step().catch((error) => {
          if ((error as Error).message === "agent_loop_step_in_progress") return;
          state = "error";
          lastError = (error as Error).message;
          clearTimer();
        });
      }, intervalMs);
      return status();
    },
    stop(reason = "stopped") {
      clearTimer();
      state = reason === "error" ? "error" : "stopped";
      stoppedAt = now().toISOString();
      return status();
    },
    async step() {
      if (stepping) throw new Error("agent_loop_step_in_progress");
      if (maxTicks !== null && ticksRun >= maxTicks) {
        loop.stop("max_ticks");
        throw new Error("agent_loop_max_ticks_reached");
      }
      stepping = true;
      try {
        const summary = await engine.tick(undefined);
        ticksRun += 1;
        lastTick = summary;
        lastError = null;
        if (ticksRun % checkpointEveryTicks === 0) captureCheckpoint();
        if (maxTicks !== null && ticksRun >= maxTicks && state === "running") loop.stop("max_ticks");
        return summary;
      } catch (error) {
        state = "error";
        lastError = (error as Error).message;
        clearTimer();
        throw error;
      } finally {
        stepping = false;
      }
    },
    status,
    checkpoints: () => [...checkpoints],
  };

  return loop;

  function status(): AgentLoopStatus {
    return {
      state,
      intervalMs,
      ticksRun,
      maxTicks,
      checkpointEveryTicks,
      startedAt,
      stoppedAt,
      lastTick,
      lastError,
      checkpoints: checkpoints.map((checkpoint) => ({
        tick: checkpoint.tick,
        capturedAt: checkpoint.capturedAt,
        worldId: checkpoint.world.id,
      })),
    };
  }

  function captureCheckpoint(): void {
    const checkpoint = {
      tick: engine.state.tick,
      capturedAt: now().toISOString(),
      world: cloneWorld(engine.state),
    };
    checkpoints.push(checkpoint);
    options.onCheckpoint?.(checkpoint);
  }

  function clearTimer(): void {
    if (timer === null) return;
    clearIntervalFn(timer);
    timer = null;
  }
}

function cloneWorld(world: World): World {
  return JSON.parse(JSON.stringify(world)) as World;
}
