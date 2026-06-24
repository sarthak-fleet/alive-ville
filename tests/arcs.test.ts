import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  awardXp,
  createArcForWorld,
  evaluateArc,
  levelForXp,
  markSparWon,
  XP_SPAR_WON,
} from '../src/arcs.ts';
import type { World } from '../src/types.ts';

function loadWorld(): World {
  return JSON.parse(
    readFileSync(new URL('../worlds/one-punch-man.json', import.meta.url), 'utf8')
  ) as World;
}

describe('arcs and progression', () => {
  it('levels follow a square-root curve', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(59)).toBe(1);
    expect(levelForXp(60)).toBe(2);
    expect(levelForXp(240)).toBe(3);
  });

  it('awards xp and reports level-ups', () => {
    const world = loadWorld();
    const first = awardXp(world, 50);
    expect(first.leveledUp).toBe(false);
    const second = awardXp(world, 20);
    expect(second.leveledUp).toBe(true);
    expect(world.player.growth?.level).toBe(2);
  });

  it('creates an arc with a mentor and the villain-plan actor', () => {
    const world = loadWorld();
    const arc = createArcForWorld(world)!;
    expect(arc).not.toBeNull();
    expect(arc.stage).toBe('training');
    expect(world.npcs.some((npc) => npc.id === arc.mentorId)).toBe(true);
    if (world.villainPlans?.length) expect(arc.villainId).toBe(world.villainPlans[0]!.actorId);
    // idempotent
    expect(createArcForWorld(world)).toBe(arc);
  });

  it('advances training -> trial on spar win, awarding xp', () => {
    const world = loadWorld();
    createArcForWorld(world);
    expect(evaluateArc(world)).toBeNull();
    const award = markSparWon(world)!;
    expect(award.xp).toBe(XP_SPAR_WON);
    const beat = evaluateArc(world)!;
    expect(beat.stage).toBe('trial');
    expect(beat.xpAwarded).toBeGreaterThan(0);
    expect(evaluateArc(world)).toBeNull();
  });

  it('advances trial -> confrontation after two player quest completions', () => {
    const world = loadWorld();
    createArcForWorld(world);
    markSparWon(world);
    evaluateArc(world);
    const quests = world.quests ?? [];
    quests.slice(0, 2).forEach((quest) => {
      quest.status = 'done';
      quest.acceptedBy = 'player';
    });
    const beat = evaluateArc(world)!;
    expect(beat.stage).toBe('confrontation');
  });

  it('completes when the villain falls', () => {
    const world = loadWorld();
    const arc = createArcForWorld(world)!;
    markSparWon(world);
    evaluateArc(world);
    (world.quests ?? []).slice(0, 2).forEach((quest) => {
      quest.status = 'done';
      quest.acceptedBy = 'player';
    });
    evaluateArc(world);
    const villain = world.npcs.find((npc) => npc.id === arc.villainId)!;
    villain.combat = { hp: 0, maxHp: 100, posture: 0, defeated: true };
    const beat = evaluateArc(world)!;
    expect(beat.stage).toBe('complete');
    expect(world.arc?.stage).toBe('complete');
    expect(world.player.growth?.xp ?? 0).toBeGreaterThanOrEqual(XP_SPAR_WON + 60 + 90 + 200);
  });

  it('spar can only be won once', () => {
    const world = loadWorld();
    createArcForWorld(world);
    expect(markSparWon(world)).not.toBeNull();
    expect(markSparWon(world)).toBeNull();
  });
});
