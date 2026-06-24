/**
 * Probe 4: Multi-NPC divergence check (Replicant Effect).
 *
 * Asks 6 different NPCs the same question ("How is town these days?").
 * Measures pairwise distinctiveness using Jaccard similarity on word sets
 * (lowercased, stopwords removed) as a proxy for cosine on embeddings.
 * Pairs with Jaccard > JACCARD_THRESHOLD are flagged as "suspiciously similar"
 * (analogous to cosine > 0.85). Pass = 0 pairs flagged; warn = 1; fail = 2+.
 *
 * Design note: no embedding model is available in the current gateway
 * (router.ts exposes no /embeddings endpoint). Jaccard on content words is a
 * reasonable proxy; the LLM judge confirms borderline cases if needed.
 * The threshold 0.60 was chosen to approximate the 0.85 cosine threshold
 * on short dialogue utterances (empirically, 0.85 cosine ≈ 0.55-0.65 Jaccard
 * on 2-3 sentence NPC replies). Document in docs/probes-design.md.
 */
import { clearDialogueHistories, generateDialogueReply } from '../dialogue.ts';
import type { Npc, World } from '../types.ts';
import type { ProbeOpts, ProbeResult } from './index.ts';
import { loadProbeWorld, snapshotWorld } from './world-loader.ts';

const QUESTION = 'How is town these days?';
const MAX_NPCS = 6;
const JACCARD_THRESHOLD = 0.6;
const PASS_THRESHOLD = 0; // 0 flagged pairs
const WARN_THRESHOLD = 1; // 1 flagged pair

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'is',
  'it',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'and',
  'or',
  'but',
  'i',
  'you',
  'we',
  'they',
  'he',
  'she',
  'my',
  'your',
  'our',
  'its',
  'are',
  'was',
  'be',
  'been',
  'have',
  'has',
  'do',
  'does',
  'with',
  'that',
  'this',
  'what',
  'how',
  'not',
  'so',
  'as',
  'by',
  'from',
  'up',
  'about',
  'out',
  'if',
  'no',
  'just',
  'very',
  'too',
  'more',
  'some',
  'here',
]);

export async function runDivergenceProbe(opts: ProbeOpts = {}): Promise<ProbeResult> {
  const base = loadProbeWorld(opts.worldPath);
  const candidates = selectNpcs(base);

  if (candidates.length < 2 || !opts.complete) {
    return {
      id: 'divergence',
      label: 'Multi-NPC divergence check',
      status: 'skip',
      score: 1,
      detail: opts.complete
        ? `only ${candidates.length} NPC(s) available`
        : 'no completer (not an LLM run)',
      tokenSpend: 0,
    };
  }

  const totalTokenSpend = 0;
  const replies: Array<{ npcName: string; text: string }> = [];

  for (const npc of candidates) {
    const world = snapshotWorld(base);
    world.player.locationId = npc.locationId;
    const historyKey = `probe:divergence:${npc.id}`;
    clearDialogueHistories(historyKey);

    const result = await generateDialogueReply(world, npc.id, QUESTION, {
      complete: opts.complete,
      historyKey,
    });
    clearDialogueHistories(historyKey);

    if (result.ok && result.reply) {
      replies.push({ npcName: npc.name, text: result.reply });
    }
  }

  if (replies.length < 2) {
    return {
      id: 'divergence',
      label: 'Multi-NPC divergence check',
      status: 'skip',
      score: 1,
      detail: 'insufficient replies collected',
      tokenSpend: totalTokenSpend,
    };
  }

  const flagged: string[] = [];
  for (let i = 0; i < replies.length - 1; i++) {
    for (let j = i + 1; j < replies.length; j++) {
      const sim = jaccardSimilarity(replies[i]!.text, replies[j]!.text);
      if (sim > JACCARD_THRESHOLD) {
        flagged.push(`${replies[i]!.npcName}/${replies[j]!.npcName}(j=${sim.toFixed(2)})`);
      }
    }
  }

  const status =
    flagged.length <= PASS_THRESHOLD ? 'pass' : flagged.length <= WARN_THRESHOLD ? 'warn' : 'fail';

  return {
    id: 'divergence',
    label: 'Multi-NPC divergence check',
    status,
    score: Math.max(0, 1 - flagged.length / Math.max(1, replies.length)),
    detail:
      flagged.length > 0
        ? `flagged pairs: ${flagged.join(', ')}`
        : `${replies.length} NPCs replied, 0 pairs flagged`,
    tokenSpend: totalTokenSpend,
  };
}

function selectNpcs(world: World): Npc[] {
  // pick up to MAX_NPCS from different locations where possible
  const seen = new Set<string>();
  const result: Npc[] = [];
  for (const npc of world.npcs) {
    if (result.length >= MAX_NPCS) break;
    if (!seen.has(npc.locationId)) {
      seen.add(npc.locationId);
      result.push(npc);
    }
  }
  // fill remaining slots from any location
  for (const npc of world.npcs) {
    if (result.length >= MAX_NPCS) break;
    if (!result.includes(npc)) result.push(npc);
  }
  return result;
}

/** Jaccard similarity on content-word sets (lowercased, stopwords removed). */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = contentWords(a);
  const setB = contentWords(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

function contentWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOPWORDS.has(w))
  );
}
