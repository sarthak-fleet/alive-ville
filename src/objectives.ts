import { questItemTargetsFor } from './quest-targets.ts';
import {
  locationById,
  npcById,
  storyConfrontationTargetId,
  storyPhaseLocations,
  storyWitnessNpc,
} from './story-context.ts';
import { syncStoryProgress } from './story-progress.ts';
import type { Item, Npc, Quest, QuestStatus, World } from './types.ts';

type ObjectiveTargetType = 'location' | 'item' | 'npc';

export interface Objective {
  questId: string;
  questTitle: string;
  status: QuestStatus;
  text: string;
  locationId: string;
  targetType: ObjectiveTargetType;
  targetId: string;
  actionLabel?: string;
  storyAction?: 'confront_shadow' | 'fight_challenger';
  storyTargetId?: string;
}

export function activeObjectives(world: World): Objective[] {
  const quests = world.quests ?? [];
  const questObjectives = [
    ...quests
      .filter((quest) => quest.status === 'active')
      .flatMap((quest) => objectiveForQuest(world, quest) ?? []),
    ...quests
      .filter((quest) => (quest.status ?? 'open') === 'open')
      .flatMap((quest) => objectiveForQuest(world, quest) ?? []),
  ];
  if (questObjectives.length > 0) return questObjectives;
  const storyObjective = objectiveForStoryProgress(world);
  return storyObjective ? [storyObjective] : [];
}

function objectiveForStoryProgress(world: World): Objective | null {
  const progress = syncStoryProgress(world);
  const labels = storyLabelsFor(world);
  const { hubId, reportId } = storyPhaseLocations(world);
  if (progress.phase === 'nightfall_warning') {
    const targetLocation = world.player.locationId === reportId ? hubId : reportId;
    return {
      questId: 'story:nightfall_warning',
      questTitle: labels.warningTitle,
      status: 'active',
      text: targetLocation === 'square' ? labels.warningHereText : labels.warningTravelText,
      locationId: targetLocation,
      targetType: 'location',
      targetId: targetLocation,
      actionLabel: 'Go',
    };
  }
  if (progress.phase === 'shadow_confrontation') {
    const targetNpc = npcById(world, labels.confrontTargetId);
    const targetLocation =
      targetNpc?.locationId ?? (world.player.locationId === reportId ? reportId : hubId);
    return {
      questId: 'story:shadow_confrontation',
      questTitle: labels.confrontTitle,
      status: 'active',
      text: labels.confrontText,
      locationId: targetLocation,
      targetType: 'location',
      targetId: targetLocation,
      actionLabel: labels.confrontActionLabel,
      storyAction: labels.confrontAction,
      storyTargetId: labels.confrontTargetId,
    };
  }
  if (progress.phase === 'dawn_after_tasks') {
    return {
      questId: 'story:dawn_after_tasks',
      questTitle: labels.doneTitle,
      status: 'done',
      text: labels.doneText,
      locationId: world.player.locationId,
      targetType: 'location',
      targetId: world.player.locationId,
    };
  }
  return null;
}

function storyLabelsFor(world: World) {
  if (world.id === 'opm_z_city') {
    return {
      warningTitle: 'Report to Hero Association before the next monster alert',
      warningTravelText: 'Reach the Hero Association kiosk before the overpass alarm spreads.',
      warningHereText: 'Step into Z-City Plaza and watch for the overpass challenger.',
      confrontTitle: 'Confront the Overpass Challenger',
      confrontText: 'Fight the challenger with Mumen Rider as witness.',
      confrontActionLabel: 'Fight',
      confrontAction: 'fight_challenger' as const,
      confrontTargetId: 'pax',
      doneTitle: 'Z-City alert cleared',
      doneText:
        'The first Z-City patrol loop is resolved. Keep exploring, talking, saving, or replaying scenes.',
    };
  }
  if (world.id !== 'ashment') {
    const { hubId, reportId } = storyPhaseLocations(world);
    const hub = locationById(world, hubId);
    const report = locationById(world, reportId) ?? hub;
    const targetId = storyConfrontationTargetId(world);
    const target = npcById(world, targetId);
    const witness = storyWitnessNpc(world) ?? target;
    const tensionTitle = world.tensions?.[0]?.title.toLowerCase() ?? 'the core conflict';
    return {
      warningTitle: `Report to ${report?.name ?? 'the report point'} before pressure peaks`,
      warningTravelText: `Reach ${report?.name ?? 'the report point'} before ${tensionTitle} escalates.`,
      warningHereText: `Return to ${hub?.name ?? 'the hub'} and watch for ${target?.name ?? 'the antagonist'}'s next move.`,
      confrontTitle: `Confront ${target?.name ?? 'the antagonist'}`,
      confrontText: `Call ${target?.name ?? 'the antagonist'} into the open with ${witness?.name ?? 'a witness'} watching.`,
      confrontActionLabel: 'Confront',
      confrontAction: 'confront_shadow' as const,
      confrontTargetId: targetId,
      doneTitle: `${world.name} route stabilized`,
      doneText:
        "The imported world's first playable loop is resolved. Keep exploring, talking, saving, or replaying scenes.",
    };
  }
  return {
    warningTitle: 'Go to Lantern Inn before nightfall',
    warningTravelText: 'Reach the Lantern Inn before the river fog thickens.',
    warningHereText: 'Step into the plaza outside the inn and watch for the blue lantern shadow.',
    confrontTitle: 'Confront the Lantern Shadow',
    confrontText: 'Call the shadow into the open with Lena as witness.',
    confrontActionLabel: 'Confront',
    confrontAction: 'confront_shadow' as const,
    confrontTargetId: 'lena',
    doneTitle: 'Nightfall held',
    doneText:
      'The first Ashment night loop is resolved. Keep exploring, talking, saving, or replaying scenes.',
  };
}

export function objectiveForQuest(world: World, quest: Quest): Objective | null {
  const status = quest.status ?? 'open';
  if (status === 'done' || status === 'failed') return null;

  if (status === 'open') {
    const giver = quest.giverId ? findNpc(world, quest.giverId) : undefined;
    if (!giver) return null;
    return {
      questId: quest.id,
      questTitle: quest.title,
      status,
      text: `Talk to ${giver.name} to start this task.`,
      locationId: giver.locationId,
      targetType: 'npc',
      targetId: giver.id,
    };
  }

  const targets = questItemTargetsFor(world, quest);
  const heldTarget = targets.find(({ itemId }) => findItem(world, itemId)?.holderId === 'player');
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
        targetType: 'npc',
        targetId: npc.id,
      };
    }
  }

  const visibleItemTarget = targets.find(({ itemId }) =>
    Boolean(findItem(world, itemId)?.locationId)
  );
  if (visibleItemTarget) {
    const item = findItem(world, visibleItemTarget.itemId);
    if (item?.locationId) {
      return {
        questId: quest.id,
        questTitle: quest.title,
        status,
        text: `Find ${item.name}.`,
        locationId: item.locationId,
        targetType: 'item',
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
      text: 'Search the clue location.',
      locationId: searchTarget.searchLocationId,
      targetType: 'location',
      targetId: searchTarget.searchLocationId,
    };
  }

  const fallbackLocation = quest.giverId
    ? findNpc(world, quest.giverId)?.locationId
    : world.player.locationId;
  if (!fallbackLocation) return null;
  return {
    questId: quest.id,
    questTitle: quest.title,
    status,
    text: quest.description ?? 'Advance this task.',
    locationId: fallbackLocation,
    targetType: 'location',
    targetId: fallbackLocation,
  };
}

function findItem(world: World, id: string): Item | undefined {
  return world.items.find((item) => item.id === id);
}

function findNpc(world: World, id: string): Npc | undefined {
  return world.npcs.find((npc) => npc.id === id);
}
