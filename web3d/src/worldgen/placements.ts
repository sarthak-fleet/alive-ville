import type { World } from '../../../src/types.ts';
import { itemVisualFor, stableOffset } from '../mapping/visuals.ts';
import type { DistrictModel, InteractablePlacement, ItemPlacement, NpcSpawn } from './model.ts';

export interface PlacedNpcSpawn extends NpcSpawn {
  districtId: string;
}

export interface WorldPlacements {
  items: Array<ItemPlacement & { districtId: string }>;
  interactables: Array<InteractablePlacement & { districtId: string }>;
  npcSpawns: Record<string, PlacedNpcSpawn>;
}

export function itemPlacementsFor(
  world: World,
  courtyard: { x: number; z: number; radius: number },
  locationId: string
): ItemPlacement[] {
  return world.items
    .filter((item) => item.locationId === locationId && !item.holderId)
    .map((item) => {
      const offset = stableOffset(item.id, courtyard.radius * 0.85);
      return {
        itemId: item.id,
        name: item.name,
        x: courtyard.x + offset.x,
        z: courtyard.z + offset.z,
        visual: itemVisualFor(item),
      };
    });
}

export function interactablePlacementsFor(
  world: World,
  courtyard: { x: number; z: number; radius: number },
  locationId: string,
  accentColor: string
): InteractablePlacement[] {
  return (world.interactables ?? [])
    .filter((prop) => prop.locationId === locationId)
    .map((prop) => {
      const offset = stableOffset(prop.id, courtyard.radius * 1.1);
      return {
        propId: prop.id,
        name: prop.name,
        x: courtyard.x + offset.x,
        z: courtyard.z + offset.z,
        inspected: Boolean(prop.inspected),
        accentColor,
      };
    });
}

export function npcSpawnFor(
  npcId: string,
  courtyard: { x: number; z: number; radius: number }
): NpcSpawn {
  const offset = stableOffset(npcId, courtyard.radius * 0.9);
  return {
    npcId,
    x: courtyard.x + offset.x,
    z: courtyard.z + offset.z,
    heading: Math.atan2(-offset.z, -offset.x),
  };
}

/** Dynamic, per-tick placements over a static city model. */
export function computePlacements(world: World, districts: DistrictModel[]): WorldPlacements {
  const items: WorldPlacements['items'] = [];
  const interactables: WorldPlacements['interactables'] = [];
  const npcSpawns: WorldPlacements['npcSpawns'] = {};

  for (const district of districts) {
    for (const item of itemPlacementsFor(world, district.courtyard, district.locationId)) {
      items.push({ ...item, districtId: district.locationId });
    }
    for (const prop of interactablePlacementsFor(
      world,
      district.courtyard,
      district.locationId,
      district.palette.accent
    )) {
      interactables.push({ ...prop, districtId: district.locationId });
    }
  }

  const districtById = new Map(districts.map((district) => [district.locationId, district]));
  for (const npc of world.npcs) {
    if (npc.id === world.player.characterId) continue;
    const district = districtById.get(npc.locationId);
    if (!district) continue;
    npcSpawns[npc.id] = {
      ...npcSpawnFor(npc.id, district.courtyard),
      districtId: district.locationId,
    };
  }

  return { items, interactables, npcSpawns };
}
