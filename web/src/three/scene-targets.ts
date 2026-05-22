import { activeObjectives } from "../../../src/objectives.ts";
import type { World } from "../../../src/types.ts";
import type { SceneTarget } from "./world-scene.ts";

export function reachableLocations(world: World): World["locations"] {
  const reachable = new Set<string>();
  for (const exit of world.exits) {
    if (exit.from === world.player.locationId) reachable.add(exit.to);
    if (exit.bidirectional && exit.to === world.player.locationId) reachable.add(exit.from);
  }
  return world.locations.filter((location) => reachable.has(location.id));
}

export function sceneTargetForWorld(world: World, preferredTarget: SceneTarget | null = null): SceneTarget | null {
  return validSceneTarget(world, preferredTarget) ?? objectiveSceneTargetFor(world) ?? keyboardTargetFor(world);
}

function objectiveSceneTargetFor(world: World): SceneTarget | null {
  const objective = activeObjectives(world)[0];
  if (!objective || objective.locationId !== world.player.locationId) return null;
  if (objective.targetType === "location") return null;
  if (objective.targetType === "npc") {
    const npc = world.npcs.find((candidate) => candidate.id === objective.targetId);
    return npc ? { kind: "npc", id: npc.id, label: npc.name, action: objective.actionLabel ?? "Talk" } : null;
  }
  const item = world.items.find((candidate) => candidate.id === objective.targetId);
  return item ? { kind: "item", id: item.id, label: item.name, action: objective.actionLabel ?? "Pick up" } : null;
}

function keyboardTargetFor(world: World): SceneTarget | null {
  const locationId = world.player.locationId;
  const item = world.items.find((candidate) => candidate.locationId === locationId && !candidate.holderId);
  if (item) return { kind: "item", id: item.id, label: item.name, action: "Pick up" };
  const npc = world.npcs.find((candidate) => candidate.locationId === locationId && candidate.id !== world.player.characterId);
  if (npc) return { kind: "npc", id: npc.id, label: npc.name, action: "Talk" };
  const prop = world.interactables?.find((candidate) => candidate.locationId === locationId && !candidate.inspected)
    ?? world.interactables?.find((candidate) => candidate.locationId === locationId);
  if (prop) return { kind: "prop", id: prop.id, label: prop.name, action: "Inspect" };
  return null;
}

function validSceneTarget(world: World, target: SceneTarget | null): SceneTarget | null {
  if (!target) return null;
  if (target.kind === "location") {
    return reachableLocations(world).some((location) => location.id === target.id) ? target : null;
  }
  if (target.kind === "npc") {
    const npc = world.npcs.find((candidate) => candidate.id === target.id);
    return npc?.locationId === world.player.locationId ? target : null;
  }
  if (target.kind === "item") {
    const item = world.items.find((candidate) => candidate.id === target.id);
    return item?.locationId === world.player.locationId && !item.holderId ? target : null;
  }
  const prop = world.interactables?.find((candidate) => candidate.id === target.id);
  return prop?.locationId === world.player.locationId ? target : null;
}
