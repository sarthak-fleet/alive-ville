import type { World } from '../../../src/types.ts';
import { generateWorldModel } from './index.ts';
import type { WorldModel } from './model.ts';

// Static city geometry only changes when the map changes, not every tick —
// cache by map content so per-tick world updates reuse the same model object.
const modelCache = new Map<string, WorldModel>();

export function cityModelFor(world: World): WorldModel {
  const key = `${world.id}:${JSON.stringify(world.locations)}:${JSON.stringify(world.exits)}`;
  const cached = modelCache.get(key);
  if (cached) return cached;
  const model = generateWorldModel(world);
  modelCache.set(key, model);
  if (modelCache.size > 4) {
    const oldest = modelCache.keys().next().value;
    if (oldest) modelCache.delete(oldest);
  }
  return model;
}
