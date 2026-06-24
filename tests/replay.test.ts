import { describe, expect, test } from 'vitest';

import { inspectReplay } from '../src/replay.ts';
import { createEngine } from '../src/simulation.ts';
import type { World } from '../src/types.ts';
import world from '../worlds/village.json' with { type: 'json' };

describe('replay inspector', () => {
  test('summarizes action, memory, and checksum frames', async () => {
    const engine = createEngine(world as unknown as World);
    await engine.tick({ type: 'talk', targetId: 'lena', text: 'Is the bridge safe?' });
    await engine.tick();

    const report = inspectReplay(engine.state);

    expect(report.frames).toHaveLength(2);
    expect(report.frames[0]?.applied).toBeGreaterThan(0);
    expect(report.frames[0]?.changedActors).toContain('player');
    expect(report.frames[0]?.memoryWrites.length).toBeGreaterThan(0);
    expect(report.checksumTrail).toHaveLength(2);
  });
});
