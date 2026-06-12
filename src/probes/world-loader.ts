import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createEngine } from "../simulation.ts";
import type { World } from "../types.ts";

const DEFAULT_WORLD_PATH = "worlds/village.json";

/** Loads and hydrates a world JSON, returning a deep-cloned live instance.
 *  Each call returns an independent copy safe for mutation by individual probes. */
export function loadProbeWorld(worldPath?: string, rootDir = process.cwd()): World {
  const resolved = join(rootDir, worldPath ?? DEFAULT_WORLD_PATH);
  const raw = JSON.parse(readFileSync(resolved, "utf8")) as World;
  // structuredClone isolates the probe from other parallel clones
  const clone = structuredClone(raw) as World;
  return createEngine(clone).state;
}

/** Snapshot a world to a plain object so probes can reset per-session. */
export function snapshotWorld(world: World): World {
  return structuredClone(world) as World;
}
