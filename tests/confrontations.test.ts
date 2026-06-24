import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { runTick } from '../src/simulation.ts';
import type { World } from '../src/types.ts';

function loadWorld(): World {
  return JSON.parse(
    readFileSync(new URL('../worlds/village.json', import.meta.url), 'utf8')
  ) as World;
}

const scripted = { propose: () => [] };

describe('confrontations move bodies', () => {
  it('a leaked secret leads to a cross-town confrontation with witnesses', async () => {
    const world = loadWorld();
    const holder = world.npcs.find((npc) => npc.id === 'mira')!;
    holder.locationId = 'garden';
    holder.secrets = [
      {
        id: 's1',
        text: 'Mira hides the stolen moonmint shipment under the garden shed',
        risk: 80,
        knownBy: [],
      },
    ];

    const judge = world.npcs.find((npc) => npc.id === 'lena')!;
    judge.locationId = 'bridge';
    judge.traits = { ...(judge.traits ?? {}), values: ['justice', 'order'] };
    judge.memories.push({
      tick: world.tick,
      text: 'I heard Mira hides a stolen moonmint shipment under her garden shed.',
      meta: { importance: 6, visibility: 'shared' },
    });

    // witness placed at the holder's location ahead of time
    const witness = world.npcs.find((npc) => npc.id === 'tomas')!;
    witness.locationId = 'garden';

    // tick 1: revelation + ambition; following ticks: walk + confront
    let confronted = false;
    for (let index = 0; index < 8 && !confronted; index += 1) {
      const summary = await runTick(world, undefined, scripted);
      confronted = summary.actions.some(
        (entry) => entry.action.type === 'confront' && entry.text.includes('confronts')
      );
    }
    expect(confronted).toBe(true);
    expect(judge.locationId).toBe('garden'); // she physically went there
    expect((judge.ambitions ?? []).some((goal) => goal.status === 'satisfied')).toBe(true);
    expect(holder.memories.some((memory) => memory.text.includes('confronted me'))).toBe(true);
    expect(
      witness.memories.some(
        (memory) => memory.text.includes('watched') && memory.meta?.visibility === 'shared'
      )
    ).toBe(true);
    expect(holder.relationships?.['lena']).toBeLessThanOrEqual(-2); // started at +1, -3 from being cornered
  });

  it('abandons the grudge if the target is gone', async () => {
    const world = loadWorld();
    const judge = world.npcs.find((npc) => npc.id === 'lena')!;
    judge.ambitions = [
      ...(judge.ambitions ?? []),
      {
        id: 'lena_confront_ghost_5',
        title: 'Confront Ghost',
        kind: 'reveal',
        priority: 84,
        status: 'active',
      },
    ];
    await runTick(world, undefined, scripted);
    expect(judge.ambitions!.find((goal) => goal.id === 'lena_confront_ghost_5')!.status).toBe(
      'abandoned'
    );
  });
});
