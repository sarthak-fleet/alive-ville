/**
 * opfs-save.ts — multi-slot local saves via the Origin Private File System.
 *
 * Each slot is a FULL world snapshot (not just metadata), stored as its own JSON
 * file under aliveville/saves/. That makes saves actually restorable: loading a
 * slot pushes its world back into the live session via POST /api/load. Lives
 * entirely in the browser, no server DB; durable storage is requested so saves
 * survive eviction. Cleared by "clear site data".
 */

import type { World } from '../../../src/types.ts';

const DIR = 'aliveville';
const SAVES_DIR = 'saves';

export interface SaveMeta {
  /** slot id == filename stem */
  id: string;
  name: string;
  worldId: string;
  worldTitle: string;
  playerName: string;
  day: number;
  hour: number;
  level: number;
  savedAt: string;
}

export interface SaveRecord {
  meta: SaveMeta;
  world: World;
}

export function opfsSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    Boolean(navigator.storage) &&
    typeof navigator.storage.getDirectory === 'function'
  );
}

async function savesDir(create: boolean): Promise<FileSystemDirectoryHandle | null> {
  if (!opfsSupported()) return null;
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(DIR, { create });
    return await dir.getDirectoryHandle(SAVES_DIR, { create });
  } catch {
    return null;
  }
}

function metaFromWorld(world: World, name: string, id: string): SaveMeta {
  return {
    id,
    name,
    worldId: world.id,
    worldTitle: world.story?.title ?? world.name,
    playerName: world.player.name ?? 'Wanderer',
    day: world.clock?.day ?? 1,
    hour: Math.floor(world.clock?.hour ?? 0),
    level: world.player.growth?.level ?? 1,
    savedAt: new Date().toISOString(),
  };
}

/** Auto name for a quick save: "Konoha — day 4, 13:00". */
export function defaultSaveName(world: World): string {
  const title = world.story?.title ?? world.name;
  const day = world.clock?.day ?? 1;
  const hour = Math.floor(world.clock?.hour ?? 0);
  return `${title} — day ${day}, ${String(hour).padStart(2, '0')}:00`;
}

/** Write a NEW save slot holding the full world. Returns its metadata (or null if OPFS is unavailable). */
export async function writeSave(world: World, name: string): Promise<SaveMeta | null> {
  const dir = await savesDir(true);
  if (!dir) return null;
  if (navigator.storage.persist) await navigator.storage.persist().catch(() => false);
  const slotId = `slot-${Date.now().toString(36)}-${Math.floor(world.tick ?? 0)}`;
  const meta = metaFromWorld(world, name.trim() || defaultSaveName(world), slotId);
  const handle = await dir.getFileHandle(`${slotId}.json`, { create: true });
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify({ meta, world } satisfies SaveRecord));
  await writable.close();
  return meta;
}

/** All saved slots, newest first. Corrupt files are skipped. */
export async function listSaves(): Promise<SaveMeta[]> {
  const dir = await savesDir(false);
  if (!dir) return [];
  const metas: SaveMeta[] = [];
  const entries = (dir as unknown as { values(): AsyncIterable<FileSystemHandle> }).values();
  for await (const handle of entries) {
    if (handle.kind !== 'file' || !handle.name.endsWith('.json')) continue;
    try {
      const file = await (handle as FileSystemFileHandle).getFile();
      const record = JSON.parse(await file.text()) as Partial<SaveRecord>;
      if (record?.meta?.id) metas.push(record.meta);
    } catch {
      // skip corrupt slot
    }
  }
  return metas.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/** Read one slot's full record (meta + world). */
export async function readSave(id: string): Promise<SaveRecord | null> {
  const dir = await savesDir(false);
  if (!dir) return null;
  try {
    const handle = await dir.getFileHandle(`${id}.json`, { create: false });
    const file = await handle.getFile();
    return JSON.parse(await file.text()) as SaveRecord;
  } catch {
    return null;
  }
}

export async function deleteSave(id: string): Promise<void> {
  const dir = await savesDir(false);
  if (!dir) return;
  try {
    await dir.removeEntry(`${id}.json`);
  } catch {
    // already gone
  }
}
