import type { Snapshot } from "./api/client.ts";

export const QUICK_SAVE_SLOT_KEY = "ai-game.quick-save.v1";

export interface QuickSaveSlot {
  savedAt: string;
  worldId: string;
  worldName: string;
  day: number;
  hour: number;
  tick: number;
  snapshot: Snapshot;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function saveQuickSlot(storage: StorageLike, snapshot: Snapshot): QuickSaveSlot {
  const slot: QuickSaveSlot = {
    savedAt: new Date().toISOString(),
    worldId: snapshot.world.id,
    worldName: snapshot.world.name,
    day: snapshot.world.clock.day,
    hour: snapshot.world.clock.hour,
    tick: snapshot.world.tick,
    snapshot,
  };
  storage.setItem(QUICK_SAVE_SLOT_KEY, JSON.stringify(slot));
  return slot;
}

export function loadQuickSlot(storage: StorageLike): QuickSaveSlot | null {
  const raw = storage.getItem(QUICK_SAVE_SLOT_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as Partial<QuickSaveSlot>;
  if (!parsed.snapshot?.world?.id || !parsed.snapshot.world.clock) {
    storage.removeItem(QUICK_SAVE_SLOT_KEY);
    return null;
  }
  return parsed as QuickSaveSlot;
}

export function describeQuickSlot(slot: QuickSaveSlot): string {
  return `${slot.worldName} · Day ${slot.day}, ${String(slot.hour).padStart(2, "0")}:00 · t${slot.tick}`;
}
