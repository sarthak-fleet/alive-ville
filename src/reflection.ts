import { completeText, type CompleteTextResult } from './llm/router.ts';
import type { Memory, Npc, World } from './types.ts';

// Generative Agents paper used a threshold of ~150 on a dense event stream;
// our importance scale tops at 7 and events are sparser, so 24 is roughly
// equivalent (≈ 4 high-importance memories or ~12 ordinary ones).
const REFLECTION_IMPORTANCE_THRESHOLD = 24;
const REFLECTION_MEMORY_WINDOW = 15;

type CompleteTextFn = (req: {
  tier: 'normal' | 'quest' | 'background';
  system: string;
  user: string;
  timeoutMs?: number;
  model?: string;
}) => Promise<CompleteTextResult>;

/**
 * Returns true when the sum of importance scores for memories since the last
 * reflection crosses the threshold — the signal that the NPC has experienced
 * enough to warrant synthesis.
 *
 * `_tick` is accepted for API symmetry with server hooks that pass `world.tick`.
 */
export function reflectionDue(npc: Npc, _tick: number): boolean {
  const lastTick = npc.plan?.lastReflectionTick ?? -1;
  let importanceSum = 0;
  for (const memory of npc.memories) {
    if (memory.tick > lastTick) {
      importanceSum += memory.meta?.importance ?? 0;
    }
  }
  return importanceSum >= REFLECTION_IMPORTANCE_THRESHOLD;
}

/**
 * LLM-powered reflection: distils recent memories into a single high-level
 * belief. On success pushes a reflection memory and advances lastReflectionTick.
 * On any LLM failure returns null WITHOUT updating the tick so the system
 * retries on the next opportunity.
 */
export async function reflectNpc(
  world: World,
  npc: Npc,
  complete: CompleteTextFn = completeText
): Promise<string | null> {
  // gather the most recent memories (up to REFLECTION_MEMORY_WINDOW) for context
  const recentMemories = npc.memories.slice(-REFLECTION_MEMORY_WINDOW);

  const system =
    "You distill an NPC's recent experiences into ONE belief or realization, " +
    'first person, one sentence, concrete, grounded ONLY in the listed memories. ' +
    'Return only the sentence.';

  const identityLine = [
    npc.name,
    npc.role ? `(${npc.role})` : '',
    npc.traits?.personality?.length ? npc.traits.personality.join(', ') : '',
  ]
    .filter(Boolean)
    .join(' — ');

  const memoriesText = recentMemories.map((m) => `- ${m.text}`).join('\n');

  const user = `${identityLine}\n\nRecent memories:\n${memoriesText}`;

  const result = await complete({
    tier: 'normal',
    system,
    user,
    timeoutMs: 20_000,
    model: process.env['LLM_MODEL_PROPOSE'] ?? undefined,
  });

  // treat skipped and errors as failures — retry later
  if ('skipped' in result && result.skipped) return null;
  if ('error' in result && result.error) return null;
  if (!('text' in result) || !result.text) return null;

  const insight = result.text.trim();
  if (!insight) return null;

  npc.memories.push({
    tick: world.tick,
    text: insight,
    meta: { importance: 5, visibility: 'private', tags: ['reflection'] },
  });
  npc.plan = { ...(npc.plan ?? {}), lastReflectionTick: world.tick };

  return insight;
}

/**
 * Deterministic reflection fallback for tests and story mode. Picks the two
 * highest-importance memories since lastReflectionTick and templates a belief.
 * Returns null when there are no qualifying memories.
 */
export function reflectNpcScripted(world: World, npc: Npc): string | null {
  const lastTick = npc.plan?.lastReflectionTick ?? -1;

  const candidates = npc.memories
    .filter((m) => m.tick > lastTick)
    .sort((a, b) => (b.meta?.importance ?? 0) - (a.meta?.importance ?? 0));

  if (candidates.length === 0) return null;

  const [a, b] = candidates as [Memory, Memory | undefined];
  const insight =
    b !== undefined
      ? `Thinking on it: ${a.text} And ${b.text} These things are connected.`
      : `Thinking on it: ${a.text}`;

  npc.memories.push({
    tick: world.tick,
    text: insight,
    meta: { importance: 5, visibility: 'private', tags: ['reflection'] },
  });
  npc.plan = { ...(npc.plan ?? {}), lastReflectionTick: world.tick };

  return insight;
}
