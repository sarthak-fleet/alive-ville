import { recordChronicle } from './chronicle.ts';
import type { ArcStage, Npc, World, WorldArc } from './types.ts';

/**
 * Long-form arcs: every world gets a three-stage journey — train with a
 * mentor, prove yourself through quests, confront the villain. Stages award
 * XP and fire director-style beats. Progress derives from world state, so
 * saves/restores keep arcs consistent for free.
 */

export const XP_QUEST_COMPLETE = 40;
export const XP_FIGHT_WON = 30;
export const XP_SPAR_WON = 50;
const STAGE_XP: Record<Exclude<ArcStage, 'complete'>, number> = {
  training: 60,
  trial: 90,
  confrontation: 200,
};
const TRIAL_QUESTS_REQUIRED = 2;

export function levelForXp(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 60)) + 1;
}

export function xpForNextLevel(level: number): number {
  return level * level * 60;
}

export interface XpAward {
  xp: number;
  level: number;
  leveledUp: boolean;
}

export function awardXp(world: World, amount: number): XpAward {
  const growth = world.player.growth ?? { xp: 0, level: 1 };
  const xp = growth.xp + Math.max(0, amount);
  const level = levelForXp(xp);
  const leveledUp = level > growth.level;
  world.player.growth = { xp, level };
  return { xp, level, leveledUp };
}

function questsDoneByPlayer(world: World): number {
  return (world.quests ?? []).filter(
    (quest) => quest.status === 'done' && quest.acceptedBy === 'player'
  ).length;
}

function pickMentor(world: World, villainId: string | null): Npc | null {
  const candidates = world.npcs.filter(
    (npc) => npc.id !== villainId && npc.id !== world.player.characterId && !npc.combat?.defeated
  );
  if (candidates.length === 0) return null;
  const questTier = candidates.filter((npc) => npc.tier === 'quest');
  const pool = questTier.length > 0 ? questTier : candidates;
  return [...pool].sort((a, b) => (b.combat?.maxHp ?? 0) - (a.combat?.maxHp ?? 0))[0] ?? null;
}

export function createArcForWorld(world: World): WorldArc | null {
  if (world.arc) return world.arc;
  const villainId = world.villainPlans?.[0]?.actorId ?? null;
  const mentor = pickMentor(world, villainId);
  if (!mentor) return null;
  const villain = world.npcs.find((npc) => npc.id === villainId);
  const worldName = world.story?.title ?? world.name;
  const arc: WorldArc = {
    id: `arc_${world.id}`,
    title: `The Path Through ${worldName.split(':')[0]}`,
    stage: 'training',
    mentorId: mentor.id,
    villainId: villain ? villain.id : null,
    sparWon: false,
    questsDoneBaseline: questsDoneByPlayer(world),
    stageTexts: {
      training: `Train with ${mentor.name}: ask for a spar and hold your ground.`,
      trial: `Prove yourself: complete ${TRIAL_QUESTS_REQUIRED} quests for the people here.`,
      confrontation: villain
        ? `Face ${villain.name} before their plan is complete.`
        : 'Confront the danger stirring in this world.',
      complete: 'Your legend here is written. The world remembers.',
    },
  };
  world.arc = arc;
  return arc;
}

export interface ArcAdvance {
  stage: ArcStage;
  text: string;
  xpAwarded: number;
  leveledUp: boolean;
  /** actor to frame in the stage-transition beat */
  focusId: string;
}

/** Re-derive stage from world state; returns a beat when the stage advanced. */
export function evaluateArc(world: World): ArcAdvance | null {
  const arc = world.arc;
  if (!arc || arc.stage === 'complete') return null;

  if (arc.stage === 'training' && arc.sparWon) {
    return advance(world, arc, 'trial', arc.mentorId, `Training complete. ${arc.stageTexts.trial}`);
  }
  if (
    arc.stage === 'trial' &&
    questsDoneByPlayer(world) - arc.questsDoneBaseline >= TRIAL_QUESTS_REQUIRED
  ) {
    const focus = arc.villainId ?? arc.mentorId;
    return advance(
      world,
      arc,
      'confrontation',
      focus,
      `The trial is passed. ${arc.stageTexts.confrontation}`
    );
  }
  if (arc.stage === 'confrontation') {
    const villain = world.npcs.find((npc) => npc.id === arc.villainId);
    if (!arc.villainId || villain?.combat?.defeated) {
      return advance(
        world,
        arc,
        'complete',
        arc.villainId ?? arc.mentorId,
        arc.stageTexts.complete
      );
    }
  }
  return null;
}

function advance(
  world: World,
  arc: WorldArc,
  next: ArcStage,
  focusId: string,
  text: string
): ArcAdvance {
  const fromStage = arc.stage as Exclude<ArcStage, 'complete'>;
  arc.stage = next;
  const award = awardXp(world, STAGE_XP[fromStage] ?? 0);
  // arc advances are player-caused: the player drove the prerequisites
  recordChronicle(world, { kind: 'arc', text, actorId: focusId, playerCaused: true });
  return {
    stage: next,
    text,
    xpAwarded: STAGE_XP[fromStage] ?? 0,
    leveledUp: award.leveledUp,
    focusId,
  };
}

/** the player embodied an NPC: arc roles must not point at the player themself */
export function reassignArcRoles(world: World): void {
  const arc = world.arc;
  if (!arc) return;
  if (arc.mentorId === world.player.characterId) {
    const mentor = pickMentor(world, arc.villainId);
    if (mentor) {
      arc.mentorId = mentor.id;
      arc.stageTexts.training = `Train with ${mentor.name}: ask for a spar and hold your ground.`;
    }
  }
  if (arc.villainId && arc.villainId === world.player.characterId) {
    // playing the villain: the confrontation becomes facing the mentor's judgment
    arc.villainId = null;
    arc.stageTexts.confrontation = 'Confront what you have become — or change the ending.';
  }
}

export function markSparWon(world: World): XpAward | null {
  if (!world.arc || world.arc.sparWon) return null;
  world.arc.sparWon = true;
  return awardXp(world, XP_SPAR_WON);
}
