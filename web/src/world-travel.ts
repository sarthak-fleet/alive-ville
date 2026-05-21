import type { LocationId, World } from "../../src/types.ts";

export async function movePlayerToward(locationId: string): Promise<void> {
  const { useWorldStore } = await import("./store/world.ts");
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

export function keyboardDestinationFor(world: World, key: string): LocationId | null {
  const direction = keyDirection(key);
  if (!direction) return null;
  const current = world.locations.find((location) => location.id === world.player.locationId);
  if (!current) return null;
  const currentCenter = locationCenter(current);
  const candidates = neighbors(world, current.id)
    .map((locationId) => world.locations.find((location) => location.id === locationId))
    .filter((location): location is World["locations"][number] => Boolean(location))
    .map((location) => {
      const center = locationCenter(location);
      const dx = center.x - currentCenter.x;
      const dy = center.y - currentCenter.y;
      const distance = Math.hypot(dx, dy) || 1;
      return {
        location,
        score: (dx / distance) * direction.x + (dy / distance) * direction.y,
        distance,
      };
    })
    .filter((candidate) => candidate.score > 0.25)
    .sort((a, b) => b.score - a.score || a.distance - b.distance);
  return candidates[0]?.location.id ?? null;
}

function neighbors(world: World, locationId: string): string[] {
  const result = new Set<string>();
  for (const exit of world.exits) {
    if (exit.from === locationId) result.add(exit.to);
    if (exit.bidirectional && exit.to === locationId) result.add(exit.from);
  }
  return [...result];
}

function keyDirection(key: string): { x: number; y: number } | null {
  const normalized = key.toLowerCase();
  if (normalized === "arrowup" || normalized === "w") return { x: 0, y: -1 };
  if (normalized === "arrowdown" || normalized === "s") return { x: 0, y: 1 };
  if (normalized === "arrowleft" || normalized === "a") return { x: -1, y: 0 };
  if (normalized === "arrowright" || normalized === "d") return { x: 1, y: 0 };
  return null;
}

function locationCenter(location: World["locations"][number]): { x: number; y: number } {
  return { x: location.x + location.w / 2, y: location.y + location.h / 2 };
}
