/**
 * consolidation.ts — "sleep-time" consolidation, ported from the Letta / MemGPT
 * pattern (letta-ai/letta, Apache-2.0).
 *
 * Periodically distil an NPC's player-related memories + reflections into a single
 * standing **impression of the player** that is carried into every future
 * conversation (injected by `dialogue.ts`). This is the "memory that visibly
 * changes how they treat you across sessions" lever — the narrative complement to
 * the numeric `relationshipAxes`. Runs off the critical path: deterministically in
 * offline catch-up (the literal "sleep"), and optionally via the LLM in the loop.
 */

import { completeText, type CompleteTextResult } from './llm/router.ts';
import type { Memory, Npc, World } from './types.ts';

/** Don't refresh the impression more often than this many ticks. */
const IMPRESSION_REFRESH_TICKS = 12;
const IMPRESSION_MEMORY_WINDOW = 15;

type CompleteTextFn = (req: {
  tier: 'normal' | 'quest' | 'background';
  system: string;
  user: string;
  timeoutMs?: number;
  model?: string;
}) => Promise<CompleteTextResult>;

function playerMemories(npc: Npc): Memory[] {
  return npc.memories.filter(
    (memory) => memory.meta?.subject === 'player' || memory.meta?.tags?.includes('reflection')
  );
}

/** True when enough time has passed AND there is new player-related material to consolidate. */
export function impressionDue(npc: Npc, tick: number): boolean {
  const last = npc.plan?.lastImpressionTick ?? -IMPRESSION_REFRESH_TICKS;
  if (tick - last < IMPRESSION_REFRESH_TICKS) return false;
  return playerMemories(npc).some((memory) => memory.tick > last);
}

function sentimentOf(npc: Npc): string {
  const axes = npc.relationshipAxes?.['player'];
  if (!axes) return 'uncertain about';
  if ((axes.suspicion ?? 0) >= 3 || (axes.fear ?? 0) >= 3) return 'wary of';
  if ((axes.trust ?? 0) + (axes.affection ?? 0) >= 4) return 'warming to';
  if ((axes.respect ?? 0) >= 3) return 'respectful of';
  return 'neutral toward';
}

/** Deterministic consolidation (no LLM) — used in offline catch-up + tests. */
export function consolidatePlayerImpressionScripted(world: World, npc: Npc): string | null {
  const recent = [...npc.memories]
    .filter((memory) => memory.meta?.subject === 'player')
    .sort((a, b) => b.tick - a.tick)[0];
  const hasAxes = Boolean(npc.relationshipAxes?.['player']);
  if (!recent && !hasAxes) return null;
  const playerName = world.player.name ?? 'the player';
  const impression = recent
    ? `My standing read on ${playerName}: I am ${sentimentOf(npc)} them. Lately: ${recent.text}`
    : `My standing read on ${playerName}: I am ${sentimentOf(npc)} them.`;
  npc.playerImpression = impression;
  npc.plan = { ...(npc.plan ?? {}), lastImpressionTick: world.tick };
  return impression;
}

/** LLM consolidation — distils player memories into one standing impression. Null on failure. */
export async function consolidatePlayerImpression(
  world: World,
  npc: Npc,
  complete: CompleteTextFn = completeText
): Promise<string | null> {
  const memories = playerMemories(npc).slice(-IMPRESSION_MEMORY_WINDOW);
  if (memories.length === 0) return null;
  const playerName = world.player.name ?? 'the player';
  const system =
    `In ONE first-person sentence, state your current standing impression of ${playerName} — ` +
    `how you regard them going forward — grounded ONLY in the memories. Return only the sentence.`;
  const identity = [npc.name, npc.role ? `(${npc.role})` : ''].filter(Boolean).join(' ');
  const user = `${identity}\nMemories about ${playerName}:\n${memories.map((memory) => `- ${memory.text}`).join('\n')}`;

  const result = await complete({
    tier: 'normal',
    system,
    user,
    timeoutMs: 20_000,
    model: process.env['LLM_MODEL_PROPOSE'] ?? undefined,
  });
  if ('skipped' in result && result.skipped) return null;
  if ('error' in result && result.error) return null;
  if (!('text' in result) || !result.text) return null;
  const impression = result.text.trim();
  if (!impression) return null;

  npc.playerImpression = impression;
  npc.plan = { ...(npc.plan ?? {}), lastImpressionTick: world.tick };
  return impression;
}
