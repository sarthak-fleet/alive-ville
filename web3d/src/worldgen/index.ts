import type { World } from '../../../src/types.ts';
import { generateDistrict } from './district.ts';
import { generateDoors } from './interiors.ts';
import { WORLD_SCALE, type WorldModel } from './model.ts';
import { buildNavGraph } from './navgraph.ts';
import { generateStreets } from './streets.ts';

export function generateWorldModel(world: World): WorldModel {
  const minX = Math.min(...world.locations.map((l) => l.x), 0) * WORLD_SCALE;
  const minZ = Math.min(...world.locations.map((l) => l.y), 0) * WORLD_SCALE;
  const maxX = Math.max(...world.locations.map((l) => l.x + l.w), 1) * WORLD_SCALE;
  const maxZ = Math.max(...world.locations.map((l) => l.y + l.h), 1) * WORLD_SCALE;
  const bounds = { minX, minZ, maxX, maxZ };

  const districts = world.locations.map((location) => generateDistrict(world, location));
  const { streets, gates } = generateStreets(world.locations, world.exits, bounds);
  const nav = buildNavGraph(districts, streets);
  const doors = generateDoors({ districts });

  return { worldId: world.id, districts, streets, gates, nav, doors, bounds };
}

export type {
  BuildingModel,
  DistrictModel,
  ItemPlacement,
  PropModel,
  WorldModel,
} from './model.ts';
export { findDistrictPath } from './navgraph.ts';
