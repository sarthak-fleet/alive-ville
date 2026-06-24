import { DEFAULT_HERO_APPEARANCE, DEFAULT_HERO_NAME } from './player-defaults.ts';
import type {
  DirectorState,
  Faction,
  InteractableProp,
  Item,
  Npc,
  Quest,
  VillainPlan,
  World,
  WorldRule,
  WorldTension,
} from './types.ts';

export interface CutsceneManifestEntry {
  id: string;
  worldId: string;
  storyId: string;
  arcId: string;
  order: number;
  title: string;
  moment: string;
  src: string;
  poster: string;
  triggers: Array<Record<string, unknown>>;
  unlock?: Record<string, unknown>;
}

export interface StoryPackage {
  packageVersion: 1;
  worldId: string;
  storyId: string;
  title: string;
  world: Pick<World, 'id' | 'name' | 'story' | 'locations' | 'exits'> & {
    rules: WorldRule[];
    factions: Faction[];
    tensions: WorldTension[];
    villainPlans: VillainPlan[];
    directorState?: DirectorState;
    npcs: Npc[];
    items: Item[];
    interactables: InteractableProp[];
    quests: Quest[];
  };
  assets: {
    cutscenes: CutsceneManifestEntry[];
  };
}

export interface StoryPackageIssue {
  path: string;
  message: string;
}

export function storyPackageFromWorld(
  world: World,
  cutscenes: CutsceneManifestEntry[] = []
): StoryPackage {
  const storyId =
    cutscenes.find((entry) => entry.worldId === world.id)?.storyId ??
    slugId(world.story?.title ?? world.id);
  return {
    packageVersion: 1,
    worldId: world.id,
    storyId,
    title: world.story?.title ?? world.name,
    world: {
      id: world.id,
      name: world.name,
      story: world.story,
      locations: world.locations,
      exits: world.exits,
      rules: world.rules ?? [],
      factions: world.factions ?? [],
      tensions: world.tensions ?? [],
      villainPlans: world.villainPlans ?? [],
      directorState: world.directorState,
      npcs: world.npcs,
      items: world.items,
      interactables: world.interactables ?? [],
      quests: world.quests ?? [],
    },
    assets: {
      cutscenes: cutscenes.filter((entry) => entry.worldId === world.id),
    },
  };
}

export function worldFromStoryPackage(pkg: StoryPackage): World {
  const issues = validateStoryPackage(pkg);
  if (issues.length > 0) {
    throw new Error(
      `Invalid story package: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`
    );
  }
  const startLocationId = pkg.world.locations[0]?.id ?? 'square';
  return {
    id: pkg.world.id,
    name: pkg.world.name,
    story: pkg.world.story,
    storyProgress: { phase: 'starter', unlockedCutsceneIds: [], playedCutsceneIds: [] },
    tick: 0,
    player: {
      locationId: startLocationId,
      name: DEFAULT_HERO_NAME,
      appearance: DEFAULT_HERO_APPEARANCE,
    },
    clock: { hoursPerTick: 2, hour: 8, day: 1 },
    rules: pkg.world.rules,
    factions: pkg.world.factions,
    tensions: pkg.world.tensions,
    villainPlans: pkg.world.villainPlans,
    directorState: pkg.world.directorState ?? { pressure: 0, quietTicks: 0, pendingReveals: [] },
    locations: pkg.world.locations,
    exits: pkg.world.exits,
    npcs: pkg.world.npcs,
    items: pkg.world.items,
    interactables: pkg.world.interactables,
    quests: pkg.world.quests,
    eventLog: [],
  };
}

function slugId(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'story'
  );
}

export function validateStoryPackage(pkg: StoryPackage): StoryPackageIssue[] {
  const issues: StoryPackageIssue[] = [];
  if (pkg.packageVersion !== 1)
    issues.push({ path: 'packageVersion', message: 'Only packageVersion 1 is supported.' });
  if (!pkg.worldId) issues.push({ path: 'worldId', message: 'worldId is required.' });
  if (!pkg.storyId) issues.push({ path: 'storyId', message: 'storyId is required.' });
  if (pkg.world.id !== pkg.worldId)
    issues.push({ path: 'world.id', message: 'world.id must match package worldId.' });

  const locationIds = new Set(pkg.world.locations.map((location) => location.id));
  const npcIds = new Set(pkg.world.npcs.map((npc) => npc.id));
  const itemIds = new Set(pkg.world.items.map((item) => item.id));
  const questIds = new Set(pkg.world.quests.map((quest) => quest.id));
  const cutsceneIds = new Set(pkg.assets.cutscenes.map((cutscene) => cutscene.id));
  const worldRefs = new Set([...locationIds, ...npcIds, ...itemIds, 'player']);

  addDuplicateIssues(
    issues,
    'world.locations',
    pkg.world.locations.map((location) => location.id)
  );
  addDuplicateIssues(
    issues,
    'world.npcs',
    pkg.world.npcs.map((npc) => npc.id)
  );
  addDuplicateIssues(
    issues,
    'world.items',
    pkg.world.items.map((item) => item.id)
  );
  addDuplicateIssues(
    issues,
    'world.interactables',
    pkg.world.interactables.map((prop) => prop.id)
  );
  addDuplicateIssues(
    issues,
    'world.quests',
    pkg.world.quests.map((quest) => quest.id)
  );
  addDuplicateIssues(
    issues,
    'assets.cutscenes',
    pkg.assets.cutscenes.map((cutscene) => cutscene.id)
  );

  for (const exit of pkg.world.exits) {
    if (!locationIds.has(exit.from)) {
      issues.push({
        path: `world.exits.${exit.from}->${exit.to}.from`,
        message: 'Exit source location must exist in the package world.',
      });
    }
    if (!locationIds.has(exit.to)) {
      issues.push({
        path: `world.exits.${exit.from}->${exit.to}.to`,
        message: 'Exit target location must exist in the package world.',
      });
    }
  }
  for (const npc of pkg.world.npcs) {
    if (!locationIds.has(npc.locationId)) {
      issues.push({
        path: `world.npcs.${npc.id}.locationId`,
        message: 'NPC location must exist in the package world.',
      });
    }
  }
  for (const item of pkg.world.items) {
    if (item.locationId && !locationIds.has(item.locationId)) {
      issues.push({
        path: `world.items.${item.id}.locationId`,
        message: 'Item location must exist in the package world.',
      });
    }
    if (item.holderId && item.holderId !== 'player' && !npcIds.has(item.holderId)) {
      issues.push({
        path: `world.items.${item.id}.holderId`,
        message: 'Item holder must be player or an NPC in the package world.',
      });
    }
  }
  for (const prop of pkg.world.interactables) {
    if (!locationIds.has(prop.locationId)) {
      issues.push({
        path: `world.interactables.${prop.id}.locationId`,
        message: 'Interactable location must exist in the package world.',
      });
    }
    if (prop.relatedQuestId && !questIds.has(prop.relatedQuestId)) {
      issues.push({
        path: `world.interactables.${prop.id}.relatedQuestId`,
        message: 'Interactable related quest must exist in the package quest list.',
      });
    }
    for (const involvedId of prop.involvedIds ?? []) {
      if (!worldRefs.has(involvedId)) {
        issues.push({
          path: `world.interactables.${prop.id}.involvedIds`,
          message: `Interactable involved id "${involvedId}" must reference a known NPC, item, location, or player.`,
        });
      }
    }
  }
  for (const quest of pkg.world.quests) {
    if (quest.giverId && !npcIds.has(quest.giverId)) {
      issues.push({
        path: `world.quests.${quest.id}.giverId`,
        message: 'Quest giver must exist in the package NPC list.',
      });
    }
  }
  for (const tension of pkg.world.tensions) {
    for (const involvedId of tension.involvedIds ?? []) {
      if (!worldRefs.has(involvedId)) {
        issues.push({
          path: `world.tensions.${tension.id}.involvedIds`,
          message: `Tension involved id "${involvedId}" must reference a known NPC, item, location, or player.`,
        });
      }
    }
  }
  for (const plan of pkg.world.villainPlans) {
    if (!npcIds.has(plan.actorId)) {
      issues.push({
        path: `world.villainPlans.${plan.id}.actorId`,
        message: 'Villain plan actor must exist in the package NPC list.',
      });
    }
  }
  for (const cutscene of pkg.assets.cutscenes) {
    if (cutscene.worldId !== pkg.worldId) {
      issues.push({
        path: `assets.cutscenes.${cutscene.id}.worldId`,
        message: 'Cutscene worldId must match package worldId.',
      });
    }
    if (!cutsceneIds.has(cutscene.id)) {
      issues.push({
        path: `assets.cutscenes.${cutscene.id}.id`,
        message: 'Cutscene id is required.',
      });
    }
    if (!cutscene.src) {
      issues.push({
        path: `assets.cutscenes.${cutscene.id}.src`,
        message: 'Cutscene src is required.',
      });
    }
    if (!cutscene.poster) {
      issues.push({
        path: `assets.cutscenes.${cutscene.id}.poster`,
        message: 'Cutscene poster is required.',
      });
    }
  }
  return issues;
}

function addDuplicateIssues(issues: StoryPackageIssue[], path: string, ids: string[]): void {
  const seen = new Set<string>();
  const reported = new Set<string>();
  for (const id of ids) {
    if (!id) {
      issues.push({ path, message: 'IDs must be non-empty strings.' });
      continue;
    }
    if (!seen.has(id)) {
      seen.add(id);
      continue;
    }
    if (reported.has(id)) continue;
    reported.add(id);
    issues.push({ path: `${path}.${id}`, message: `Duplicate id "${id}" is not allowed.` });
  }
}
