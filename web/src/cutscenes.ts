import { isCutsceneUnlocked as worldUnlocksCutscene } from "../../src/story-progress.ts";
import type { TickSummary, World } from "../../src/types.ts";

export type CutsceneId =
  | "ashbend_intro_square"
  | "forge_rekindled"
  | "garden_morning"
  | "bridge_whisper"
  | "villain_lantern_shadow"
  | "dawn_after_tasks";

export type CutsceneTrigger =
  | { kind: "manual" }
  | { kind: "session_start" }
  | { kind: "story_phase"; phase: string }
  | { kind: "quest_completed"; questId?: string; textIncludes: string };

export interface Cutscene {
  id: CutsceneId;
  worldId: string;
  storyId: string;
  arcId: string;
  order: number;
  title: string;
  moment: string;
  src: string;
  poster: string;
  triggers: CutsceneTrigger[];
}

export const CUTSCENES: Cutscene[] = [
  {
    id: "ashbend_intro_square",
    worldId: "ashbend",
    storyId: "ember_beneath_ashbend",
    arcId: "arrival",
    order: 10,
    title: "Ashbend Arrival",
    moment: "Opening",
    src: "/assets/cutscenes/ashbend_intro_square.mp4",
    poster: "/assets/cutscenes/ashbend_intro_square.jpg",
    triggers: [{ kind: "session_start" }, { kind: "manual" }],
  },
  {
    id: "forge_rekindled",
    worldId: "ashbend",
    storyId: "ember_beneath_ashbend",
    arcId: "starter_path",
    order: 30,
    title: "Forge Rekindled",
    moment: "Quest",
    src: "/assets/cutscenes/forge_rekindled.mp4",
    poster: "/assets/cutscenes/forge_rekindled.jpg",
    triggers: [
      { kind: "quest_completed", questId: "rekindle_forge", textIncludes: "Rekindle the old forge is complete" },
      { kind: "manual" },
    ],
  },
  {
    id: "garden_morning",
    worldId: "ashbend",
    storyId: "ember_beneath_ashbend",
    arcId: "starter_path",
    order: 20,
    title: "Mira's Garden",
    moment: "Quest",
    src: "/assets/cutscenes/garden_morning.mp4",
    poster: "/assets/cutscenes/garden_morning.jpg",
    triggers: [
      { kind: "quest_completed", questId: "return_shears", textIncludes: "Return the pruning shears is complete" },
      { kind: "manual" },
    ],
  },
  {
    id: "bridge_whisper",
    worldId: "ashbend",
    storyId: "ember_beneath_ashbend",
    arcId: "starter_path",
    order: 40,
    title: "Bridge Whisper",
    moment: "Mystery",
    src: "/assets/cutscenes/bridge_whisper.mp4",
    poster: "/assets/cutscenes/bridge_whisper.jpg",
    triggers: [
      { kind: "quest_completed", questId: "bridge_whisper", textIncludes: "Listen at the old bridge is complete" },
      { kind: "manual" },
    ],
  },
  {
    id: "villain_lantern_shadow",
    worldId: "ashbend",
    storyId: "ember_beneath_ashbend",
    arcId: "threat",
    order: 50,
    title: "Lantern Shadow",
    moment: "Threat",
    src: "/assets/cutscenes/villain_lantern_shadow.mp4",
    poster: "/assets/cutscenes/villain_lantern_shadow.jpg",
    triggers: [{ kind: "story_phase", phase: "nightfall_warning" }, { kind: "manual" }],
  },
  {
    id: "dawn_after_tasks",
    worldId: "ashbend",
    storyId: "ember_beneath_ashbend",
    arcId: "resolution",
    order: 60,
    title: "Dawn Over Ashbend",
    moment: "Resolution",
    src: "/assets/cutscenes/dawn_after_tasks.mp4",
    poster: "/assets/cutscenes/dawn_after_tasks.jpg",
    triggers: [{ kind: "story_phase", phase: "dawn_after_tasks" }, { kind: "manual" }],
  },
];

export interface CutsceneScope {
  worldId: string;
  storyId?: string;
}

export const CUTSCENE_EVENT = "ai-game:play-cutscene";

export function cutsceneById(id: CutsceneId): Cutscene {
  const cutscene = CUTSCENES.find((entry) => entry.id === id);
  if (!cutscene) throw new Error(`Unknown cutscene: ${id}`);
  return cutscene;
}

export function cutscenesForScope(scope: CutsceneScope | null | undefined): Cutscene[] {
  if (!scope?.worldId) return CUTSCENES;
  return CUTSCENES
    .filter((entry) => entry.worldId === scope.worldId && (!scope.storyId || entry.storyId === scope.storyId))
    .sort((a, b) => a.order - b.order);
}

export function introCutsceneForScope(scope: CutsceneScope): Cutscene | null {
  return cutscenesForScope(scope).find((entry) => entry.triggers.some((trigger) => trigger.kind === "session_start")) ?? null;
}

export function cutsceneForSummary(summary: TickSummary, scope: CutsceneScope): Cutscene | null {
  const text = summary.actions.map((entry) => entry.text).join("\n").toLowerCase();
  return (
    cutscenesForScope(scope).find((entry) =>
      entry.triggers.some((trigger) => trigger.kind === "quest_completed" && text.includes(trigger.textIncludes.toLowerCase())),
    ) ?? null
  );
}

export function isCutsceneUnlocked(cutscene: Cutscene, world: World | null | undefined): boolean {
  if (world && cutscene.worldId !== world.id) return false;
  return worldUnlocksCutscene(world, cutscene.id);
}

export function unlockedCutscenesForScope(scope: CutsceneScope, world: World | null | undefined): Cutscene[] {
  return cutscenesForScope(scope).filter((cutscene) => isCutsceneUnlocked(cutscene, world));
}

export function playCutscene(id: CutsceneId): void {
  window.dispatchEvent(new CustomEvent<CutsceneId>(CUTSCENE_EVENT, { detail: id }));
}
