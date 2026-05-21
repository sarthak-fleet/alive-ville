import type { World } from "../../src/types.ts";
import { useWorldStore } from "./store/world.ts";

export async function movePlayerToward(locationId: string): Promise<void> {
  const world = useWorldStore.getState().world;
  if (!world || world.player.locationId === locationId) return;
  const route = shortestLocationRoute(world, world.player.locationId, locationId);
  for (const step of route) {
    await useWorldStore.getState().send({ type: "move", locationId: step } as never);
    const latest = useWorldStore.getState().world;
    if (!latest || latest.player.locationId !== step) break;
  }
}

export function shortestLocationRoute(world: World, fromId: string, toId: string): string[] {
  if (fromId === toId) return [];
  const queue = [fromId];
  const previous = new Map<string, string | null>([[fromId, null]]);

  for (let i = 0; i < queue.length; i += 1) {
    const current = queue[i]!;
    if (current === toId) break;
    for (const next of neighbors(world, current)) {
      if (previous.has(next)) continue;
      previous.set(next, current);
      queue.push(next);
    }
  }

  if (!previous.has(toId)) return [];
  const route: string[] = [];
  let current: string | null = toId;
  while (current && current !== fromId) {
    route.push(current);
    current = previous.get(current) ?? null;
  }
  return route.reverse();
}

function neighbors(world: World, locationId: string): string[] {
  const result = new Set<string>();
  for (const exit of world.exits) {
    if (exit.from === locationId) result.add(exit.to);
    if (exit.bidirectional && exit.to === locationId) result.add(exit.from);
  }
  return [...result];
}
