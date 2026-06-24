import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  questDefeatTargetId,
  questObjectiveBlockText,
  questObjectiveMet,
} from '../src/quest-objectives.ts';
import { questItemTargetsFor } from '../src/quest-targets.ts';
import { validateAction } from '../src/simulation.ts';
import type { Quest, World } from '../src/types.ts';

function loadWorld(): World {
  return JSON.parse(
    readFileSync(new URL('../worlds/village.json', import.meta.url), 'utf8')
  ) as World;
}

describe('quest objectives', () => {
  it('infers item targets for unknown quests by matching prose to item names', () => {
    const world = loadWorld();
    const dyn: Quest = {
      id: 'dyn_lantern',
      title: 'Recover the brass lantern',
      description: 'Someone left the lantern at the inn.',
      giverId: 'mira',
      status: 'active',
      acceptedBy: 'player',
    };
    const targets = questItemTargetsFor(world, dyn);
    expect(targets[0]?.itemId).toBe('lantern');
    expect(targets[0]?.returnNpcId).toBe('mira');
  });

  it('fetch quests are unmet until the item is in the right hands', () => {
    const world = loadWorld();
    const quest = world.quests!.find((entry) => entry.id === 'return_shears')!;
    quest.status = 'active';
    quest.acceptedBy = 'player';
    expect(questObjectiveMet(world, quest)).toBe(false);
    world.items.find((item) => item.id === 'shears')!.holderId = 'player';
    expect(questObjectiveMet(world, quest)).toBe(true);
  });

  it('delivering the item to the giver also counts', () => {
    const world = loadWorld();
    const quest = world.quests!.find((entry) => entry.id === 'return_shears')!;
    quest.status = 'active';
    quest.acceptedBy = 'player';
    world.items.find((item) => item.id === 'shears')!.holderId = 'mira';
    expect(questObjectiveMet(world, quest)).toBe(true);
  });

  it('multi-target quests need only one piece of proof', () => {
    const world = loadWorld();
    const quest = world.quests!.find((entry) => entry.id === 'bridge_whisper')!;
    quest.status = 'active';
    quest.acceptedBy = 'player';
    expect(questObjectiveMet(world, quest)).toBe(false);
    world.items.find((item) => item.id === 'rumor_note')!.holderId = 'player';
    expect(questObjectiveMet(world, quest)).toBe(true);
  });

  it('the engine refuses complete_quest before the task is done, with a human reason', () => {
    const world = loadWorld();
    const quest = world.quests!.find((entry) => entry.id === 'return_shears')!;
    quest.status = 'active';
    quest.acceptedBy = 'player';
    const verdict = validateAction(world, {
      type: 'complete_quest',
      actorId: 'player',
      questId: 'return_shears',
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain('Pruning shears');
    world.items.find((item) => item.id === 'shears')!.holderId = 'player';
    expect(
      validateAction(world, { type: 'complete_quest', actorId: 'player', questId: 'return_shears' })
        .ok
    ).toBe(true);
  });

  it("defeat quests track the named foe's combat state", () => {
    const world = loadWorld();
    world.npcs.push({
      id: 'karn',
      name: 'Karn',
      locationId: 'bridge',
      memories: [],
      combat: { hp: 60, maxHp: 60, posture: 0, defeated: false },
    } as never);
    const quest: Quest = {
      id: 'dyn_karn',
      title: 'Drive off Karn',
      description: 'Karn lurks by the bridge; drive him off before dusk.',
      giverId: 'lena',
      status: 'active',
      acceptedBy: 'player',
    };
    expect(questDefeatTargetId(world, quest)).toBe('karn');
    expect(questObjectiveMet(world, quest)).toBe(false);
    expect(questObjectiveBlockText(world, quest)).toContain('Karn');
    world.npcs.find((npc) => npc.id === 'karn')!.combat!.defeated = true;
    expect(questObjectiveMet(world, quest)).toBe(true);
  });

  it('prose-only quests stay uncheckable rather than blocked', () => {
    const world = loadWorld();
    const quest: Quest = {
      id: 'dyn_vibes',
      title: 'Lift the village spirits',
      giverId: 'orrin',
      status: 'active',
      acceptedBy: 'player',
    };
    expect(questObjectiveMet(world, quest)).toBe(null);
    const verdict = validateAction(world, {
      type: 'complete_quest',
      actorId: 'player',
      questId: 'dyn_vibes',
    });
    // not in world.quests, so the engine rejects for a different reason — add it
    world.quests!.push(quest);
    const verdict2 = validateAction(world, {
      type: 'complete_quest',
      actorId: 'player',
      questId: 'dyn_vibes',
    });
    expect(verdict.ok).toBe(false);
    expect(verdict2.ok).toBe(true);
  });
});
