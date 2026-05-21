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
import type { InteractableProp, World } from "./types.ts";

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
  return {
    ...world,
    story: {
      ...story,
      title: `${source.title}: World Ingest Slice`,
      currentObjective: `Stabilize ${firstLocation} before the core conflict escalates.`,
    },
    rules: (world.rules ?? []).map((rule) => rule.id === "canon_review"
      ? { ...rule, text: "World ingest creates a reviewed playable draft; setting fidelity requires human approval before release." }
      : rule),
    interactables: (world.interactables ?? []).map(rebrandGenericProp),
  };
}

function rebrandGenericProp(prop: InteractableProp): InteractableProp {
  return {
    ...prop,
    id: prop.id.replace(/^anime_/, "world_"),
    clueTags: prop.clueTags?.map((tag) => tag === "anime" ? "world" : tag),
  };
}
