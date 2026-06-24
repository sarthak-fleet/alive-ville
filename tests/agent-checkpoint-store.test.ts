import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import {
  readAgentLoopCheckpoints,
  upsertAgentLoopCheckpoint,
  writeAgentLoopCheckpoints,
} from '../src/agent-checkpoint-store.ts';
import type { AgentLoopCheckpoint } from '../src/agent-loop.ts';
import type { World } from '../src/types.ts';

const tempDirs: string[] = [];

describe('agent checkpoint store', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  test('round-trips persisted checkpoints without exposing mutable file state', () => {
    const path = tempFile();
    const checkpoint = checkpointAt(5);

    writeAgentLoopCheckpoints(path, [checkpoint]);
    checkpoint.world.tick = 99;
    const persisted = readAgentLoopCheckpoints(path);
    persisted[0]!.world.tick = 88;

    expect(readAgentLoopCheckpoints(path)[0]?.world.tick).toBe(5);
  });

  test('upserts checkpoint ticks and caps persisted retention', () => {
    const path = tempFile();

    upsertAgentLoopCheckpoint(path, checkpointAt(1), 2);
    upsertAgentLoopCheckpoint(path, checkpointAt(2), 2);
    upsertAgentLoopCheckpoint(path, checkpointAt(2, 'changed'), 2);
    upsertAgentLoopCheckpoint(path, checkpointAt(3), 2);

    expect(
      readAgentLoopCheckpoints(path).map((checkpoint) => [checkpoint.tick, checkpoint.world.name])
    ).toEqual([
      [2, 'changed'],
      [3, 'world 3'],
    ]);
  });

  test('drops malformed checkpoint files instead of breaking startup', () => {
    const path = tempFile();
    writeFileSync(path, JSON.stringify({ version: 1, checkpoints: [{ tick: 'bad' }] }), 'utf8');

    expect(readAgentLoopCheckpoints(path)).toEqual([]);
  });
});

function tempFile(): URL {
  const dir = mkdtempSync(join(tmpdir(), 'ai-game-agent-checkpoints-'));
  tempDirs.push(dir);
  return new URL(`file://${join(dir, 'checkpoints.json')}`);
}

function checkpointAt(tick: number, name = `world ${tick}`): AgentLoopCheckpoint {
  return {
    tick,
    capturedAt: '2026-05-21T00:00:00.000Z',
    world: {
      id: 'ashment',
      name,
      tick,
      player: { locationId: 'square' },
      clock: { hoursPerTick: 1, hour: 8, day: 1 },
      locations: [{ id: 'square', name: 'Square', x: 0, y: 0, w: 1, h: 1 }],
      exits: [],
      npcs: [],
      items: [],
      eventLog: [],
    } satisfies World,
  };
}
