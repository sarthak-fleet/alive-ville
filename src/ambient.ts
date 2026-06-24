import type { Npc, World } from './types.ts';
import { timeOfDay } from './types.ts';

export interface AmbientBark {
  actorId: string;
  text: string;
}

export function ambientBarkForNpc(world: World, npc: Npc): AmbientBark | null {
  const activeQuest = (world.quests ?? []).find(
    (quest) => quest.giverId === npc.id && quest.status === 'active'
  );
  const openQuest = (world.quests ?? []).find(
    (quest) => quest.giverId === npc.id && (quest.status ?? 'open') === 'open'
  );
  const doneQuest = (world.quests ?? []).find(
    (quest) => quest.giverId === npc.id && quest.status === 'done'
  );
  const tod = timeOfDay(world.clock);

  const line =
    questLine(npc.id, activeQuest?.id, 'active') ??
    questLine(npc.id, openQuest?.id, 'open') ??
    questLine(npc.id, doneQuest?.id, 'done') ??
    moodLine(npc, tod) ??
    memoryLine(npc);

  return line ? { actorId: npc.id, text: line } : null;
}

export function ambientBarksForLocation(
  world: World,
  locationId: string,
  limit = 3
): AmbientBark[] {
  return world.npcs
    .filter((npc) => npc.locationId === locationId)
    .map((npc) => ambientBarkForNpc(world, npc))
    .filter((bark): bark is AmbientBark => Boolean(bark))
    .slice(0, limit);
}

function questLine(
  npcId: string,
  questId: string | undefined,
  state: 'open' | 'active' | 'done'
): string | null {
  if (!questId) return null;
  if (state === 'done') {
    if (npcId === 'mira') return 'The moonmint is holding. That bought us time.';
    if (npcId === 'tomas') return 'Hear that? The forge is breathing again.';
    if (npcId === 'lena') return 'Proof changes rumors into decisions.';
  }
  if (questId === 'return_shears' && npcId === 'mira')
    return state === 'open'
      ? 'Those shears better not be in the mud.'
      : 'Forge first, then back here.';
  if (questId === 'rekindle_forge' && npcId === 'tomas')
    return state === 'open'
      ? 'Bellows leather. Dry. That is the difference.'
      : 'Bring the leather before the flame gives up.';
  if (questId === 'bridge_whisper' && npcId === 'lena')
    return state === 'open'
      ? 'No one crosses the bridge alone tonight.'
      : 'A note or an ember. Something real.';
  return null;
}

function moodLine(npc: Npc, tod: ReturnType<typeof timeOfDay>): string | null {
  if (tod === 'dusk' || tod === 'night') {
    if ((npc.mood?.stress ?? 0) > 65) return 'Night makes every sound sharper.';
    if ((npc.mood?.suspicion ?? 0) > 60) return 'Someone is not telling the whole truth.';
  }
  if ((npc.mood?.confidence ?? 0) > 70) return 'Patterns show themselves if you stop rushing.';
  if ((npc.mood?.stress ?? 0) > 70) return 'Not now. I am trying to keep this together.';
  return null;
}

function memoryLine(npc: Npc): string | null {
  const memory = npc.memories.at(-1)?.text;
  if (!memory) return null;
  if (/bridge/i.test(memory)) return 'It always comes back to that bridge.';
  if (/forge/i.test(memory)) return 'The forge going quiet changed everything.';
  if (/metal|shiny/i.test(memory)) return 'Bright metal keeps turning up where it should not.';
  return null;
}
