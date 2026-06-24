import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { ambientBarkForNpc, ambientBarksForLocation } from '../src/ambient.ts';
import { applyAction } from '../src/simulation.ts';
import type { World } from '../src/types.ts';

const fixture = (): World =>
  JSON.parse(readFileSync(new URL('../worlds/village.json', import.meta.url), 'utf8')) as World;

describe('ambient NPC barks', () => {
  test('quest givers produce relevant open quest barks', () => {
    const world = fixture();
    const mira = world.npcs.find((npc) => npc.id === 'mira')!;

    expect(ambientBarkForNpc(world, mira)?.text).toMatch(/shears/i);
  });

  test('completed quests change the ambient line', () => {
    const world = fixture();
    applyAction(world, { type: 'accept_quest', actorId: 'player', questId: 'return_shears' });
    applyAction(world, { type: 'move', actorId: 'player', locationId: 'forge' });
    applyAction(world, { type: 'pickup', actorId: 'player', itemId: 'shears' });
    applyAction(world, { type: 'move', actorId: 'player', locationId: 'square' });
    applyAction(world, { type: 'move', actorId: 'player', locationId: 'garden' });
    applyAction(world, { type: 'give', actorId: 'player', itemId: 'shears', targetId: 'mira' });

    const mira = world.npcs.find((npc) => npc.id === 'mira')!;
    expect(ambientBarkForNpc(world, mira)?.text).toMatch(/moonmint/i);
  });

  test('location helper returns only NPCs in that location', () => {
    const world = fixture();
    const barks = ambientBarksForLocation(world, 'square');

    expect(barks.map((bark) => bark.actorId).sort()).toEqual(['orrin', 'pax']);
  });
});
