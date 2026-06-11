import { evaluateArc } from "./arcs.ts";
import { reflectionDue, reflectNpcScripted } from "./reflection.ts";
import { runTick } from "./simulation.ts";
import type { ChronicleEvent, World, WorldRecap } from "./types.ts";

/**
 * The world advances while you're away: on session return, compressed
 * scripted ticks replay the missed time — NPC routines run, rumors travel,
 * secrets surface, quests and tensions move. No LLM calls (cheap enough to
 * run on every return), so it also works offline and in story mode.
 *
 * Recap lines come from the Chronicle (player-caused beats first, prefixed
 * "Because of you:" — that's the "memory as mirror" pattern from Nemesis,
 * the key to making offline-evolved drama feel legible as your doing).
 * Pattern-based highlights from the tick text fill any remaining slots.
 */

const CATCHUP_TICK_PER_MS = 5 * 60_000; // one world tick per 5 real minutes away
const MIN_TICKS = 2; // below this (≈10 min) the absence isn't worth a recap
const MAX_TICKS = 96; // ≈ a full in-game day; longer absences compress
const RECAP_LINE_BUDGET = 8;

const HIGHLIGHT_PATTERNS =
  /learned|turned against|secret|completed|offered|accepted|defeated|confront|advances|stage|arrives|burn|stolen|missing/i;

export async function catchUpWorld(world: World, elapsedMs: number): Promise<WorldRecap | null> {
  const ticks = Math.min(MAX_TICKS, Math.floor(elapsedMs / CATCHUP_TICK_PER_MS));
  if (ticks < MIN_TICKS) return null;

  const since = { day: world.clock.day, hour: Math.floor(world.clock.hour) };
  const startTick = world.tick;
  const highlights: string[] = [];

  for (let index = 0; index < ticks; index += 1) {
    const summary = await runTick(world, undefined, {});
    for (const entry of summary.actions) {
      if (HIGHLIGHT_PATTERNS.test(entry.text)) highlights.push(entry.text);
    }
  }
  const arcBeat = evaluateArc(world);
  if (arcBeat) highlights.push(arcBeat.text);

  // consolidate memories for NPCs that crossed the reflection threshold during
  // the catch-up window; deterministic (no LLM) so it always runs
  for (const npc of world.npcs) {
    if (reflectionDue(npc, world.tick)) reflectNpcScripted(world, npc);
  }

  const lines = buildRecapLines(world, startTick, highlights);

  const recap: WorldRecap = {
    since,
    until: { day: world.clock.day, hour: Math.floor(world.clock.hour) },
    ticks,
    awayMs: elapsedMs,
    lines,
  };
  world.recap = recap;
  return recap;
}

function buildRecapLines(world: World, startTick: number, fallback: string[]): string[] {
  const chronicleSlice = (world.chronicle ?? []).filter((event) => event.tick >= startTick);
  // player-caused beats lead (oldest-first inside that group), other chronicle
  // beats fill next, then pattern-based highlights cover anything left over
  const playerCaused = chronicleSlice.filter((event) => event.playerCaused);
  const otherChronicle = chronicleSlice.filter((event) => !event.playerCaused);
  const lines: string[] = [];
  const seen = new Set<string>();
  const push = (line: string) => {
    if (!seen.has(line) && lines.length < RECAP_LINE_BUDGET) {
      seen.add(line);
      lines.push(line);
    }
  };
  for (const event of playerCaused) push(formatChronicleLine(event, true));
  for (const event of otherChronicle) push(formatChronicleLine(event, false));
  for (const line of fallback) push(line);
  return lines;
}

function formatChronicleLine(event: ChronicleEvent, playerCaused: boolean): string {
  return playerCaused ? `Because of you: ${event.text}` : event.text;
}
