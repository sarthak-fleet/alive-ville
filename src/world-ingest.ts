import {
  type AnimeArtifactDraft,
  type AnimeCharacterDraft,
  type AnimeConflictDraft,
  type AnimeFactionDraft,
  type AnimeIngestIssue,
  type AnimeIngestSource,
  type AnimeLocationDraft,
  animeSourceToWorld,
  validateAnimeIngestSource,
} from "./anime-ingest.ts";
import type { Action, HolderId, InteractableProp, Npc, Quest, RelationshipAxes, World } from "./types.ts";

export type WorldIngestSource = AnimeIngestSource;
export type WorldLocationDraft = AnimeLocationDraft;
export type WorldCharacterDraft = AnimeCharacterDraft;
export type WorldFactionDraft = AnimeFactionDraft;
export type WorldConflictDraft = AnimeConflictDraft;
export type WorldArtifactDraft = AnimeArtifactDraft;
export type WorldIngestIssue = AnimeIngestIssue;

export function validateWorldIngestSource(source: WorldIngestSource): WorldIngestIssue[] {
  return validateAnimeIngestSource(source).map((issue) => ({
    ...issue,
    message: issue.message.replace(/^Anime title/, "World title"),
  }));
}

export function worldSourceToWorld(source: WorldIngestSource): World {
  const issues = validateWorldIngestSource(source);
  if (issues.length > 0) {
    throw new Error(`Invalid world ingest source: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`);
  }
  return rebrandGenericWorld(animeSourceToWorld(source), source);
}

function rebrandGenericWorld(world: World, source: WorldIngestSource): World {
  const firstLocation = world.locations[0]?.name ?? source.title;
  const story = world.story ?? {
    title: source.title,
    premise: source.synopsis,
    opening: source.synopsis,
  };
  const rebranded: World = {
    ...world,
    story: {
      ...story,
      title: `${source.title}: World Ingest Slice`,
      currentObjective: `Stabilize ${firstLocation} before the core conflict escalates.`,
    },
    rules: (world.rules ?? []).map((rule) => rule.id === "canon_review"
      ? { ...rule, text: "World ingest creates a reviewed playable draft; setting fidelity requires human approval before release." }
      : rule),
  };
  return remapGenericWorldIds(rebranded, source);
}

function remapGenericWorldIds(world: World, source: WorldIngestSource): World {
  const locationIds = new Set(world.locations.map((location) => location.id));
  const npcIdMap = idMap([
    ["mira", source.characters[0]?.name ? uniqueSlug(source.characters[0].name, locationIds) : undefined],
    ["tomas", source.characters[1]?.name ? uniqueSlug(source.characters[1].name, locationIds) : undefined],
    ["lena", source.characters[2]?.name ? uniqueSlug(source.characters[2].name, locationIds) : undefined],
    ["orrin", source.characters[3]?.name ? uniqueSlug(source.characters[3].name, locationIds) : undefined],
    ["pax", source.characters[4]?.name ? uniqueSlug(source.characters[4].name, locationIds) : undefined],
  ]);
  const itemIdMap = idMap([
    ["shears", source.artifacts?.[0]?.name ? uniqueSlug(source.artifacts[0].name, locationIds) : undefined],
    ["bellows_leather", source.artifacts?.[1]?.name ? uniqueSlug(source.artifacts[1].name, locationIds) : undefined],
    ["blue_ember", source.artifacts?.[2]?.name ? uniqueSlug(source.artifacts[2].name, locationIds) : undefined],
    ["rumor_note", source.artifacts?.[3]?.name ? uniqueSlug(source.artifacts[3].name, locationIds) : undefined],
    ["lantern", source.artifacts?.[4]?.name ? uniqueSlug(source.artifacts[4].name, locationIds) : undefined],
  ]);
  const questIdMap = idMap([
    ["return_shears", itemIdMap.get("shears") ? uniqueSlug(`recover ${itemIdMap.get("shears")}`, locationIds) : undefined],
    ["rekindle_forge", itemIdMap.get("bellows_leather") ? uniqueSlug(`recover ${itemIdMap.get("bellows_leather")}`, locationIds) : undefined],
    ["bridge_whisper", itemIdMap.get("blue_ember") ? uniqueSlug(`recover ${itemIdMap.get("blue_ember")}`, locationIds) : undefined],
  ]);
  const tensionIdMap = idMap([
    ["overpass_alert", source.conflicts?.[0]?.title ? uniqueSlug(source.conflicts[0].title, locationIds) : undefined],
  ]);
  const villainPlanIdMap = idMap([
    ["bridge_whisper_plan", source.conflicts?.[0]?.title ? uniqueSlug(`${source.conflicts[0].title} plan`, locationIds) : undefined],
  ]);

  return {
    ...world,
    player: {
      ...world.player,
      characterId: world.player.characterId ? remapActorId(npcIdMap, world.player.characterId) : undefined,
    },
    npcs: world.npcs.map((npc) => remapNpc(npc, npcIdMap, itemIdMap, questIdMap, villainPlanIdMap)),
    items: world.items.map((item) => ({
      ...item,
      id: remapId(itemIdMap, item.id),
      holderId: item.holderId ? remapHolderId(npcIdMap, item.holderId) : undefined,
    })),
    quests: (world.quests ?? []).map((quest) => remapQuest(quest, npcIdMap, questIdMap)),
    interactables: (world.interactables ?? []).map((prop) => rebrandGenericProp(prop, npcIdMap, questIdMap)),
    tensions: (world.tensions ?? []).map((tension) => ({
      ...tension,
      id: remapId(tensionIdMap, tension.id),
      involvedIds: tension.involvedIds?.map((id) => remapActorId(npcIdMap, id)),
    })),
    villainPlans: (world.villainPlans ?? []).map((plan) => ({
      ...plan,
      id: remapId(villainPlanIdMap, plan.id),
      actorId: remapActorId(npcIdMap, plan.actorId),
    })),
    eventLog: world.eventLog.map((tick) => ({
      ...tick,
      actions: tick.actions.map((entry) => ({ ...entry, action: remapAction(entry.action, npcIdMap, itemIdMap, questIdMap) })),
      rejected: tick.rejected.map((entry) => ({ ...entry, action: remapAction(entry.action, npcIdMap, itemIdMap, questIdMap) })),
    })),
  };
}

function rebrandGenericProp(prop: InteractableProp, npcIdMap: Map<string, string>, questIdMap: Map<string, string>): InteractableProp {
  return {
    ...prop,
    id: prop.id.replace(/^anime_/, "world_"),
    clueTags: prop.clueTags?.map((tag) => tag === "anime" ? "world" : tag),
    relatedQuestId: prop.relatedQuestId ? remapId(questIdMap, prop.relatedQuestId) : undefined,
    involvedIds: prop.involvedIds?.map((id) => remapActorId(npcIdMap, id)),
  };
}

function remapNpc(
  npc: Npc,
  npcIdMap: Map<string, string>,
  itemIdMap: Map<string, string>,
  questIdMap: Map<string, string>,
  villainPlanIdMap: Map<string, string>
): Npc {
  const nextId = remapId(npcIdMap, npc.id);
  return {
    ...npc,
    id: nextId,
    relationships: remapRelationshipScores(npc.relationships, npcIdMap),
    relationshipAxes: npc.relationshipAxes ? remapRelationshipAxes(npc.relationshipAxes, npcIdMap) : undefined,
    ambitions: npc.ambitions?.map((ambition) => ({
      ...ambition,
      id: ambition.id.replace(npc.id, nextId),
      targetId: ambition.targetId ? remapAnyId(npcIdMap, itemIdMap, questIdMap, villainPlanIdMap, ambition.targetId) : undefined,
    })),
    secrets: npc.secrets?.map((secret) => ({ ...secret, id: secret.id.replace(npc.id, nextId), knownBy: secret.knownBy?.map((id) => remapHolderId(npcIdMap, id)) })),
    plan: npc.plan ? {
      ...npc.plan,
      currentIntent: npc.plan.currentIntent ? {
        ...npc.plan.currentIntent,
        targetId: npc.plan.currentIntent.targetId
          ? remapAnyId(npcIdMap, itemIdMap, questIdMap, villainPlanIdMap, npc.plan.currentIntent.targetId)
          : undefined,
      } : undefined,
    } : undefined,
    memories: npc.memories.map((memory) => ({
      ...memory,
      meta: memory.meta?.sourceActorId ? {
        ...memory.meta,
        sourceActorId: remapActorId(npcIdMap, memory.meta.sourceActorId),
      } : memory.meta,
    })),
  };
}

function remapQuest(quest: Quest, npcIdMap: Map<string, string>, questIdMap: Map<string, string>): Quest {
  return {
    ...quest,
    id: remapId(questIdMap, quest.id),
    giverId: quest.giverId ? remapActorId(npcIdMap, quest.giverId) : undefined,
    acceptedBy: quest.acceptedBy ? remapHolderId(npcIdMap, quest.acceptedBy) : undefined,
    rewards: quest.rewards?.relationshipDelta ? {
      ...quest.rewards,
      relationshipDelta: remapRelationshipScores(quest.rewards.relationshipDelta, npcIdMap),
    } : quest.rewards,
    consequences: quest.consequences?.relationshipDelta ? {
      ...quest.consequences,
      relationshipDelta: remapRelationshipScores(quest.consequences.relationshipDelta, npcIdMap),
    } : quest.consequences,
  };
}

function remapRelationshipScores(scores: Record<string, number>, npcIdMap: Map<string, string>): Record<string, number> {
  return Object.fromEntries(Object.entries(scores).map(([id, score]) => [remapActorId(npcIdMap, id), score]));
}

function remapRelationshipAxes(
  axes: Record<string, RelationshipAxes>,
  npcIdMap: Map<string, string>
): Record<string, RelationshipAxes> {
  return Object.fromEntries(Object.entries(axes).map(([id, value]) => [remapActorId(npcIdMap, id), value]));
}

function remapAction(action: Action, npcIdMap: Map<string, string>, itemIdMap: Map<string, string>, questIdMap: Map<string, string>): Action {
  const base = { ...action, actorId: remapActorId(npcIdMap, action.actorId) };
  if ("targetId" in base && typeof base.targetId === "string") base.targetId = remapActorId(npcIdMap, base.targetId);
  if ("aboutId" in base && typeof base.aboutId === "string") base.aboutId = remapActorId(npcIdMap, base.aboutId);
  if ("itemId" in base && typeof base.itemId === "string") base.itemId = remapId(itemIdMap, base.itemId);
  if ("questId" in base && typeof base.questId === "string") base.questId = remapId(questIdMap, base.questId);
  return base;
}

function remapAnyId(
  npcIdMap: Map<string, string>,
  itemIdMap: Map<string, string>,
  questIdMap: Map<string, string>,
  villainPlanIdMap: Map<string, string>,
  id: string
): string {
  return remapId(villainPlanIdMap, remapId(questIdMap, remapId(itemIdMap, remapActorId(npcIdMap, id))));
}

function remapActorId(npcIdMap: Map<string, string>, id: string): string {
  if (id === "player" || id === "world" || id === "director") return id;
  return remapId(npcIdMap, id);
}

function remapHolderId(npcIdMap: Map<string, string>, id: HolderId): HolderId {
  return id === "player" ? id : remapActorId(npcIdMap, id);
}

function remapId(idMap: Map<string, string>, id: string): string {
  return idMap.get(id) ?? id;
}

function idMap(entries: Array<[string, string | undefined]>): Map<string, string> {
  return new Map(entries.flatMap(([from, to]) => to ? [[from, to]] : []));
}

function uniqueSlug(value: string, reservedIds: Set<string>): string {
  const base = slugId(value);
  let candidate = base;
  let index = 2;
  while (reservedIds.has(candidate)) {
    candidate = `${base}_${index}`;
    index += 1;
  }
  reservedIds.add(candidate);
  return candidate;
}

function slugId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_") || "world_id";
}
