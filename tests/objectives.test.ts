import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { activeObjectives, objectiveForQuest } from '../src/objectives.ts';
import { applyAction, getQuest } from '../src/simulation.ts';
import type { World } from '../src/types.ts';

const fixture = (): World =>
  JSON.parse(readFileSync(new URL('../worlds/village.json', import.meta.url), 'utf8')) as World;

describe('quest objectives', () => {
  test('open quests point to their giver', () => {
    const world = fixture();
    const objective = objectiveForQuest(world, getQuest(world, 'return_shears')!);

    expect(objective?.targetType).toBe('npc');
    expect(objective?.targetId).toBe('mira');
    expect(objective?.locationId).toBe('garden');
  });

  test('active fetch quest points to the needed item first', () => {
    const world = fixture();
    applyAction(world, { type: 'accept_quest', actorId: 'player', questId: 'return_shears' });

    const objective = objectiveForQuest(world, getQuest(world, 'return_shears')!);
    expect(objective?.targetType).toBe('item');
    expect(objective?.targetId).toBe('shears');
    expect(objective?.locationId).toBe('forge');
  });

  test('held quest item points back to the return NPC', () => {
    const world = fixture();
    applyAction(world, { type: 'accept_quest', actorId: 'player', questId: 'return_shears' });
    applyAction(world, { type: 'move', actorId: 'player', locationId: 'forge' });
    applyAction(world, { type: 'pickup', actorId: 'player', itemId: 'shears' });

    const objective = objectiveForQuest(world, getQuest(world, 'return_shears')!);
    expect(objective?.targetType).toBe('npc');
    expect(objective?.targetId).toBe('mira');
    expect(objective?.locationId).toBe('garden');
    expect(objective?.text).toMatch(/Bring Pruning shears to Mira/);
  });

  test('active objectives sort active tasks before open tasks', () => {
    const world = fixture();
    applyAction(world, { type: 'accept_quest', actorId: 'player', questId: 'bridge_whisper' });

    const objectives = activeObjectives(world);
    expect(objectives[0]?.questId).toBe('bridge_whisper');
    expect(objectives.some((objective) => objective.questId === 'return_shears')).toBe(true);
  });
});
