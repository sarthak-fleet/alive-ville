import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { applyAction, getQuest, validateAction } from '../src/simulation.ts';
import type { World } from '../src/types.ts';

const fixture = (): World =>
  JSON.parse(readFileSync(new URL('../worlds/village.json', import.meta.url), 'utf8')) as World;

describe('quests', () => {
  test('player accepts, completes — relationship +2 both ways', () => {
    const world = fixture();
    const accept = applyAction(world, {
      type: 'accept_quest',
      actorId: 'player',
      questId: 'return_shears',
    });
    expect(accept.applied).toBe(true);
    expect(getQuest(world, 'return_shears')!.status).toBe('active');

    world.items.find((item) => item.id === 'shears')!.holderId = 'player';
    const done = applyAction(world, {
      type: 'complete_quest',
      actorId: 'player',
      questId: 'return_shears',
    });
    expect(done.applied).toBe(true);
    expect(getQuest(world, 'return_shears')!.status).toBe('done');
    expect(world.npcs.find((n) => n.id === 'mira')!.relationships['player']).toBe(2);
  });

  test('fail_quest applies consequences', () => {
    const world = fixture();
    applyAction(world, { type: 'accept_quest', actorId: 'player', questId: 'return_shears' });
    const fail = applyAction(world, {
      type: 'fail_quest',
      actorId: 'player',
      questId: 'return_shears',
    });
    expect(fail.applied).toBe(true);
    expect(getQuest(world, 'return_shears')!.status).toBe('failed');
    expect(world.npcs.find((n) => n.id === 'mira')!.relationships['player']).toBe(-2);
  });

  test('only the accepter can complete', () => {
    const world = fixture();
    applyAction(world, { type: 'accept_quest', actorId: 'player', questId: 'return_shears' });
    const result = applyAction(world, {
      type: 'complete_quest',
      actorId: 'tomas',
      questId: 'return_shears',
    });
    expect(result.applied).toBe(false);
    if (!result.applied) expect(result.reason).toBe('Only the accepter can resolve.');
  });

  test('cannot accept twice', () => {
    const world = fixture();
    applyAction(world, { type: 'accept_quest', actorId: 'player', questId: 'return_shears' });
    const second = applyAction(world, {
      type: 'accept_quest',
      actorId: 'tomas',
      questId: 'return_shears',
    });
    expect(second.applied).toBe(false);
    if (!second.applied) expect(second.reason).toMatch(/active/);
  });

  test('validates unknown quest id', () => {
    const world = fixture();
    const v = validateAction(world, { type: 'accept_quest', actorId: 'player', questId: 'ghost' });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('Unknown quest.');
  });

  test('npc can offer a quest to player', () => {
    const world = fixture();
    world.quests![0]!.status = 'failed';
    const offer = applyAction(world, {
      type: 'offer_quest',
      actorId: 'mira',
      targetId: 'player',
      questId: 'return_shears',
    });
    expect(offer.applied).toBe(true);
    expect(getQuest(world, 'return_shears')!.status).toBe('open');
  });

  test('giving quest item completes accepted quest', () => {
    const world = fixture();
    applyAction(world, { type: 'accept_quest', actorId: 'player', questId: 'bridge_whisper' });
    const before = world.tensions?.find((tension) => tension.id === 'missing_metal')?.pressure ?? 0;
    applyAction(world, { type: 'move', actorId: 'player', locationId: 'bridge' });
    applyAction(world, { type: 'pickup', actorId: 'player', itemId: 'blue_ember' });
    applyAction(world, { type: 'move', actorId: 'player', locationId: 'square' });
    applyAction(world, { type: 'move', actorId: 'player', locationId: 'inn' });
    const give = applyAction(world, {
      type: 'give',
      actorId: 'player',
      itemId: 'blue_ember',
      targetId: 'lena',
    });

    expect(give.applied).toBe(true);
    expect(getQuest(world, 'bridge_whisper')!.status).toBe('done');
    expect(world.npcs.find((n) => n.id === 'lena')!.relationships['player']).toBe(2);
    const after = world.tensions?.find((tension) => tension.id === 'missing_metal');
    expect(after?.pressure).toBeLessThan(before);
    expect(after?.status).toBe('resolved');
  });
});
