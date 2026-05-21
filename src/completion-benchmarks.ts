import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createEngine } from "./simulation.ts";
import { type CutsceneManifestEntry,storyPackageFromWorld, validateStoryPackage } from "./story-package.ts";
import type { Npc, World } from "./types.ts";

export type CompletionBenchmarkId =
  | "lore_ingestion"
  | "character_simulation"
  | "narrative_director"
  | "game_runtime"
  | "media_cutscene";

export interface CompletionBenchmark {
  id: CompletionBenchmarkId;
  label: string;
  score: number;
  passed: string[];
  missing: string[];
}

const TARGET_SCORE = 80;

interface WebEvidence {
  appHeader: boolean;
  phaserScene: boolean;
  quickSave: boolean;
  cutscenePlayer: boolean;
  fightOverlay: boolean;
  audio: boolean;
}

interface TestEvidence {
  firstLoop: boolean;
  basicV0: boolean;
  alive: boolean;
  opm: boolean;
  saveSlots: boolean;
  storyPackage: boolean;
  director: boolean;
  agentState: boolean;
}

export function projectCompletionBenchmarks(rootDir = process.cwd()): CompletionBenchmark[] {
  const ashbend = hydrateWorld(readWorld(rootDir, "worlds/village.json"));
  const secondWorld = hydrateWorld(readWorld(rootDir, "worlds/one-punch-man.json"));
  const cutscenes = readJson<CutsceneManifestEntry[]>(rootDir, "web/assets/cutscenes/manifest.json", []);
  const webFiles: WebEvidence = {
    appHeader: existsSync(join(rootDir, "web/src/organisms/AppHeader.tsx")),
    phaserScene: existsSync(join(rootDir, "web/src/phaser/VillageScene.ts")),
    quickSave: existsSync(join(rootDir, "web/src/save-slots.ts")),
    cutscenePlayer: existsSync(join(rootDir, "web/src/organisms/CutscenePlayer.tsx")),
    fightOverlay: existsSync(join(rootDir, "web/src/organisms/FightCinematicOverlay.tsx")),
    audio: existsSync(join(rootDir, "web/src/audio.ts")),
  };
  const tests: TestEvidence = {
    firstLoop: existsSync(join(rootDir, "tests/playtests/first-loop.ts")),
    basicV0: existsSync(join(rootDir, "tests/playtests/basic-v0.ts")),
    alive: existsSync(join(rootDir, "tests/playtests/alive-village.ts")),
    opm: existsSync(join(rootDir, "tests/playtests/opm-world.ts")),
    saveSlots: existsSync(join(rootDir, "tests/save-slots.test.ts")),
    storyPackage: existsSync(join(rootDir, "tests/story-package.test.ts")),
    director: existsSync(join(rootDir, "tests/director.test.ts")),
    agentState: existsSync(join(rootDir, "tests/agent-state.test.ts")),
  };

  return [
    loreBenchmark(ashbend, secondWorld, cutscenes, tests),
    characterBenchmark(ashbend, secondWorld, tests),
    directorBenchmark(ashbend, secondWorld, tests),
    runtimeBenchmark(ashbend, secondWorld, webFiles, tests),
    mediaBenchmark(ashbend, secondWorld, cutscenes, webFiles),
  ];
}

export function assertCompletionTarget(benchmarks: CompletionBenchmark[], target = TARGET_SCORE): void {
  const failed = benchmarks.filter((benchmark) => benchmark.score < target);
  if (failed.length > 0) {
    throw new Error(failed.map((benchmark) => `${benchmark.label}: ${benchmark.score}%`).join("; "));
  }
}

function loreBenchmark(
  ashbend: World,
  secondWorld: World,
  cutscenes: CutsceneManifestEntry[],
  tests: { storyPackage: boolean; opm: boolean }
): CompletionBenchmark {
  return score("lore_ingestion", "Lore Ingestion / World Compiler", [
    check(Boolean(secondWorld), "second structured world fixture exists", "add a second structured world fixture"),
    check(Boolean(secondWorld && validateStoryPackage(storyPackageFromWorld(secondWorld, cutscenes)).length === 0), "second world exports as a valid story package", "make the second world package-valid"),
    check(hasAll(ashbend, ["locations", "exits", "npcs", "items", "quests", "interactables"]), "primary world includes playable schema pieces", "complete primary world schema pieces"),
    check(hasAll(secondWorld, ["locations", "exits", "npcs", "items", "quests", "interactables"]), "second world includes playable schema pieces", "complete second world schema pieces"),
    check(hasFactionTensionAndPlans(ashbend) && hasFactionTensionAndPlans(secondWorld), "world packages carry factions, tensions, and villain plans", "add factions, tensions, and villain plans to both worlds"),
    check(hasAppearanceData(secondWorld), "second world carries appearance metadata", "add appearance metadata to second world characters"),
    check(cutscenes.some((entry) => entry.worldId === ashbend.id), "cutscene references are package-exportable", "add cutscene manifest references"),
    check(tests.storyPackage && tests.opm, "package and second-world tests exist", "add package and second-world tests"),
  ]);
}

function characterBenchmark(ashbend: World, secondWorld: World | null, tests: { agentState: boolean }): CompletionBenchmark {
  return score("character_simulation", "Character / Agent Simulation", [
    check(allNpcsHave(ashbend, hasMemory), "NPCs have memories", "seed memories for every primary NPC"),
    check(allNpcsHave(ashbend, hasRelationships), "NPC relationships are stateful", "add relationship state to NPCs"),
    check(allNpcsHave(ashbend, hasAgentState), "NPCs have needs, moods, ambitions, and secrets/plans where relevant", "fill out agent state"),
    check(allNpcsHave(ashbend, hasSchedule), "NPC schedules drive routine movement", "add schedules to NPC plans"),
    check(hasQuestAftermathEvidence(), "quest outcomes branch through relationship and memory state", "wire quest aftermath into memory and relationships"),
    check(hasDialogueMemoryEvidence(), "dialogue surfaces relevant memory and intent", "surface memory/intent in dialogue"),
    check(allNpcsHave(secondWorld, hasAppearanceOrRole), "second-world characters carry roles or appearance", "add role/appearance data to second-world NPCs"),
    check(tests.agentState, "agent-state tests exist", "add agent-state tests"),
  ]);
}

function directorBenchmark(ashbend: World, secondWorld: World | null, tests: { director: boolean }): CompletionBenchmark {
  return score("narrative_director", "Narrative Director / Story Orchestrator", [
    check(Boolean(ashbend.directorState), "director state exists", "add director state"),
    check(Boolean(ashbend.villainPlans?.length && secondWorld?.villainPlans?.length), "villain plans exist in both worlds", "add villain plans to both worlds"),
    check(Boolean(ashbend.tensions?.length && secondWorld?.tensions?.length), "tensions exist in both worlds", "add world tensions"),
    check(hasDirectorEscalationEvidence(), "ignored pressure escalates into reveals and statuses", "make pressure escalation visible"),
    check(hasCounterplayEvidence(), "escalated pressure exposes counterplay", "add player-facing counterplay hints"),
    check(hasStoryPhaseEvidence(), "story phases produce recoverable objectives", "add story phase objectives"),
    check(hasResolutionEvidence(), "player action can resolve pressure source", "add direct resolution actions"),
    check(tests.director, "director tests exist", "add director tests"),
  ]);
}

function runtimeBenchmark(
  ashbend: World,
  secondWorld: World,
  webFiles: WebEvidence,
  tests: TestEvidence
): CompletionBenchmark {
  return score("game_runtime", "Game Runtime / Spatial UX", [
    check(webFiles.phaserScene, "Phaser 2D runtime exists", "add Phaser runtime"),
    check(Boolean(ashbend.exits.length && secondWorld?.exits.length), "rooms and travel graph exist", "add reliable room exits"),
    check(Boolean(ashbend.quests?.length && ashbend.items.length && ashbend.interactables?.length), "quests, items, and inspectable props exist", "add quests, items, and props"),
    check(webFiles.appHeader && webFiles.quickSave, "file save/load and browser quick slot exist", "add resumable save/load"),
    check(hasCombatEvidence(), "stateful fights are playable", "add stateful fight flow"),
    check(hasObjectiveEvidence(), "objectives and hints drive the loop", "add objective/hint UI"),
    check(tests.firstLoop && tests.basicV0 && tests.alive && tests.opm, "browser playtests cover first loop, full loop, alive village, and second world", "add browser playtests"),
    check(tests.saveSlots, "quick-save unit tests exist", "test quick-save slots"),
  ]);
}

function mediaBenchmark(
  ashbend: World,
  secondWorld: World,
  cutscenes: CutsceneManifestEntry[],
  webFiles: WebEvidence
): CompletionBenchmark {
  return score("media_cutscene", "Media / Cutscene Layer", [
    check(cutscenes.filter((entry) => entry.worldId === ashbend.id).length >= 5, "primary world has a shipped cutscene catalog", "ship a fuller cutscene catalog"),
    check(cutscenes.every((entry) => assetExists(entry.src) && assetExists(entry.poster)), "cutscene videos and posters exist", "add missing cutscene media files"),
    check(hasAppearanceData(ashbend) && hasAppearanceData(secondWorld), "characters have appearance metadata", "add character appearance metadata"),
    check(hasPortraitAssets(secondWorld), "anime test world uses local portrait assets", "add portrait assets"),
    check(webFiles.cutscenePlayer, "cutscene player exists", "add cutscene playback UI"),
    check(webFiles.fightOverlay, "fight presentation overlay exists", "add fight presentation overlay"),
    check(webFiles.audio, "local ambience, SFX, and music layer exists", "add local audio layer"),
    check(hasActorRenderEvidence(), "Phaser actor rendering uses character presentation metadata", "wire appearance into actor rendering"),
  ]);
}

function score(id: CompletionBenchmarkId, label: string, checks: Array<{ ok: boolean; passed: string; missing: string }>): CompletionBenchmark {
  const passed = checks.filter((item) => item.ok).map((item) => item.passed);
  const missing = checks.filter((item) => !item.ok).map((item) => item.missing);
  return { id, label, score: Math.round((passed.length / checks.length) * 100), passed, missing };
}

function check(ok: boolean, passed: string, missing: string): { ok: boolean; passed: string; missing: string } {
  return { ok, passed, missing };
}

function readWorld(rootDir: string, path: string): World {
  return readJson<World>(rootDir, path);
}

function readJson<T>(rootDir: string, path: string, fallback?: T): T {
  try {
    return JSON.parse(readFileSync(join(rootDir, path), "utf8")) as T;
  } catch {
    if (fallback !== undefined) return fallback;
    throw new Error(`Unable to read ${path}`);
  }
}

function hydrateWorld(world: World): World {
  return createEngine(world).state;
}

function hasAll(world: World | null, keys: Array<keyof World>): boolean {
  return Boolean(world && keys.every((key) => Array.isArray(world[key]) ? (world[key] as unknown[]).length > 0 : Boolean(world[key])));
}

function allNpcsHave(world: World | null, predicate: (npc: Npc) => boolean): boolean {
  return Boolean(world?.npcs.length && world.npcs.every(predicate));
}

function hasMemory(npc: Npc): boolean {
  return npc.memories.length > 0;
}

function hasRelationships(npc: Npc): boolean {
  return Object.keys(npc.relationships ?? {}).length > 0 || Object.keys(npc.relationshipAxes ?? {}).length > 0;
}

function hasAgentState(npc: Npc): boolean {
  return Boolean(npc.needs && npc.mood && npc.ambitions?.length && npc.plan?.currentIntent);
}

function hasSchedule(npc: Npc): boolean {
  return Boolean(npc.plan?.schedule?.length);
}

function hasAppearanceOrRole(npc: Npc): boolean {
  return Boolean(npc.appearance || npc.role);
}

function hasFactionTensionAndPlans(world: World | null): boolean {
  return Boolean(world?.factions?.length && world.tensions?.length && world.villainPlans?.length);
}

function hasAppearanceData(world: World | null): boolean {
  return Boolean(world?.npcs.length && world.npcs.filter((npc) => npc.appearance).length >= Math.min(3, world.npcs.length));
}

function hasPortraitAssets(world: World | null): boolean {
  return Boolean(world?.npcs.some((npc) => npc.appearance?.portrait && assetExists(npc.appearance.portrait)));
}

function assetExists(src: string): boolean {
  const path = src.startsWith("/") ? src.slice(1) : src;
  return existsSync(join(process.cwd(), "web", path.replace(/^assets\//, "assets/"))) || existsSync(join(process.cwd(), path));
}

function sourceIncludes(path: string, terms: string[]): boolean {
  try {
    const text = readFileSync(join(process.cwd(), path), "utf8");
    return terms.every((term) => text.includes(term));
  } catch {
    return false;
  }
}

function hasQuestAftermathEvidence(): boolean {
  return sourceIncludes("src/simulation.ts", ["applyQuestCompletionConsequences", "questRelationshipBranch", "questConsequenceLine"]);
}

function hasDialogueMemoryEvidence(): boolean {
  return sourceIncludes("web/src/organisms/NpcDrawer.tsx", ["retrieveRelevantMemories", "currentIntent", "Relevant memory"]);
}

function hasDirectorEscalationEvidence(): boolean {
  return sourceIncludes("src/agents.ts", ["advanceStoryPressure", "Tension escalated", "addPendingReveal"]);
}

function hasCounterplayEvidence(): boolean {
  return sourceIncludes("src/agents.ts", ["counterplayForTension"]) && sourceIncludes("web/src/organisms/StoryPanel.tsx", ["Counter:"]);
}

function hasStoryPhaseEvidence(): boolean {
  return sourceIncludes("src/story-progress.ts", ["nightfall_warning", "shadow_confrontation", "dawn_after_tasks"]);
}

function hasResolutionEvidence(): boolean {
  return sourceIncludes("src/simulation.ts", ["resolveShadowConfrontation", "resolveFightConsequences"]);
}

function hasCombatEvidence(): boolean {
  return sourceIncludes("src/combat.ts", ["CombatMove"]) && sourceIncludes("src/simulation.ts", ["applyFightDamage"]);
}

function hasObjectiveEvidence(): boolean {
  return sourceIncludes("src/objectives.ts", ["activeObjectives"]) && sourceIncludes("src/hints.ts", ["questHintsFor"]);
}

function hasActorRenderEvidence(): boolean {
  return sourceIncludes("web/src/phaser/actor-render.ts", ["CharacterAppearance", "appearance", "visualTags"]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const benchmarks = projectCompletionBenchmarks();
  for (const benchmark of benchmarks) {
    console.info(`${benchmark.score}% ${benchmark.label}`);
    for (const missing of benchmark.missing) console.info(`  missing: ${missing}`);
  }
  assertCompletionTarget(benchmarks);
}
