import { existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_HERO_APPEARANCE } from './player-defaults.ts';
import type { Npc, World } from './types.ts';

// ---------------------------------------------------------------------------
// Style constants

const STYLE_LOCK =
  'anime character portrait, bust shot, clean cel shading, soft toon lighting, plain dark background, single character, facing viewer';

// Modal deployment URL — read per-call so tests can stub the env. The
// Z-Image-Turbo container loads the model once and stays warm for ~2 min
// between calls; cold start ~30s.
function portraitUrl(): string {
  return process.env['PORTRAIT_URL'] ?? '';
}

// Portraits directory relative to project root (web3d/public so vite copies it)
const PORTRAITS_DIR = fileURLToPath(new URL('../web3d/public/assets/portraits', import.meta.url));

// ---------------------------------------------------------------------------
// Helpers

/** FNV-1a 32-bit hash of a string → non-negative integer. */
function fnv32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Slugify a string to filesystem-safe lowercase characters. */
function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// Public API

export interface PortraitSubject {
  name: string;
  role?: string;
  appearance?: {
    sourceLook?: string;
    hair?: string;
    outfit?: string;
    visualTags?: string[];
  };
  traits?: { personality?: string[] };
}

/**
 * Builds an image-generation prompt for a character.
 * Kept under ~80 words for model efficiency.
 */
export function portraitPrompt(subject: PortraitSubject): string {
  const parts: string[] = [STYLE_LOCK];

  // Name + role anchor
  const nameRole = [subject.name, subject.role].filter(Boolean).join(', ');
  if (nameRole) parts.push(nameRole);

  const app = subject.appearance ?? {};

  // Source look (e.g. "Naruto Uzumaki" from an anime import)
  if (app.sourceLook) parts.push(app.sourceLook);

  // Hair + outfit
  if (app.hair) parts.push(app.hair);
  if (app.outfit) parts.push(app.outfit);

  // Up to 3 visual tags
  const tags = (app.visualTags ?? []).slice(0, 3);
  if (tags.length) parts.push(tags.join(', '));

  // Up to 2 personality traits for expression flavour
  const personality = (subject.traits?.personality ?? []).slice(0, 2);
  if (personality.length) parts.push(`${personality.join(', ')} expression`);

  return parts.join(', ');
}

/** Deterministic integer seed for a given (worldId, npcId) pair. */
export function portraitSeed(npcId: string, worldId: string): number {
  return fnv32(`${worldId}:${npcId}`);
}

/** Filesystem-safe filename: `<worldId>-<npcId>.png` (slugified). */
export function portraitFileName(npcId: string, worldId: string): string {
  return `${slug(worldId)}-${slug(npcId)}.png`;
}

/** Absolute path to the PNG for a given (worldId, npcId) pair. */
export function portraitPath(npcId: string, worldId: string): string {
  return join(PORTRAITS_DIR, portraitFileName(npcId, worldId));
}

/** Subject descriptor for the default player hero. */
export function heroSubject(playerName?: string): PortraitSubject {
  return {
    name: playerName ?? 'The Wanderer',
    role: 'protagonist',
    appearance: DEFAULT_HERO_APPEARANCE,
  };
}

// ---------------------------------------------------------------------------
// Generation

export type GenerateResult = { ok: true; file: string } | { ok: false; reason: string };

/**
 * Calls the Modal portrait endpoint and writes the returned PNG to disk.
 * Never throws — missing PORTRAIT_URL returns generator_unavailable.
 */
export async function generatePortrait(
  npcId: string,
  worldId: string,
  subject: PortraitSubject
): Promise<GenerateResult> {
  const url = portraitUrl();
  if (!url) {
    return { ok: false, reason: 'generator_unavailable' };
  }

  try {
    mkdirSync(PORTRAITS_DIR, { recursive: true });
  } catch {
    // ignore; if the dir can't be created we'll fail on write anyway
  }

  const file = portraitPath(npcId, worldId);
  const prompt = portraitPrompt(subject);
  const seed = portraitSeed(npcId, worldId);

  // Cold container start + first weight cache fill can run several minutes;
  // warm gens after that are ~3s. 15 min total guard.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 900_000);

  try {
    // Modal hands off a long-running call to a polling URL via a 303 redirect.
    // We handle that manually because Node's default fetch keeps the POST
    // method when following 303, which Modal's polling endpoint rejects.
    let response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt, seed, width: 512, height: 512, steps: 9 }),
      signal: controller.signal,
      redirect: 'manual',
    });
    while (response.status === 303 || response.status === 302) {
      const location = response.headers.get('location');
      if (!location) return { ok: false, reason: `redirect_no_location` };
      response = await fetch(location, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'manual',
      });
    }
    if (!response.ok) {
      return { ok: false, reason: `http_${response.status}` };
    }
    const buf = Buffer.from(await response.arrayBuffer());
    await writeFile(file, buf);
    return { ok: true, file };
  } catch (err) {
    const error = err as NodeJS.ErrnoException & { name?: string };
    if (error.name === 'AbortError') return { ok: false, reason: 'timeout' };
    return { ok: false, reason: error.message };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// In-process queue (max 1 concurrent, GPU-bound)

interface QueueEntry {
  npcId: string;
  worldId: string;
  subject: PortraitSubject;
  resolve: (result: GenerateResult) => void;
}

const queue: QueueEntry[] = [] as QueueEntry[];
const inflight = new Set<string>(); // filenames currently generating
let running = false;

async function drain(): Promise<void> {
  if (running) return;
  running = true;
  while (queue.length > 0) {
    const entry = queue.shift()!;
    const key = portraitFileName(entry.npcId, entry.worldId);
    const result = await generatePortrait(entry.npcId, entry.worldId, entry.subject);
    inflight.delete(key); // remove AFTER generation completes so dedup works for entire duration
    entry.resolve(result);
  }
  running = false;
}

/** Enqueue a portrait generation; deduped by filename. Returns a promise. */
export function queuePortrait(
  npcId: string,
  worldId: string,
  subject: PortraitSubject
): Promise<GenerateResult> {
  const key = portraitFileName(npcId, worldId);
  // Already generated?
  if (existsSync(portraitPath(npcId, worldId))) {
    return Promise.resolve({ ok: true, file: portraitPath(npcId, worldId) });
  }
  // Already queued or in-flight?
  if (inflight.has(key)) {
    return new Promise((resolve) => {
      // Attach a second listener by pushing a duplicate entry with same key.
      // The key dedup just prevents double GPU invocations; we still want both callers notified.
      // Simplest: return a new promise that polls via a one-shot interval.
      const id = setInterval(() => {
        if (!inflight.has(key)) {
          clearInterval(id);
          const file = portraitPath(npcId, worldId);
          resolve(existsSync(file) ? { ok: true, file } : { ok: false, reason: 'dedup_miss' });
        }
      }, 200);
    });
  }
  inflight.add(key);
  return new Promise((resolve) => {
    queue.push({ npcId, worldId, subject, resolve });
    void drain();
  });
}

/** Number of entries waiting in the queue (excludes inflight). */
export function portraitQueueDepth(): number {
  return queue.length;
}

/** Flush: wait for all currently queued + inflight work to settle. */
export function flushPortraitQueue(): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (!running && queue.length === 0 && inflight.size === 0) {
        resolve();
      } else {
        setTimeout(check, 50);
      }
    };
    check();
  });
}

// ---------------------------------------------------------------------------
// Convenience wrappers that take Npc/World objects

export function queueNpcPortrait(npc: Npc, world: World): Promise<GenerateResult> {
  return queuePortrait(npc.id, world.id, {
    name: npc.name,
    role: npc.role,
    appearance: npc.appearance,
    traits: npc.traits,
  });
}

export function queueHeroPortrait(world: World, playerName?: string): Promise<GenerateResult> {
  return queuePortrait('player', world.id, heroSubject(playerName));
}
