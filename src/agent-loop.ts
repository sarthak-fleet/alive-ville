import type { Engine } from './simulation.ts';
import type { TickSummary, World } from './types.ts';

type AgentLoopState = 'idle' | 'running' | 'stopped' | 'error';

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
  restoredCheckpoint: { tick: number; capturedAt: string; worldId: string } | null;
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
  onTick?: (summary: TickSummary) => void;
  initialCheckpoints?: AgentLoopCheckpoint[];
  maxCheckpoints?: number;
}

export interface AgentLoop {
  start(): AgentLoopStatus;
  stop(reason?: string): AgentLoopStatus;
  step(): Promise<TickSummary>;
  restoreCheckpoint(tick?: number): AgentLoopCheckpoint;
  clearCheckpoints(): AgentLoopStatus;
  waitForIdle(): Promise<void>;
  status(): AgentLoopStatus;
  checkpoints(): AgentLoopCheckpoint[];
}

export function createAgentLoop(engine: Engine, options: AgentLoopOptions = {}): AgentLoop {
  const intervalMs = Math.max(250, options.intervalMs ?? 4_000);
  const maxTicks = options.maxTicks ?? null;
  const checkpointEveryTicks = Math.max(1, options.checkpointEveryTicks ?? 5);
  const maxCheckpoints = Math.max(1, options.maxCheckpoints ?? 24);
  const now = options.now ?? (() => new Date());
  const setIntervalFn = options.setIntervalFn ?? ((callback, ms) => setInterval(callback, ms));
  const clearIntervalFn =
    options.clearIntervalFn ?? ((handle) => clearInterval(handle as NodeJS.Timeout));
  const checkpoints: AgentLoopCheckpoint[] = (options.initialCheckpoints ?? [])
    .map(cloneCheckpoint)
    .slice(-maxCheckpoints);
  let state: AgentLoopState = 'idle';
  let timer: unknown = null;
  let stepping = false;
  let ticksRun = 0;
  let startedAt: string | null = null;
  let stoppedAt: string | null = null;
  let lastTick: TickSummary | null = null;
  let lastError: string | null = null;
  let restoredCheckpoint: AgentLoopStatus['restoredCheckpoint'] = null;
  let currentStep: Promise<void> | null = null;
  let resolveCurrentStep: (() => void) | null = null;

  const loop: AgentLoop = {
    start() {
      if (state === 'running') return status();
      state = 'running';
      startedAt = now().toISOString();
      stoppedAt = null;
      lastError = null;
      restoredCheckpoint = null;
      timer = setIntervalFn(() => {
        void loop.step().catch((error) => {
          if ((error as Error).message === 'agent_loop_step_in_progress') return;
          state = 'error';
          lastError = (error as Error).message;
          clearTimer();
        });
      }, intervalMs);
      return status();
    },
    stop(reason = 'stopped') {
      clearTimer();
      state = reason === 'error' ? 'error' : 'stopped';
      stoppedAt = now().toISOString();
      return status();
    },
    async step() {
      if (stepping) throw new Error('agent_loop_step_in_progress');
      if (maxTicks !== null && ticksRun >= maxTicks) {
        loop.stop('max_ticks');
        throw new Error('agent_loop_max_ticks_reached');
      }
      stepping = true;
      currentStep = new Promise((resolve) => {
        resolveCurrentStep = resolve;
      });
      try {
        const summary = await engine.tick(undefined);
        ticksRun += 1;
        lastTick = summary;
        lastError = null;
        restoredCheckpoint = null;
        options.onTick?.(summary);
        if (ticksRun % checkpointEveryTicks === 0) captureCheckpoint();
        if (maxTicks !== null && ticksRun >= maxTicks && state === 'running')
          loop.stop('max_ticks');
        return summary;
      } catch (error) {
        state = 'error';
        lastError = (error as Error).message;
        clearTimer();
        throw error;
      } finally {
        stepping = false;
        resolveCurrentStep?.();
        resolveCurrentStep = null;
        currentStep = null;
      }
    },
    restoreCheckpoint(tick) {
      const checkpoint = findCheckpoint(tick);
      if (!checkpoint)
        throw new Error(
          tick === undefined ? 'agent_loop_checkpoint_missing' : 'agent_loop_checkpoint_not_found'
        );
      clearTimer();
      state = 'stopped';
      stoppedAt = now().toISOString();
      lastTick = null;
      lastError = null;
      engine.setState(checkpoint.world);
      restoredCheckpoint = checkpointSummary(checkpoint);
      return cloneCheckpoint(checkpoint);
    },
    clearCheckpoints() {
      checkpoints.length = 0;
      ticksRun = 0;
      lastTick = null;
      lastError = null;
      restoredCheckpoint = null;
      return status();
    },
    async waitForIdle() {
      await (currentStep ?? Promise.resolve());
    },
    status,
    checkpoints: () => checkpoints.map(cloneCheckpoint),
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
      restoredCheckpoint,
      checkpoints: checkpoints.map((checkpoint) => ({
        tick: checkpoint.tick,
        capturedAt: checkpoint.capturedAt,
        worldId: checkpoint.world.id,
      })),
    };
  }

  function findCheckpoint(tick: number | undefined): AgentLoopCheckpoint | undefined {
    if (tick === undefined) return checkpoints.at(-1);
    return checkpoints.find((checkpoint) => checkpoint.tick === tick);
  }

  function captureCheckpoint(): void {
    const checkpoint = {
      tick: engine.state.tick,
      capturedAt: now().toISOString(),
      world: cloneWorld(engine.state),
    };
    checkpoints.push(checkpoint);
    while (checkpoints.length > maxCheckpoints) checkpoints.shift();
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

function cloneCheckpoint(checkpoint: AgentLoopCheckpoint): AgentLoopCheckpoint {
  return {
    tick: checkpoint.tick,
    capturedAt: checkpoint.capturedAt,
    world: cloneWorld(checkpoint.world),
  };
}

function checkpointSummary(checkpoint: AgentLoopCheckpoint): AgentLoopStatus['restoredCheckpoint'] {
  return {
    tick: checkpoint.tick,
    capturedAt: checkpoint.capturedAt,
    worldId: checkpoint.world.id,
  };
}
