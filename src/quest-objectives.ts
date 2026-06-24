import { questItemTargetsFor } from './quest-targets.ts';
import type { Quest, World } from './types.ts';

/**
 * Completion gating: quests are prose, but questItemTargetsFor links them to
 * world items (and DEFEAT_VERBS to combat NPCs), so "complete_quest" can be
 * refused until the task was actually done. Computed on the fly — same
 * pattern as src/objectives.ts guidance.
 */

const DEFEAT_VERBS = /defeat|drive (?:off|out|away)|slay|hunt|banish|repel|vanquish/i;

export function questDefeatTargetId(world: World, quest: Quest): string | null {
  const text = `${quest.title} ${quest.description ?? ''}`;
  if (!DEFEAT_VERBS.test(text)) return null;
  const words = new Set(text.toLowerCase().split(/[^a-z]+/));
  for (const npc of world.npcs) {
    if (npc.id === quest.giverId) continue;
    const firstName = npc.name.toLowerCase().split(/[^a-z]+/)[0];
    if (firstName && firstName.length >= 3 && words.has(firstName)) return npc.id;
  }
  return null;
}

/** true/false when checkable, null when nothing in the world matches the quest */
export function questObjectiveMet(world: World, quest: Quest): boolean | null {
  const defeatId = questDefeatTargetId(world, quest);
  if (defeatId) {
    return Boolean(world.npcs.find((npc) => npc.id === defeatId)?.combat?.defeated);
  }
  const targets = questItemTargetsFor(world, quest);
  if (targets.length === 0) return null;
  const accepter = quest.acceptedBy ?? 'player';
  // any one target delivered (or in the accepter's hands) counts — multi-target
  // quests like bridge_whisper need only one piece of proof
  return targets.some(({ itemId, returnNpcId }) => {
    const item = (world.items ?? []).find((entry) => entry.id === itemId);
    return Boolean(item && (item.holderId === accepter || item.holderId === returnNpcId));
  });
}

/** rejection text fed back to the LLM/engine when completion is attempted early */
export function questObjectiveBlockText(world: World, quest: Quest): string {
  const defeatId = questDefeatTargetId(world, quest);
  if (defeatId) {
    const npc = world.npcs.find((entry) => entry.id === defeatId);
    if (npc) return `The task is not done yet: ${npc.name} still stands.`;
  }
  const target = questItemTargetsFor(world, quest)[0];
  if (target) {
    const item = (world.items ?? []).find((entry) => entry.id === target.itemId);
    if (item) return `The task is not done yet: ${item.name} has not been brought back.`;
  }
  return 'The task is not done yet.';
}
