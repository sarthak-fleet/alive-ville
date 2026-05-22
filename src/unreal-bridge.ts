import { activeObjectives } from "./objectives.ts";
import type { Item, Npc, TickSummary, World } from "./types.ts";

const WORLD_TO_UNREAL_CM = 10;

export interface UnrealVector {
  x: number;
  y: number;
  z: number;
}

export interface UnrealColor {
  hex: string;
}

export interface UnrealLocationNode {
  id: string;
  name: string;
  center: UnrealVector;
  size: UnrealVector;
  active: boolean;
  role: string | null;
  description: string | null;
  groundColor: UnrealColor;
  structureColor: UnrealColor;
  accentColor: UnrealColor;
  visualTags: string[];
  landmarks: string[];
}

export interface UnrealActorNode {
  id: string;
  name: string;
  locationId: string;
  position: UnrealVector;
  role: string | null;
  player: boolean;
  quest: boolean;
  mood: string | null;
  silhouette: string | null;
  palette: string[];
}

export interface UnrealItemNode {
  id: string;
  name: string;
  locationId: string;
  position: UnrealVector;
  shape: string | null;
  material: string | null;
  color: UnrealColor;
  emissiveColor: UnrealColor;
}

export interface UnrealPropNode {
  id: string;
  name: string;
  locationId: string;
  position: UnrealVector;
  inspected: boolean;
  clueTags: string[];
}

export interface UnrealObjectiveNode {
  id: string;
  questTitle: string;
  text: string;
  locationId: string;
  targetType: string;
  targetId: string;
  actionLabel: string;
  position: UnrealVector;
  primary: boolean;
}

export interface UnrealExitNode {
  from: string;
  to: string;
  bidirectional: boolean;
  label: string | null;
}

export interface UnrealWorldState {
  protocol: "ashment-unreal-v1";
  worldId: string;
  worldName: string;
  storyTitle: string | null;
  tick: number;
  clock: {
    day: number;
    hour: number;
  };
  playerLocationId: string;
  locations: UnrealLocationNode[];
  exits: UnrealExitNode[];
  actors: UnrealActorNode[];
  items: UnrealItemNode[];
  props: UnrealPropNode[];
  objectives: UnrealObjectiveNode[];
  recentActivity: string[];
  agentLoop: {
    state: string;
    ticksRun: number;
    checkpointTicks: number[];
  };
}

export interface UnrealAgentLoopStatus {
  state: string;
  ticksRun: number;
  checkpoints?: Array<{ tick: number }>;
}

export function unrealWorldStateFromWorld(
  world: World,
  agentLoop: UnrealAgentLoopStatus = { state: "idle", ticksRun: 0, checkpoints: [] }
): UnrealWorldState {
  const locations = world.locations.map((location): UnrealLocationNode => ({
    id: location.id,
    name: location.name,
    center: worldPoint(location.x + location.w / 2, location.y + location.h / 2, (location.visual?.elevation ?? 0) * 220),
    size: { x: location.w * WORLD_TO_UNREAL_CM, y: location.h * WORLD_TO_UNREAL_CM, z: 80 + Math.round((location.visual?.elevation ?? 0) * 120) },
    active: location.id === world.player.locationId,
    role: location.visual?.role ?? null,
    description: location.visual?.description ?? null,
    groundColor: color(location.visual?.palette?.ground, "#263f3a"),
    structureColor: color(location.visual?.palette?.structure, "#334768"),
    accentColor: color(location.visual?.palette?.accent, "#f8d44e"),
    visualTags: location.visual?.visualTags ?? [],
    landmarks: location.visual?.landmarks ?? [],
  }));
  const actors = [
    playerActor(world),
    ...world.npcs.filter((npc) => npc.id !== world.player.characterId).map((npc) => npcActor(world, npc)),
  ];
  return {
    protocol: "ashment-unreal-v1",
    worldId: world.id,
    worldName: world.name,
    storyTitle: world.story?.title ?? null,
    tick: world.tick,
    clock: {
      day: world.clock.day,
      hour: world.clock.hour,
    },
    playerLocationId: world.player.locationId,
    locations,
    exits: world.exits.map((exit): UnrealExitNode => ({
      from: exit.from,
      to: exit.to,
      bidirectional: exit.bidirectional ?? false,
      label: exit.label ?? null,
    })),
    actors,
    items: world.items.filter((item) => Boolean(item.locationId) && !item.holderId).map((item) => itemNode(world, item)),
    props: (world.interactables ?? []).map((prop, index): UnrealPropNode => ({
      id: prop.id,
      name: prop.name,
      locationId: prop.locationId,
      position: offsetInLocation(world, prop.locationId, index, 90),
      inspected: prop.inspected ?? false,
      clueTags: prop.clueTags ?? [],
    })),
    objectives: activeObjectives(world).slice(0, 4).map((objective, index): UnrealObjectiveNode => ({
      id: objective.questId,
      questTitle: objective.questTitle,
      text: objective.text,
      locationId: objective.locationId,
      targetType: objective.targetType,
      targetId: objective.targetId,
      actionLabel: objective.actionLabel ?? defaultActionLabel(objective.targetType),
      position: objectivePosition(world, objective.locationId, objective.targetId, index),
      primary: index === 0,
    })),
    recentActivity: recentActivity(world.eventLog),
    agentLoop: {
      state: agentLoop.state,
      ticksRun: agentLoop.ticksRun,
      checkpointTicks: (agentLoop.checkpoints ?? []).map((checkpoint) => checkpoint.tick),
    },
  };
}

function playerActor(world: World): UnrealActorNode {
  const location = world.locations.find((candidate) => candidate.id === world.player.locationId);
  return {
    id: world.player.characterId ?? "player",
    name: world.player.name ?? "Player",
    locationId: world.player.locationId,
    position: location ? worldPoint(location.x + location.w / 2, location.y + location.h / 2, 170) : { x: 0, y: 0, z: 170 },
    role: "player",
    player: true,
    quest: false,
    mood: null,
    silhouette: world.player.appearance?.silhouette ?? null,
    palette: world.player.appearance?.palette ?? [],
  };
}

function npcActor(world: World, npc: Npc): UnrealActorNode {
  const objectiveTargetIds = new Set(activeObjectives(world).map((objective) => objective.targetId));
  return {
    id: npc.id,
    name: npc.name,
    locationId: npc.locationId,
    position: offsetInLocation(world, npc.locationId, stableIndex(npc.id), 170),
    role: npc.role ?? null,
    player: false,
    quest: objectiveTargetIds.has(npc.id),
    mood: npc.mood?.emotion ?? null,
    silhouette: npc.appearance?.silhouette ?? null,
    palette: npc.appearance?.palette ?? [],
  };
}

function itemNode(world: World, item: Item): UnrealItemNode {
  return {
    id: item.id,
    name: item.name,
    locationId: item.locationId ?? world.player.locationId,
    position: offsetInLocation(world, item.locationId ?? world.player.locationId, stableIndex(item.id), 96),
    shape: item.visual?.shape ?? itemShape(item),
    material: item.visual?.material ?? itemMaterial(item),
    color: color(item.visual?.palette?.primary, "#d8c17a"),
    emissiveColor: color(item.visual?.palette?.emissive, "#f8d44e"),
  };
}

function itemShape(item: Item): string {
  const text = `${item.id} ${item.name} ${item.description ?? ""}`.toLowerCase();
  if (text.includes("shear") || text.includes("gear") || text.includes("tool")) return "gear";
  if (text.includes("note") || text.includes("badge")) return "note";
  if (text.includes("key") || text.includes("token")) return "token";
  if (text.includes("radio") || text.includes("lens")) return "radio";
  return "trinket";
}

function itemMaterial(item: Item): string {
  const text = `${item.id} ${item.name} ${item.description ?? ""}`.toLowerCase();
  if (text.includes("shear") || text.includes("gear") || text.includes("tool") || text.includes("key")) return "metal";
  if (text.includes("herb") || text.includes("shell") || text.includes("moonmint")) return "organic";
  if (text.includes("note") || text.includes("badge")) return "paper";
  if (text.includes("radio") || text.includes("lens")) return "radio";
  return "crystal";
}

function objectivePosition(world: World, locationId: string, targetId: string, index: number): UnrealVector {
  const npc = world.npcs.find((candidate) => candidate.id === targetId);
  if (npc) return offsetInLocation(world, npc.locationId, stableIndex(npc.id), 240);
  const item = world.items.find((candidate) => candidate.id === targetId);
  if (item?.locationId) return offsetInLocation(world, item.locationId, stableIndex(item.id), 220);
  return offsetInLocation(world, locationId, index, 260);
}

function offsetInLocation(world: World, locationId: string, index: number, z: number): UnrealVector {
  const location = world.locations.find((candidate) => candidate.id === locationId);
  if (!location) return { x: 0, y: 0, z };
  const angle = (index % 8) * (Math.PI / 4);
  const radiusX = Math.max(180, location.w * WORLD_TO_UNREAL_CM * 0.24);
  const radiusY = Math.max(140, location.h * WORLD_TO_UNREAL_CM * 0.24);
  const center = worldPoint(location.x + location.w / 2, location.y + location.h / 2, z);
  return {
    x: Math.round(center.x + Math.cos(angle) * radiusX),
    y: Math.round(center.y + Math.sin(angle) * radiusY),
    z,
  };
}

function worldPoint(x: number, y: number, z: number): UnrealVector {
  return {
    x: Math.round(x * WORLD_TO_UNREAL_CM),
    y: Math.round(y * WORLD_TO_UNREAL_CM),
    z: Math.round(z),
  };
}

function color(value: string | undefined, fallback: string): UnrealColor {
  return { hex: normalizeHex(value ?? fallback) };
}

function normalizeHex(value: string): string {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toUpperCase();
  return "#F8D44E";
}

function stableIndex(id: string): number {
  return [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function defaultActionLabel(targetType: string): string {
  if (targetType === "npc") return "Talk";
  if (targetType === "item") return "Pick up";
  return "Go";
}

function recentActivity(log: TickSummary[]): string[] {
  return log
    .slice(-5)
    .flatMap((summary) => summary.actions.map((entry) => entry.text))
    .slice(-8);
}
