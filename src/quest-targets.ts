import type { Quest, World } from './types.ts';

export interface QuestItemTarget {
  itemId: string;
  returnNpcId: string;
  searchLocationId: string;
}

const QUEST_ITEM_TARGETS: Record<string, QuestItemTarget[]> = {
  return_shears: [{ itemId: 'shears', returnNpcId: 'mira', searchLocationId: 'forge' }],
  rekindle_forge: [{ itemId: 'bellows_leather', returnNpcId: 'tomas', searchLocationId: 'wood' }],
  bridge_whisper: [
    { itemId: 'blue_ember', returnNpcId: 'lena', searchLocationId: 'bridge' },
    { itemId: 'rumor_note', returnNpcId: 'lena', searchLocationId: 'bridge' },
  ],
};

export function questItemTargetsFor(world: World, quest: Quest): QuestItemTarget[] {
  const explicitTargets = QUEST_ITEM_TARGETS[quest.id];
  if (explicitTargets) return explicitTargets;
  return inferQuestItemTargets(world, quest);
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'near',
  'into',
  'that',
  'this',
  'them',
  'back',
  'need',
  'needs',
  'find',
  'before',
]);

function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((word) => word.length >= 4 && !STOP_WORDS.has(word))
  );
}

/** match quest prose to item names — works for any imported world and LLM-created quests */
function inferQuestItemTargets(world: World, quest: Quest): QuestItemTarget[] {
  if (!quest.giverId) return [];
  const questWords = significantWords(`${quest.title} ${quest.description ?? ''}`);
  const scored = world.items
    .map((item) => {
      const itemWords = significantWords(`${item.name} ${item.id.replace(/[_-]/g, ' ')}`);
      let score = 0;
      for (const word of itemWords) if (questWords.has(word)) score += 1;
      return { item, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.map(({ item }) => ({
    itemId: item.id,
    returnNpcId: quest.giverId!,
    searchLocationId:
      item.locationId ?? locationForNpc(world, quest.giverId!) ?? world.player.locationId,
  }));
}

function locationForNpc(world: World, npcId: string): string | undefined {
  return world.npcs.find((npc) => npc.id === npcId)?.locationId;
}
