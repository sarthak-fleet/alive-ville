import type { Quest, World } from "./types.ts";

export interface QuestItemTarget {
  itemId: string;
  returnNpcId: string;
  searchLocationId: string;
}

const QUEST_ITEM_TARGETS: Record<string, QuestItemTarget[]> = {
  return_shears: [{ itemId: "shears", returnNpcId: "mira", searchLocationId: "forge" }],
  rekindle_forge: [{ itemId: "bellows_leather", returnNpcId: "tomas", searchLocationId: "wood" }],
  bridge_whisper: [
    { itemId: "blue_ember", returnNpcId: "lena", searchLocationId: "bridge" },
    { itemId: "rumor_note", returnNpcId: "lena", searchLocationId: "bridge" },
  ],
};

export function questItemTargetsFor(world: World, quest: Quest): QuestItemTarget[] {
  const explicitTargets = QUEST_ITEM_TARGETS[quest.id];
  if (explicitTargets) return explicitTargets;
  return inferQuestItemTargets(world, quest);
}

function inferQuestItemTargets(world: World, quest: Quest): QuestItemTarget[] {
  if (!quest.giverId) return [];
  const questIndex = Math.max(0, (world.quests ?? []).findIndex((candidate) => candidate.id === quest.id));
  const primaryItem = world.items[questIndex];
  const proofItem = questIndex === 2 ? world.items[3] : undefined;
  return [primaryItem, proofItem]
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((item) => ({
      itemId: item.id,
      returnNpcId: quest.giverId!,
      searchLocationId: item.locationId ?? locationForNpc(world, quest.giverId!) ?? world.player.locationId,
    }));
}

function locationForNpc(world: World, npcId: string): string | undefined {
  return world.npcs.find((npc) => npc.id === npcId)?.locationId;
}
