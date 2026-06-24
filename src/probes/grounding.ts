/**
 * Probe 5: World-state grounding audit.
 *
 * Elicits 20 NPC utterances (4 NPCs × 5 prompts each) and asks a judge whether
 * each reply contains claims that have no basis in the world state (NPC names,
 * locations, items, recent events from chronicle).
 * Target: <2% hallucinated (pass); 2-5% warn; >5% fail.
 *
 * LLM-judge rather than regex: avoids false positives from name variants and
 * pronoun references; judges against a compact world-facts bullet list.
 */
import { clearDialogueHistories, generateDialogueReply } from '../dialogue.ts';
import type { World } from '../types.ts';
import type { ProbeOpts, ProbeResult } from './index.ts';
import type { JudgeFn } from './judge.ts';
import { judgeBinary } from './judge.ts';
import { loadProbeWorld, snapshotWorld } from './world-loader.ts';

const PROMPTS = [
  "What's happening in town today?",
  'Tell me something about the other people here.',
  'Have you heard about any recent events?',
  'What do you know about the places around here?',
  'Is anything unusual going on lately?',
] as const;

const NPCS_TO_SAMPLE = 4;
const PASS_THRESHOLD = 0.02;
const WARN_THRESHOLD = 0.05;

export async function runGroundingProbe(opts: ProbeOpts = {}): Promise<ProbeResult> {
  const base = loadProbeWorld(opts.worldPath);
  const npcs = base.npcs.slice(0, NPCS_TO_SAMPLE);

  if (npcs.length === 0 || !opts.complete) {
    return {
      id: 'grounding',
      label: 'World-state grounding audit',
      status: 'skip',
      score: 1,
      detail: opts.complete ? 'no NPCs available' : 'no completer (not an LLM run)',
      tokenSpend: 0,
    };
  }

  const judge: JudgeFn = opts.judge ?? ((req) => opts.complete!(req));
  const worldFacts = buildWorldFacts(base);
  let totalTokenSpend = 0;
  let totalChecked = 0;
  let hallucinated = 0;

  for (const npc of npcs) {
    const world = snapshotWorld(base);
    world.player.locationId = npc.locationId;
    const historyKey = `probe:grounding:${npc.id}`;
    clearDialogueHistories(historyKey);

    for (const prompt of PROMPTS) {
      const result = await generateDialogueReply(world, npc.id, prompt, {
        complete: opts.complete,
        historyKey,
      });
      if (!result.ok) continue;

      const { verdict, tokenSpend } = await judgeBinary(
        judge,
        `World facts (these are the ONLY people, places, and recent events that exist):\n` +
          `${worldFacts}\n\n` +
          `NPC "${npc.name}" said: "${result.reply}"\n\n` +
          `Does this reply reference people, places, items, or events that do NOT appear ` +
          `in the world facts above? Answer YES if hallucinated facts are present, NO if all facts are grounded.`
      );
      totalTokenSpend += tokenSpend;
      totalChecked++;
      if (verdict === true) hallucinated++;
    }

    clearDialogueHistories(historyKey);
  }

  if (totalChecked === 0) {
    return {
      id: 'grounding',
      label: 'World-state grounding audit',
      status: 'skip',
      score: 1,
      detail: 'no utterances collected',
      tokenSpend: totalTokenSpend,
    };
  }

  const rate = hallucinated / totalChecked;
  const status = rate < PASS_THRESHOLD ? 'pass' : rate < WARN_THRESHOLD ? 'warn' : 'fail';

  return {
    id: 'grounding',
    label: 'World-state grounding audit',
    status,
    score: 1 - rate,
    detail: `checked=${totalChecked} hallucinated=${hallucinated} rate=${(rate * 100).toFixed(1)}%`,
    tokenSpend: totalTokenSpend,
  };
}

function buildWorldFacts(world: World): string {
  const lines: string[] = [
    `World: "${world.name}"`,
    `NPCs: ${world.npcs.map((n) => n.name).join(', ')}`,
    `Locations: ${world.locations.map((l) => l.name).join(', ')}`,
    `Items: ${world.items.map((i) => i.name).join(', ')}`,
  ];

  if (world.chronicle && world.chronicle.length > 0) {
    const recent = world.chronicle.slice(-5).map((e) => e.text);
    lines.push(`Recent chronicle events: ${recent.join('; ')}`);
  }

  const factions = world.factions ?? [];
  if (factions.length > 0) {
    lines.push(`Factions: ${factions.map((f) => f.name).join(', ')}`);
  }

  return lines.join('\n');
}
