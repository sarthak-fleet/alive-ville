import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { applyAction, getQuest, itemsHeldBy } from '../src/simulation.ts';
import type { World } from '../src/types.ts';

const fixture = (): World =>
  JSON.parse(readFileSync(new URL('../worlds/village.json', import.meta.url), 'utf8')) as World;

describe('first playable village loop', () => {
  test("player can accept Mira's task, recover shears from the forge, and complete it", () => {
    const world = fixture();

    expect(
      applyAction(world, { type: 'accept_quest', actorId: 'player', questId: 'return_shears' })
        .applied
    ).toBe(true);
    expect(
      applyAction(world, { type: 'move', actorId: 'player', locationId: 'forge' }).applied
    ).toBe(true);
    expect(
      applyAction(world, { type: 'pickup', actorId: 'player', itemId: 'shears' }).applied
    ).toBe(true);
    expect(itemsHeldBy(world, 'player').map((item) => item.id)).toContain('shears');

    expect(
      applyAction(world, { type: 'move', actorId: 'player', locationId: 'square' }).applied
    ).toBe(true);
    expect(
      applyAction(world, { type: 'move', actorId: 'player', locationId: 'garden' }).applied
    ).toBe(true);
    const give = applyAction(world, {
      type: 'give',
      actorId: 'player',
      itemId: 'shears',
      targetId: 'mira',
    });

    expect(give.applied).toBe(true);
    if (give.applied) expect(give.text).toMatch(/complete/);
    expect(getQuest(world, 'return_shears')?.status).toBe('done');
    expect(world.npcs.find((npc) => npc.id === 'mira')?.relationships['player']).toBe(2);
  });
});
