import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { applyAction, getQuest, itemsHeldBy } from '../src/simulation.ts';
import { createArcForWorld } from '../src/arcs.ts';
import type { World } from '../src/types.ts';

const fixture = (): World =>
  JSON.parse(readFileSync(new URL('../worlds/rival-duel.json', import.meta.url), 'utf8')) as World;

describe('Rival Duel vertical slice', () => {
  test('world loads with the expected structure', () => {
    const world = fixture();
    expect(world.id).toBe('rival_duel');
    expect(world.npcs.map((n) => n.id).sort()).toEqual(['boss', 'kael', 'marta']);
    expect(world.quests?.map((q) => q.id).sort()).toEqual([
      'clear_shaft',
      'expose_kael',
      'showdown',
    ]);
    expect(world.villainPlans?.[0]?.actorId).toBe('kael');
    expect(world.directorState?.pressure).toBe(30);
  });

  test('rival NPC has combat stats for the showdown', () => {
    const world = fixture();
    const kael = world.npcs.find((n) => n.id === 'kael');
    expect(kael).toBeDefined();
    expect(kael?.combat).toBeDefined();
    expect(kael?.combat?.maxHp).toBe(100);
    expect(kael?.combat?.moves?.length).toBeGreaterThanOrEqual(2);
  });

  test('arc auto-creates with Kael as villain and a mentor', () => {
    const world = fixture();
    const arc = createArcForWorld(world);
    expect(arc).not.toBeNull();
    expect(arc?.villainId).toBe('kael');
    expect(arc?.mentorId).toBeDefined();
    expect(arc?.stage).toBe('training');
  });

  test('player can help Marta clear the shaft (quest loop)', () => {
    const world = fixture();

    // Accept the quest
    expect(
      applyAction(world, { type: 'accept_quest', actorId: 'player', questId: 'clear_shaft' })
        .applied
    ).toBe(true);

    // Move to the saloon to get the tools
    expect(
      applyAction(world, { type: 'move', actorId: 'player', locationId: 'saloon' }).applied
    ).toBe(true);
    expect(
      applyAction(world, { type: 'pickup', actorId: 'player', itemId: 'marta_tools' }).applied
    ).toBe(true);
    expect(itemsHeldBy(world, 'player').map((item) => item.id)).toContain('marta_tools');

    // Move to the mine shaft
    expect(
      applyAction(world, { type: 'move', actorId: 'player', locationId: 'mine_shaft' }).applied
    ).toBe(true);

    // Give tools to Marta and complete the quest
    expect(
      applyAction(world, {
        type: 'give',
        actorId: 'player',
        itemId: 'marta_tools',
        targetId: 'marta',
      }).applied
    ).toBe(true);

    const quest = getQuest(world, 'clear_shaft');
    expect(quest?.status).toBe('done');
  });

  test('player can expose Kael (ore theft quest loop)', () => {
    const world = fixture();

    expect(
      applyAction(world, { type: 'accept_quest', actorId: 'player', questId: 'expose_kael' })
        .applied
    ).toBe(true);

    // Pick up the stolen ore from the saloon
    expect(
      applyAction(world, { type: 'move', actorId: 'player', locationId: 'saloon' }).applied
    ).toBe(true);
    expect(
      applyAction(world, { type: 'pickup', actorId: 'player', itemId: 'stolen_ore' }).applied
    ).toBe(true);

    // Bring it to the claim boss
    expect(
      applyAction(world, { type: 'move', actorId: 'player', locationId: 'boss_office' }).applied
    ).toBe(true);
    expect(
      applyAction(world, {
        type: 'give',
        actorId: 'player',
        itemId: 'stolen_ore',
        targetId: 'boss',
      }).applied
    ).toBe(true);

    const quest = getQuest(world, 'expose_kael');
    expect(quest?.status).toBe('done');
  });

  test('director pressure starts below the lose threshold', () => {
    const world = fixture();
    expect(world.directorState?.pressure).toBeLessThan(100);
    expect(world.directorState?.pressure).toBeGreaterThanOrEqual(20);
  });

  test('all locations are reachable via exits', () => {
    const world = fixture();
    const locationIds = new Set(world.locations.map((l) => l.id));
    const reachable = new Set<string>();
    for (const exit of world.exits) {
      reachable.add(exit.from);
      reachable.add(exit.to);
    }
    // Every location should appear in at least one exit
    for (const id of locationIds) {
      expect(reachable.has(id)).toBe(true);
    }
  });
});
