import type { Quest, StoryProgress, World } from "./types.ts";

export const ASHBEND_STORY_ID = "ember_beneath_ashbend";

export const STARTER_QUEST_IDS = ["return_shears", "rekindle_forge", "bridge_whisper"] as const;

export const STORY_CUTSCENES = {
  intro: "ashbend_intro_square",
  shears: "garden_morning",
  forge: "forge_rekindled",
  bridge: "bridge_whisper",
  villain: "villain_lantern_shadow",
  dawn: "dawn_after_tasks",
} as const;

const QUEST_CUTSCENE_IDS: Record<string, string> = {
  return_shears: STORY_CUTSCENES.shears,
  rekindle_forge: STORY_CUTSCENES.forge,
  bridge_whisper: STORY_CUTSCENES.bridge,
};

export function ensureStoryProgress(world: World): StoryProgress {
  world.storyProgress ??= {
    phase: "starter",
    unlockedCutsceneIds: [],
    playedCutsceneIds: [],
  };
  world.storyProgress.phase ??= "starter";
  world.storyProgress.unlockedCutsceneIds ??= [];
  world.storyProgress.playedCutsceneIds ??= [];
  unlockCutscene(world, STORY_CUTSCENES.intro);
  unlockCompletedQuestCutscenes(world);
  unlockPhaseCutscenes(world);
  return world.storyProgress;
}

export function syncStoryProgress(world: World): StoryProgress {
  const progress = ensureStoryProgress(world);
  if (progress.phase === "starter" && starterPathComplete(world)) {
    progress.phase = "nightfall_warning";
  }
  unlockCompletedQuestCutscenes(world);
  unlockPhaseCutscenes(world);
  return progress;
}

export function advanceNightfallTravel(world: World, locationId: string): void {
  const progress = syncStoryProgress(world);
  if (progress.phase === "nightfall_warning" && (locationId === "inn" || locationId === "square")) {
    progress.phase = "shadow_confrontation";
    unlockPhaseCutscenes(world);
  }
}

export function resolveShadowConfrontation(world: World): void {
  const progress = syncStoryProgress(world);
  if (progress.phase !== "shadow_confrontation") return;
  progress.phase = "dawn_after_tasks";
  unlockPhaseCutscenes(world);
}

export function markCutscenePlayed(world: World, cutsceneId: string): void {
  const progress = ensureStoryProgress(world);
  addUnique(progress.playedCutsceneIds, cutsceneId);
}

export function isCutsceneUnlocked(world: World | null | undefined, cutsceneId: string): boolean {
  if (!world) return cutsceneId === STORY_CUTSCENES.intro;
  const progress = ensureStoryProgress(world);
  if (progress.unlockedCutsceneIds.includes(cutsceneId)) return true;
  if (cutsceneId === STORY_CUTSCENES.intro) return true;
  if (cutsceneId === STORY_CUTSCENES.villain) return progress.phase !== "starter";
  if (cutsceneId === STORY_CUTSCENES.dawn) return progress.phase === "dawn_after_tasks";
  return world.quests?.some((quest) => quest.status === "done" && QUEST_CUTSCENE_IDS[quest.id] === cutsceneId) ?? false;
}

export function starterPathComplete(world: World): boolean {
  return STARTER_QUEST_IDS.every((questId) => questById(world, questId)?.status === "done");
}

function unlockCompletedQuestCutscenes(world: World): void {
  for (const quest of world.quests ?? []) {
    if (quest.status === "done") {
      const cutsceneId = QUEST_CUTSCENE_IDS[quest.id];
      if (cutsceneId) unlockCutscene(world, cutsceneId);
    }
  }
}

function unlockPhaseCutscenes(world: World): void {
  const progress = ensureStoryProgressShape(world);
  if (progress.phase !== "starter") unlockCutscene(world, STORY_CUTSCENES.villain);
  if (progress.phase === "dawn_after_tasks") unlockCutscene(world, STORY_CUTSCENES.dawn);
}

function unlockCutscene(world: World, cutsceneId: string): void {
  const progress = ensureStoryProgressShape(world);
  addUnique(progress.unlockedCutsceneIds, cutsceneId);
}

function ensureStoryProgressShape(world: World): StoryProgress {
  world.storyProgress ??= {
    phase: "starter",
    unlockedCutsceneIds: [],
    playedCutsceneIds: [],
  };
  world.storyProgress.unlockedCutsceneIds ??= [];
  world.storyProgress.playedCutsceneIds ??= [];
  return world.storyProgress;
}

function addUnique(values: string[], value: string): void {
  if (!values.includes(value)) values.push(value);
}

function questById(world: World, questId: string): Quest | undefined {
  return (world.quests ?? []).find((quest) => quest.id === questId);
}
