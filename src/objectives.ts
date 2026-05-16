import type { Item, Npc, Quest, QuestStatus, World } from "./types.ts";

export type ObjectiveTargetType = "location" | "item" | "npc";

export interface Objective {
  questId: string;
  questTitle: string;
  status: QuestStatus;
  text: string;
  locationId: string;
  targetType: ObjectiveTargetType;
  targetId: string;
}

const QUEST_ITEM_TARGETS: Record<string, Array<{ itemId: string; returnNpcId: string; searchLocationId: string }>> = {
  return_shears: [{ itemId: "shears", returnNpcId: "mira", searchLocationId: "forge" }],
  rekindle_forge: [{ itemId: "bellows_leather", returnNpcId: "tomas", searchLocationId: "wood" }],
  bridge_whisper: [
    { itemId: "blue_ember", returnNpcId: "lena", searchLocationId: "bridge" },
    { itemId: "rumor_note", returnNpcId: "lena", searchLocationId: "bridge" },
  ],
};

export function activeObjectives(world: World): Objective[] {
  const quests = world.quests ?? [];
  return [
    ...quests.filter((quest) => quest.status === "active").flatMap((quest) => objectiveForQuest(world, quest) ?? []),
    ...quests.filter((quest) => (quest.status ?? "open") === "open").flatMap((quest) => objectiveForQuest(world, quest) ?? []),
  ];
}

export function objectiveForQuest(world: World, quest: Quest): Objective | null {
  const status = quest.status ?? "open";
  if (status === "done" || status === "failed") return null;

  if (status === "open") {
    const giver = quest.giverId ? findNpc(world, quest.giverId) : undefined;
    if (!giver) return null;
    return {
      questId: quest.id,
      questTitle: quest.title,
      status,
      text: `Talk to ${giver.name} to start this task.`,
      locationId: giver.locationId,
      targetType: "npc",
      targetId: giver.id,
    };
  }

  const targets = QUEST_ITEM_TARGETS[quest.id] ?? [];
  const heldTarget = targets.find(({ itemId }) => findItem(world, itemId)?.holderId === "player");
  if (heldTarget) {
    const npc = findNpc(world, heldTarget.returnNpcId);
    const item = findItem(world, heldTarget.itemId);
    if (npc && item) {
      return {
        questId: quest.id,
        questTitle: quest.title,
        status,
        text: `Bring ${item.name} to ${npc.name}.`,
        locationId: npc.locationId,
        targetType: "npc",
        targetId: npc.id,
      };
    }
  }

  const visibleItemTarget = targets.find(({ itemId }) => Boolean(findItem(world, itemId)?.locationId));
  if (visibleItemTarget) {
    const item = findItem(world, visibleItemTarget.itemId);
    if (item?.locationId) {
      return {
        questId: quest.id,
        questTitle: quest.title,
        status,
        text: `Find ${item.name}.`,
        locationId: item.locationId,
        targetType: "item",
        targetId: item.id,
      };
    }
  }

  const searchTarget = targets[0];
  if (searchTarget) {
    return {
      questId: quest.id,
      questTitle: quest.title,
      status,
      text: "Search the clue location.",
      locationId: searchTarget.searchLocationId,
      targetType: "location",
      targetId: searchTarget.searchLocationId,
    };
  }

  const fallbackLocation = quest.giverId ? findNpc(world, quest.giverId)?.locationId : world.player.locationId;
  if (!fallbackLocation) return null;
  return {
    questId: quest.id,
    questTitle: quest.title,
    status,
    text: quest.description ?? "Advance this task.",
    locationId: fallbackLocation,
    targetType: "location",
    targetId: fallbackLocation,
  };
}

function findItem(world: World, id: string): Item | undefined {
  return world.items.find((item) => item.id === id);
}

function findNpc(world: World, id: string): Npc | undefined {
  return world.npcs.find((npc) => npc.id === id);
}
