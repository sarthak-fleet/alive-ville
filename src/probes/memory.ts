/**
 * Probe 2: Cross-session memory coherence.
 *
 * Asks an NPC 5 relationship/history questions. For each reply, a judge checks
 * whether the claims made are grounded in the NPC's actual memory store.
 * Hallucinated claim = entity or fact that has no matching memory entry.
 * Pass = <2% hallucinated; warn 2-5%; fail >5%.
 *
 * LLM-judge approach (not regex) avoids false positives from name variants.
 */
import { clearDialogueHistories, generateDialogueReply } from '../dialogue.ts';
import type { Npc, World } from '../types.ts';
import type { ProbeOpts, ProbeResult } from './index.ts';
import type { JudgeFn } from './judge.ts';
import { judgeBinary } from './judge.ts';
import { loadProbeWorld, snapshotWorld } from './world-loader.ts';

const QUESTIONS = [
  'Tell me about your relationships in this town.',
  'What have you been up to lately?',
  'Have you heard any news recently?',
  'Who do you know here and how do you feel about them?',
  "What's the most important thing that happened to you recently?",
] as const;

const PASS_THRESHOLD = 0.02;
const WARN_THRESHOLD = 0.05;

export async function runMemoryProbe(opts: ProbeOpts = {}): Promise<ProbeResult> {
  const world = loadProbeWorld(opts.worldPath);
  const targetNpc = pickNpc(world);

  if (!targetNpc || !opts.complete) {
    return {
      id: 'memory',
      label: 'Cross-session memory coherence',
      status: 'skip',
      score: 0,
      detail: opts.complete ? 'no NPC available' : 'no completer (not an LLM run)',
      tokenSpend: 0,
    };
  }

  const snap = snapshotWorld(world);
  snap.player.locationId = targetNpc.locationId;

  const historyKey = 'probe:memory';
  clearDialogueHistories(historyKey);

  const judge: JudgeFn = opts.judge ?? ((req) => opts.complete!(req));
  let totalTokenSpend = 0;
  let checkedClaims = 0;
  let hallucinated = 0;

  const memoryContext = buildMemoryContext(world, targetNpc);

  for (const q of QUESTIONS) {
    const result = await generateDialogueReply(snap, targetNpc.id, q, {
      complete: opts.complete,
      historyKey,
    });
    if (!result.ok) continue;

    const reply = result.reply;

    // one grounding check per reply (batched within the reply rather than per claim)
    const { verdict, tokenSpend } = await judgeBinary(
      judge,
      `NPC: ${targetNpc.name}\n` +
        `Known facts from ${targetNpc.name}'s memories:\n${memoryContext}\n\n` +
        `${targetNpc.name} said: "${reply}"\n\n` +
        `Does this reply contain any factual claims about people, places, or recent events ` +
        `that CONTRADICT or have NO BASIS in the listed memories? ` +
        `Answer YES if hallucinated, NO if grounded.`
    );
    totalTokenSpend += tokenSpend;
    checkedClaims++;
    if (verdict === true) hallucinated++;
  }

  clearDialogueHistories(historyKey);

  if (checkedClaims === 0) {
    return {
      id: 'memory',
      label: 'Cross-session memory coherence',
      status: 'skip',
      score: 0,
      detail: 'no claims checked',
      tokenSpend: totalTokenSpend,
    };
  }

  const rate = hallucinated / checkedClaims;
  const status = rate < PASS_THRESHOLD ? 'pass' : rate < WARN_THRESHOLD ? 'warn' : 'fail';

  return {
    id: 'memory',
    label: 'Cross-session memory coherence',
    status,
    score: 1 - rate,
    detail: `NPC=${targetNpc.name} checked=${checkedClaims} hallucinated=${hallucinated} rate=${(rate * 100).toFixed(1)}%`,
    tokenSpend: totalTokenSpend,
  };
}

function pickNpc(world: World): Npc | undefined {
  return world.npcs.find((npc) => npc.memories.length > 0) ?? world.npcs[0];
}

function buildMemoryContext(world: World, npc: Npc): string {
  const npcNames = new Set(world.npcs.map((n) => n.name));
  const locationNames = new Set(world.locations.map((l) => l.name));
  const lines: string[] = [
    `NPCs in the world: ${[...npcNames].join(', ')}`,
    `Locations: ${[...locationNames].join(', ')}`,
    `${npc.name}'s memories:`,
    ...npc.memories.slice(-10).map((m) => `  - ${m.text}`),
  ];
  return lines.join('\n');
}
