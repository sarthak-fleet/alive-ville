import type { AgentNeedKey, CharacterAppearance, Item, ItemVisualDesign, Npc, World } from "./types.ts";

export interface AnimeIngestSource {
  title: string;
  worldId?: string;
  synopsis: string;
  themes?: string[];
  locations: AnimeLocationDraft[];
  characters: AnimeCharacterDraft[];
  factions?: AnimeFactionDraft[];
  conflicts?: AnimeConflictDraft[];
  artifacts?: AnimeArtifactDraft[];
}

export interface AnimeLocationDraft {
  name: string;
  role?: string;
  description?: string;
}

export interface AnimeCharacterDraft {
  name: string;
  role: string;
  faction?: string;
  description: string;
  look?: Partial<CharacterAppearance>;
  traits?: string[];
  values?: string[];
  flaws?: string[];
  fears?: string[];
  speechStyle?: string;
  goals?: string[];
  secrets?: string[];
  memories?: string[];
}

export interface AnimeFactionDraft {
  name: string;
  goals?: string[];
  resources?: string[];
  reputation?: number;
}

export interface AnimeConflictDraft {
  title: string;
  involved?: string[];
  pressure?: number;
  antagonist?: string;
  objective?: string;
  clue?: string;
}

export interface AnimeArtifactDraft {
  name: string;
  description: string;
  location?: string;
  holder?: string;
  clue?: string;
}

export interface AnimeIngestIssue {
  path: string;
  message: string;
}

const LOCATION_SLOTS = ["square", "forge", "garden", "inn", "bridge", "wood"] as const;
const CHARACTER_SLOTS = ["mira", "tomas", "lena", "orrin", "pax"] as const;
const QUEST_SLOTS = [
  { questId: "return_shears", itemId: "shears", giverSlot: "mira", itemSlot: 0, fallback: "first proof token" },
  { questId: "rekindle_forge", itemId: "bellows_leather", giverSlot: "tomas", itemSlot: 1, fallback: "repair component" },
  { questId: "bridge_whisper", itemId: "blue_ember", giverSlot: "lena", itemSlot: 2, fallback: "threat proof" },
] as const;

export function validateAnimeIngestSource(source: AnimeIngestSource): AnimeIngestIssue[] {
  const issues: AnimeIngestIssue[] = [];
  if (!source.title.trim()) issues.push({ path: "title", message: "Anime title is required." });
  if (!source.synopsis.trim()) issues.push({ path: "synopsis", message: "Synopsis is required." });
  if (source.locations.length < 3) issues.push({ path: "locations", message: "At least three locations are required for a playable slice." });
  if (source.characters.length < 3) issues.push({ path: "characters", message: "At least three characters are required for starter quests." });
  addDuplicateIssues(issues, "locations", source.locations.map((location) => location.name));
  addDuplicateIssues(issues, "characters", source.characters.map((character) => character.name));
  addDuplicateIssues(issues, "artifacts", (source.artifacts ?? []).map((artifact) => artifact.name));
  return issues;
}

export function animeSourceToWorld(source: AnimeIngestSource): World {
  const issues = validateAnimeIngestSource(source);
  if (issues.length > 0) {
    throw new Error(`Invalid anime ingest source: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`);
  }

  const worldId = slugId(source.worldId ?? source.title);
  const locations = LOCATION_SLOTS.map((id, index) => {
    const draft = source.locations[index] ?? source.locations[source.locations.length - 1]!;
    const xy = locationCoordinates(index);
    return {
      id,
      name: draft.name,
      x: xy.x,
      y: xy.y,
      w: xy.w,
      h: xy.h,
      visual: {
        role: draft.role,
        description: draft.description,
        palette: locationPaletteFor(index, draft),
        visualTags: tokenize(`${draft.role ?? ""} ${draft.description ?? ""}`).slice(0, 6),
        landmarks: locationLandmarksFor(index, draft),
        elevation: locationElevationFor(index, draft),
      },
    };
  });
  const characters = CHARACTER_SLOTS.map((id, index) => characterToNpc(source, id, index));
  const artifacts = artifactSet(source);
  const antagonist = characters.at(-1)!;
  return {
    id: worldId,
    name: `${source.title} Playable Slice`,
    story: {
      title: `${source.title}: Anime Ingest Slice`,
      premise: source.synopsis,
      opening: `${characters[0]!.name} needs help before ${antagonist.name}'s pressure turns the first patrol loop into a public crisis.`,
      currentObjective: `Stabilize ${locations[0]!.name} before the anime conflict escalates.`,
      mysteries: (source.conflicts ?? []).map((conflict) => conflict.title).slice(0, 3),
      beats: [
        `${characters[0]!.name} needs ${artifacts[0]!.name}.`,
        `${characters[1]!.name} needs ${artifacts[1]!.name}.`,
        `${characters[2]!.name} needs proof from ${locations[4]!.name}.`,
        `${antagonist.name} advances if ignored.`,
      ],
    },
    storyProgress: { phase: "starter", unlockedCutsceneIds: [], playedCutsceneIds: [] },
    tick: 0,
    player: { locationId: "square", name: "New Hero" },
    clock: { hoursPerTick: 2, hour: 8, day: 1 },
    rules: [
      { id: "canon_review", kind: "story", text: "Anime ingest creates a reviewed playable draft; canon fidelity requires human approval before release." },
      { id: "evidence_first", kind: "social", text: "NPCs react more strongly to witnessed proof than to vague claims." },
      { id: "pressure_loop", kind: "story", text: "Ignored conflicts raise director pressure and unlock confrontation objectives." },
    ],
    factions: factionsFor(source),
    tensions: tensionsFor(source, antagonist.id),
    villainPlans: [{
      id: "bridge_whisper_plan",
      actorId: antagonist.id,
      title: (source.conflicts?.[0]?.title ?? `${antagonist.name} forces a confrontation`),
      objective: source.conflicts?.[0]?.objective ?? `Push ${locations[0]!.name} into panic before proof is gathered.`,
      stage: 1,
      hidden: true,
      pressure: source.conflicts?.[0]?.pressure ?? 42,
      nextTrigger: "If the player ignores proof and waits into dusk, the antagonist escalates.",
      knownFacts: [source.conflicts?.[0]?.clue ?? `${antagonist.name} left a clue near ${locations[4]!.name}.`],
    }],
    directorState: {
      pressure: Math.max(12, Math.min(60, source.conflicts?.[0]?.pressure ?? 22)),
      quietTicks: 0,
      pendingReveals: [source.conflicts?.[0]?.clue ?? `A clue points from ${locations[4]!.name} back to ${locations[0]!.name}.`],
    },
    locations,
    exits: [
      { from: "square", to: "forge", bidirectional: true, label: "training route" },
      { from: "square", to: "garden", bidirectional: true, label: "home route" },
      { from: "square", to: "inn", bidirectional: true, label: "report route" },
      { from: "square", to: "bridge", bidirectional: true, label: "threat route" },
      { from: "square", to: "wood", bidirectional: true, label: "back route" },
      { from: "bridge", to: "wood", bidirectional: true, label: "hidden route" },
    ],
    npcs: characters,
    items: [
      itemFromArtifact("shears", artifacts[0]!, "forge"),
      itemFromArtifact("bellows_leather", artifacts[1]!, "wood"),
      itemFromArtifact("blue_ember", artifacts[2]!, "bridge"),
      itemFromArtifact("rumor_note", artifacts[3]!, "bridge"),
      itemFromArtifact("lantern", artifacts[4]!, "inn"),
    ],
    interactables: [
      {
        id: "anime_origin_clue",
        name: `${artifacts[0]!.name} trace`,
        locationId: "forge",
        description: `A clue tied to ${characters[0]!.name}'s first need.`,
        inspectText: artifacts[0]!.clue ?? `${artifacts[0]!.name} was moved after the morning routine.`,
        clueTags: ["anime", "first", "proof"],
        relatedQuestId: "return_shears",
        involvedIds: [characters[0]!.id, "forge"],
        pressureDelta: -2,
      },
      {
        id: "anime_report_board",
        name: `${locations[3]!.name} report board`,
        locationId: "inn",
        description: "A place where partial reports become actionable quests.",
        inspectText: artifacts[2]!.clue ?? `The report needs physical proof from ${locations[4]!.name}.`,
        clueTags: ["anime", "report", "proof"],
        relatedQuestId: "bridge_whisper",
        involvedIds: [characters[2]!.id, "bridge"],
        pressureDelta: -3,
      },
      {
        id: "anime_antagonist_marks",
        name: `${antagonist.name} marks`,
        locationId: "bridge",
        description: `Signs that ${antagonist.name} is shaping the confrontation.`,
        inspectText: source.conflicts?.[0]?.clue ?? `${antagonist.name} wants the conflict to become visible at ${locations[0]!.name}.`,
        clueTags: ["anime", "antagonist", "confrontation"],
        relatedQuestId: "bridge_whisper",
        involvedIds: [antagonist.id, "bridge"],
        pressureDelta: -4,
      },
    ],
    quests: QUEST_SLOTS.map((slot, index) => {
      const giver = characters.find((character) => character.id === slot.giverSlot)!;
      const artifact = artifacts[index]!;
      return {
        id: slot.questId,
        title: `Recover ${artifact.name} for ${giver.name}`,
        description: `${giver.name} needs ${artifact.name} before the conflict escalates.`,
        giverId: giver.id,
        status: "open",
        rewards: { relationshipDelta: { [giver.id]: 2 } },
        consequences: { relationshipDelta: { [giver.id]: -2 } },
      };
    }),
    eventLog: [],
  };
}

function characterToNpc(source: AnimeIngestSource, id: typeof CHARACTER_SLOTS[number], index: number): Npc {
  const draft = source.characters[index] ?? source.characters[source.characters.length - 1]!;
  const factionId = draft.faction ? slugId(draft.faction) : index === CHARACTER_SLOTS.length - 1 ? "challengers" : "allies";
  const needs = needsFor(index);
  return {
    id,
    name: draft.name,
    locationId: LOCATION_SLOTS[index] ?? "square",
    tier: index < 3 ? "quest" : index === CHARACTER_SLOTS.length - 1 ? "normal" : "normal",
    role: draft.role,
    factionId,
    description: draft.description,
    appearance: {
      sourceLook: draft.look?.sourceLook ?? `${draft.name} / ${draft.role}`,
      bodyType: draft.look?.bodyType,
      hair: draft.look?.hair,
      outfit: draft.look?.outfit,
      palette: draft.look?.palette ?? paletteFor(index),
      silhouette: draft.look?.silhouette ?? `${draft.name}'s silhouette should read as ${draft.role}.`,
      visualTags: draft.look?.visualTags ?? [draft.role, ...(draft.traits ?? []).slice(0, 2)],
      portrait: draft.look?.portrait,
      spriteSheet: draft.look?.spriteSheet,
    },
    traits: {
      personality: draft.traits ?? ["focused"],
      values: draft.values ?? ["protect the people close to them"],
      flaws: draft.flaws ?? ["holds back key context"],
      fears: draft.fears ?? ["the conflict spreading"],
      speechStyle: draft.speechStyle ?? "direct and compact",
    },
    needs,
    mood: {
      emotion: index === CHARACTER_SLOTS.length - 1 ? "calculating" : "focused",
      stress: index === CHARACTER_SLOTS.length - 1 ? 44 : 28 + index * 7,
      confidence: index === 0 ? 82 : 58 + index * 4,
      suspicion: index === CHARACTER_SLOTS.length - 1 ? 62 : 22 + index * 5,
    },
    goals: draft.goals ?? [`resolve ${source.title}'s first local conflict`, "keep the playable slice stable"],
    ambitions: (draft.goals ?? [`resolve ${source.title}'s first local conflict`]).slice(0, 2).map((goal, goalIndex) => ({
      id: `${id}_anime_goal_${goalIndex + 1}`,
      title: goal,
      kind: goalKindFor(goal, index),
      priority: Math.max(52, 88 - goalIndex * 12 - index * 3),
      status: "active",
      targetId: LOCATION_SLOTS[Math.min(goalIndex + index, LOCATION_SLOTS.length - 1)],
    })),
    secrets: (draft.secrets ?? []).map((secret, secretIndex) => ({
      id: `${id}_secret_${secretIndex + 1}`,
      text: secret,
      risk: index === CHARACTER_SLOTS.length - 1 ? 82 : 48 + secretIndex * 8,
      knownBy: [],
    })),
    relationshipAxes: relationshipAxesFor(id),
    relationships: relationshipsFor(id),
    memories: (draft.memories ?? [`${draft.name} remembers the first clue from ${source.title}.`]).map((memory) => ({
      tick: 0,
      text: memory,
      meta: {
        importance: /secret|proof|threat|danger|promise|duel|monster|curse/i.test(memory) ? 8 : 5,
        tags: tokenize(memory).slice(0, 6),
        visibility: index === CHARACTER_SLOTS.length - 1 ? "private" : "shared",
        emotionalWeight: /danger|fear|panic|promise|lost/i.test(memory) ? 6 : 3,
        sourceActorId: "world",
      },
    })),
  };
}

function artifactSet(source: AnimeIngestSource): Required<AnimeArtifactDraft>[] {
  const defaults: Required<AnimeArtifactDraft>[] = [
    { name: "first proof token", description: "The first small item that makes the anime conflict playable.", location: "forge", holder: "", clue: "The item moved after a morning routine." },
    { name: "repair component", description: "A component needed to stabilize the second quest giver's plan.", location: "wood", holder: "", clue: "The component was lost near a dangerous route." },
    { name: "threat proof", description: "Physical evidence that turns rumor into a valid report.", location: "bridge", holder: "", clue: "The proof sits near the pressure source." },
    { name: "challenge note", description: "A written clue that exposes the antagonist's intent.", location: "bridge", holder: "", clue: "The note points back to the public square." },
    { name: "signal radio", description: "A local report device that makes pressure visible.", location: "inn", holder: "", clue: "The radio needs better evidence before sounding an alert." },
  ];
  return defaults.map((fallback, index) => ({ ...fallback, ...(source.artifacts?.[index] ?? {}) }));
}

function itemFromArtifact(id: string, artifact: Required<AnimeArtifactDraft>, locationId: string): Item {
  return {
    id,
    name: artifact.name,
    description: artifact.description,
    locationId,
    visual: artifactVisualFor(artifact),
  };
}

function artifactVisualFor(artifact: Required<AnimeArtifactDraft>): ItemVisualDesign {
  const text = `${artifact.name} ${artifact.description} ${artifact.clue}`.toLowerCase();
  const visualTags = tokenize(text).slice(0, 6);
  if (/token|coin|brass|badge|key/.test(text)) {
    return {
      material: "metal",
      shape: "token",
      palette: { primary: "#d8a441", emissive: "#3d2a05" },
      visualTags,
    };
  }
  if (/radio|receiver|transmitter|signal/.test(text)) {
    return {
      material: "radio",
      shape: "radio",
      palette: { primary: "#596477", emissive: "#7fd0ff" },
      visualTags,
    };
  }
  if (/gear/.test(text)) {
    return {
      material: "metal",
      shape: "gear",
      palette: { primary: "#9fc3ff", emissive: "#12304a" },
      visualTags,
    };
  }
  if (/gear|core|crystal|prism|glass|ember/.test(text)) {
    return {
      material: /core/.test(text) ? "metal" : /glass|prism/.test(text) ? "glass" : "crystal",
      shape: "core",
      palette: { primary: /ember/.test(text) ? "#f08a38" : "#9fc3ff", emissive: /ember/.test(text) ? "#7a2c08" : "#12304a" },
      visualTags,
    };
  }
  if (/flag|scrap|cloth|torn|paint/.test(text)) {
    return {
      material: "cloth",
      shape: "scrap",
      palette: { primary: "#e05f7a", emissive: "#3a1420" },
      visualTags,
    };
  }
  if (/coupon|note|paper|map|letter/.test(text)) {
    return {
      material: "paper",
      shape: "note",
      palette: { primary: "#f7e8a5", emissive: "#3d331a" },
      visualTags,
    };
  }
  if (/scale|bone|shell|fang/.test(text)) {
    return {
      material: "organic",
      shape: "scale",
      palette: { primary: "#7fd0ff", emissive: "#17324a" },
      visualTags,
    };
  }
  return {
    material: "metal",
    shape: "trinket",
    palette: { primary: "#f8d44e", emissive: "#4a3300" },
    visualTags,
  };
}

function factionsFor(source: AnimeIngestSource) {
  const drafts = source.factions?.length ? source.factions : [
    { name: "Allies", goals: ["protect civilians", "resolve the first conflict"], resources: ["local trust"], reputation: 1 },
    { name: "Challengers", goals: ["force confrontation", "raise pressure"], resources: ["ambush routes"], reputation: -2 },
  ];
  return drafts.map((draft) => ({
    id: slugId(draft.name),
    name: draft.name,
    goals: draft.goals ?? [],
    resources: draft.resources ?? [],
    reputation: draft.reputation ?? 0,
  }));
}

function tensionsFor(source: AnimeIngestSource, antagonistId: string) {
  const conflicts = source.conflicts?.length ? source.conflicts : [{ title: `${source.title} pressure is rising`, pressure: 45, involved: [antagonistId] }];
  return conflicts.slice(0, 2).map((conflict, index) => ({
    id: index === 0 ? "overpass_alert" : `anime_tension_${index + 1}`,
    title: conflict.title,
    pressure: conflict.pressure ?? 45,
    status: (conflict.pressure ?? 45) >= 40 ? "active" as const : "quiet" as const,
    involvedIds: involvedIdsFor(conflict.involved, antagonistId),
  }));
}

function involvedIdsFor(involved: string[] | undefined, antagonistId: string): string[] {
  const ids = new Set<string>([antagonistId, "bridge"]);
  for (const value of involved ?? []) {
    const id = slotForName(value);
    if (id) ids.add(id);
  }
  return [...ids];
}

function slotForName(value: string): string | null {
  const id = slugId(value);
  if (["mira", "tomas", "lena", "orrin", "pax"].includes(id)) return id;
  if (["square", "forge", "garden", "inn", "bridge", "wood"].includes(id)) return id;
  return null;
}

function relationshipsFor(id: string): Record<string, number> {
  const peers = CHARACTER_SLOTS.filter((slot) => slot !== id);
  return Object.fromEntries(peers.map((peer, index) => [peer, id === "pax" ? -1 : Math.max(-1, 2 - index)]));
}

function relationshipAxesFor(id: string) {
  const result: Npc["relationshipAxes"] = {};
  for (const peer of CHARACTER_SLOTS) {
    if (peer === id) continue;
    result[peer] = id === "pax" ? { suspicion: 2, respect: 1 } : { trust: 1, respect: 1 };
  }
  return result;
}

function needsFor(index: number): Partial<Record<AgentNeedKey, number>> {
  return {
    safety: index === CHARACTER_SLOTS.length - 1 ? 42 : 58,
    trust: 50 + index * 3,
    resources: 70 - index * 4,
    status: 42 + index * 5,
    curiosity: 48 + index * 6,
    duty: index < 3 ? 82 - index * 4 : 54,
  };
}

function goalKindFor(goal: string, index: number): "protect" | "investigate" | "repair" | "reveal" | "harm" {
  if (/repair|recover|restore|component/i.test(goal)) return "repair";
  if (/proof|find|learn|investigate|report/i.test(goal)) return "investigate";
  if (/reveal|tell|confess/i.test(goal)) return "reveal";
  if (index === CHARACTER_SLOTS.length - 1) return "harm";
  return "protect";
}

function paletteFor(index: number): string[] {
  return [
    ["#f6d85f", "#f2f2e8", "#b41f2a"],
    ["#d48b3f", "#1f2735", "#f2c64f"],
    ["#2f7d52", "#f7e8a5", "#102c22"],
    ["#66c26f", "#141b28", "#e7b07d"],
    ["#2b2337", "#8d5cff", "#ddb08a"],
  ][index] ?? ["#9fc3ff", "#f4f1e8", "#273344"];
}

function locationPaletteFor(index: number, draft: AnimeLocationDraft): { ground: string; structure: string; accent: string } {
  const text = `${draft.name} ${draft.role ?? ""} ${draft.description ?? ""}`.toLowerCase();
  if (/cloud|sky|harbor|dock|mast|rookery|courier|bird/.test(text)) {
    return { ground: "#1f3f58", structure: "#6fa6c8", accent: "#f5d782" };
  }
  if (/engine|gear|clockwork|machine|piston|repair/.test(text)) {
    return { ground: "#3a3028", structure: "#9b6438", accent: "#f08a38" };
  }
  if (/moon|glass|rune|bridge/.test(text)) {
    return { ground: "#202b3d", structure: "#6b7f99", accent: "#9fc3ff" };
  }
  if (/greenhouse|botanical|conservatory|spore|seed|garden|vine|root|pond|mushroom/.test(text)) {
    return { ground: "#203d2d", structure: "#5e8f68", accent: "#d8c77a" };
  }
  if (/city|plaza|association|kiosk|overpass|apartment/.test(text)) {
    return { ground: "#2b3244", structure: "#687386", accent: "#8d5cff" };
  }
  if (/dojo|training|arena|gym/.test(text)) {
    return { ground: "#362c26", structure: "#8a4c2e", accent: "#f2c64f" };
  }
  return [
    { ground: "#283546", structure: "#5d718b", accent: "#f5d782" },
    { ground: "#3a3028", structure: "#8a4c2e", accent: "#f08a38" },
    { ground: "#243f2a", structure: "#497c4a", accent: "#b5e48c" },
    { ground: "#2f3344", structure: "#596477", accent: "#f8d44e" },
    { ground: "#27313d", structure: "#657180", accent: "#7fd0ff" },
    { ground: "#263525", structure: "#4d6540", accent: "#b58f57" },
  ][index]!;
}

function locationLandmarksFor(index: number, draft: AnimeLocationDraft): string[] {
  const text = `${draft.name} ${draft.role ?? ""} ${draft.description ?? ""}`.toLowerCase();
  const inferred = new Set<string>();
  if (/plaza|hub|ring|square/.test(text)) inferred.add("notice_board");
  if (/training|forge|repair|mast|tower/.test(text)) inferred.add(index === 1 ? "forge_chimney" : "signal_tower");
  if (/garden|apartment|home|rookery|deck/.test(text)) inferred.add(/apartment/.test(text) ? "apartment_tower" : "garden_planter");
  if (/kiosk|guild|counter|report|inn/.test(text)) inferred.add(/guild|counter/.test(text) ? "kiosk_sign" : "lantern_post");
  if (/bridge|overpass|threat|chain/.test(text)) inferred.add("bridge_span");
  if (/wood|alley|engine|danger/.test(text)) inferred.add(/engine/.test(text) ? "engine_stack" : "wood_tree");
  if (inferred.size === 0) inferred.add(["notice_board", "forge_chimney", "garden_planter", "lantern_post", "bridge_span", "wood_tree"][index] ?? "notice_board");
  return [...inferred].slice(0, 2);
}

function locationElevationFor(index: number, draft: AnimeLocationDraft): number {
  const text = `${draft.name} ${draft.role ?? ""} ${draft.description ?? ""}`.toLowerCase();
  if (/tower|mast|apartment|overpass|bridge/.test(text)) return 0.3;
  if (/engine|alley|wood/.test(text)) return -0.05;
  return index === 0 ? 0.08 : 0;
}

function locationCoordinates(index: number): { x: number; y: number; w: number; h: number } {
  return [
    { x: 240, y: 180, w: 180, h: 120 },
    { x: 40, y: 40, w: 160, h: 110 },
    { x: 460, y: 40, w: 160, h: 110 },
    { x: 240, y: 340, w: 180, h: 110 },
    { x: 40, y: 340, w: 160, h: 110 },
    { x: 460, y: 340, w: 160, h: 110 },
  ][index]!;
}

function addDuplicateIssues(issues: AnimeIngestIssue[], path: string, names: string[]): void {
  const seen = new Set<string>();
  for (const name of names) {
    const id = slugId(name);
    if (seen.has(id)) issues.push({ path, message: `Duplicate anime source entry "${name}" is not allowed.` });
    seen.add(id);
  }
}

function slugId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "anime_world";
}

function tokenize(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 3);
}
