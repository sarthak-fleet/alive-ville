import type { Location, Npc, World } from './types.ts';

export interface StoryPhaseLocations {
  hubId: string;
  reportId: string;
}

export function storyPhaseLocations(world: World): StoryPhaseLocations {
  const hubId = world.locations[0]?.id ?? world.player.locationId;
  const reportId =
    world.locations.find((location) =>
      /report|station|kiosk|counter/i.test(location.visual?.role ?? '')
    )?.id ??
    world.locations[3]?.id ??
    hubId;
  return { hubId, reportId };
}

export function storyConfrontationTargetId(world: World): string {
  if (world.id === 'opm_z_city' && hasNpc(world, 'pax')) return 'pax';
  if (world.id === 'ashment' && hasNpc(world, 'lena')) return 'lena';
  return (
    world.villainPlans?.find((plan) => hasNpc(world, plan.actorId))?.actorId ??
    world.quests?.[2]?.giverId ??
    world.npcs.at(-1)?.id ??
    ''
  );
}

export function storyWitnessNpc(world: World): Npc | undefined {
  return (
    npcById(world, world.quests?.[2]?.giverId ?? '') ??
    npcById(world, storyConfrontationTargetId(world))
  );
}

export function storyDirectorNpc(world: World): Npc | undefined {
  return storyWitnessNpc(world) ?? world.npcs.find((npc) => npc.tier === 'quest') ?? world.npcs[0];
}

export function directorStoryBeatText(world: World): string | null {
  if (world.storyProgress?.phase === 'nightfall_warning') {
    if (world.id === 'ashment')
      return 'Director beat: The Lantern Inn should be reached before the fog thickens.';
    if (world.id === 'opm_z_city')
      return 'Director beat: The Hero Association kiosk should be reached before the monster alert spreads.';
    const { reportId } = storyPhaseLocations(world);
    const report = locationById(world, reportId);
    const tension = world.tensions?.[0]?.title.toLowerCase() ?? 'the pressure pattern';
    return `Director beat: ${report?.name ?? 'The report point'} should be reached before ${tension} escalates.`;
  }
  if (world.storyProgress?.phase === 'shadow_confrontation') {
    if (world.id === 'ashment')
      return 'Director beat: The lantern shadow is present; confronting it will force the night to resolve.';
    if (world.id === 'opm_z_city')
      return 'Director beat: The overpass challenger is in position; resolving the fight will clear this patrol loop.';
    const target = npcById(world, storyConfrontationTargetId(world));
    return `Director beat: ${target?.name ?? 'The antagonist'} is exposed; confronting them will resolve the first loop.`;
  }
  return null;
}

export function quietWorldRevealText(world: World): string {
  if (world.id === 'ashment')
    return 'The village has gone quiet enough for the bridge pattern to stand out.';
  if (world.id === 'opm_z_city')
    return 'Z-City has gone quiet enough for the overpass alert pattern to stand out.';
  const tension = world.tensions?.[0]?.title.toLowerCase() ?? 'the pressure pattern';
  return `${world.name} has gone quiet enough for ${tension} to stand out.`;
}

export function phasePressureRevealText(world: World): string | null {
  if (world.storyProgress?.phase === 'nightfall_warning') {
    if (world.id === 'ashment')
      return 'The Lantern Inn windows dim when the bridge whisper crosses the square.';
    if (world.id === 'opm_z_city')
      return 'The Hero Association kiosk lights flicker as the overpass alert spreads.';
    const { hubId, reportId } = storyPhaseLocations(world);
    const report = locationById(world, reportId);
    const hub = locationById(world, hubId);
    return `${report?.name ?? 'The report point'} gets harder to reach as pressure crosses ${hub?.name ?? world.name}.`;
  }
  if (world.storyProgress?.phase === 'shadow_confrontation') {
    if (world.id === 'ashment')
      return "Lena's lantern throws one shadow too many across the inn floor.";
    if (world.id === 'opm_z_city')
      return 'The overpass challenger is close enough that witnesses start backing away.';
    const target = npcById(world, storyConfrontationTargetId(world));
    const witness = storyWitnessNpc(world);
    return `${target?.name ?? 'The antagonist'} is exposed while ${witness?.name ?? 'a witness'} watches the pressure peak.`;
  }
  return null;
}

export function planRevealText(world: World, planId: string, stage: number): string {
  if (planId === 'bridge_whisper_plan' && world.id === 'ashment') {
    if (stage >= 3)
      return 'The bridge whisper is loud enough that loose nails tremble near the river.';
    return 'A blue pulse runs from the bridge toward every missing metal object.';
  }
  if (world.id === 'opm_z_city') {
    if (stage >= 3)
      return 'The overpass alert is loud enough that civilians are clearing the street.';
    return 'Challenge marks near the overpass line up with the next patrol route.';
  }
  const plan = world.villainPlans?.find((candidate) => candidate.id === planId);
  if (plan) {
    if (stage >= 3) return `${plan.title} is close to breaking into the open: ${plan.objective}`;
    return `${plan.title} is advancing: ${plan.knownFacts?.[0] ?? plan.objective}`;
  }
  return 'An unresolved hidden plan is pushing the world into a new stage.';
}

export function locationById(world: World, id: string): Location | undefined {
  return world.locations.find((location) => location.id === id);
}

export function npcById(world: World, id: string): Npc | undefined {
  return world.npcs.find((npc) => npc.id === id);
}

function hasNpc(world: World, id: string): boolean {
  return Boolean(npcById(world, id));
}
