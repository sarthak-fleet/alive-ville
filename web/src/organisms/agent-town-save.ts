import type { MemoryStore } from "./agent-town-memory.ts";
import { emptyUpgrades, type Upgrades } from "./agent-town-upgrades.ts";
import { initialSnapshot, type StorySnapshot } from "./agent-town-world.ts";

const STORAGE_KEY = "agent-town:save";
const SAVE_VERSION = 3;

export interface AgentTownSave {
  snapshot: StorySnapshot;
  defeated: string[];
  met: string[];
  memories: MemoryStore;
  upgrades: Upgrades;
  upgradeRewarded: string[];
}

interface PersistedShape {
  v: number;
  data: AgentTownSave;
}

export function loadSave(): AgentTownSave | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedShape;
    if (!parsed || parsed.v !== SAVE_VERSION || !parsed.data) return null;
    const snapshot = parsed.data.snapshot;
    if (!snapshot || typeof snapshot.objective !== "string") return null;
    const memories = parsed.data.memories;
    const upgradesRaw = parsed.data.upgrades;
    const upgrades: Upgrades = upgradesRaw && typeof upgradesRaw === "object"
      ? { ...emptyUpgrades(), ...upgradesRaw }
      : emptyUpgrades();
    return {
      snapshot: { ...initialSnapshot(), ...snapshot, flags: { ...initialSnapshot().flags, ...snapshot.flags } },
      defeated: Array.isArray(parsed.data.defeated) ? parsed.data.defeated.filter((id): id is string => typeof id === "string") : [],
      met: Array.isArray(parsed.data.met) ? parsed.data.met.filter((id): id is string => typeof id === "string") : [],
      memories: memories && typeof memories === "object" ? memories : {},
      upgrades,
      upgradeRewarded: Array.isArray(parsed.data.upgradeRewarded) ? parsed.data.upgradeRewarded.filter((id): id is string => typeof id === "string") : [],
    };
  } catch {
    return null;
  }
}

export function persistSave(save: AgentTownSave) {
  if (typeof window === "undefined") return;
  try {
    const shape: PersistedShape = { v: SAVE_VERSION, data: save };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(shape));
  } catch {
    // storage full or denied — ignore
  }
}

export function clearSave() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
