import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { trimWorldGrowth } from '../src/simulation.ts';
import type { World } from '../src/types.ts';

function loadWorld(): World {
  return JSON.parse(
    readFileSync(new URL('../worlds/village.json', import.meta.url), 'utf8')
  ) as World;
}

describe('world growth caps', () => {
  it('caps the event log', () => {
    const world = loadWorld();
    world.eventLog = Array.from({ length: 500 }, (_, index) => ({
      tick: index,
      actions: [],
      rejected: [],
      checksum: '',
      clock: world.clock,
    })) as never;
    trimWorldGrowth(world);
    expect(world.eventLog.length).toBe(60);
    expect((world.eventLog[0] as { tick: number }).tick).toBe(440);
  });

  it('caps NPC memories, preserving recent + important older ones', () => {
    const world = loadWorld();
    const npc = world.npcs[0]!;
    npc.memories = Array.from({ length: 300 }, (_, index) => ({
      tick: index,
      text: `memory ${index}`,
      ...(index % 50 === 0 ? { meta: { importance: 3 as const } } : {}),
    })) as never;
    trimWorldGrowth(world);
    expect(npc.memories.length).toBeLessThanOrEqual(120);
    // most recent survive
    expect(npc.memories.at(-1)?.text).toBe('memory 299');
    // an important early memory survives
    expect(npc.memories.some((memory) => memory.text === 'memory 200')).toBe(true);
  });
});
