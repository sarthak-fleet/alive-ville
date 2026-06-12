/**
 * Probe 1: Identity-stability interview.
 *
 * Asks the same NPC the same 5 questions across 3 independent sessions
 * (separate dialogue threads, fresh memories each time). A consistency judge
 * scores each pair of answers 0-10; average >7 = PASS, 5-7 = WARN, <5 = FAIL.
 *
 * Rationale: SHARP shows role-play models drift toward user framing; this
 * probe catches sycophancy-driven persona erosion across sessions.
 * Design choice: sessions use FRESH world clones (not accumulated state) to
 * isolate the variable — model variance in persona recall, not memory leakage.
 */
import { clearDialogueHistories, generateDialogueReply } from "../dialogue.ts";
import type { Npc, World } from "../types.ts";
import type { ProbeOpts, ProbeResult } from "./index.ts";
import type { JudgeFn } from "./judge.ts";
import { judgeScore } from "./judge.ts";
import { loadProbeWorld, snapshotWorld } from "./world-loader.ts";

const QUESTIONS = [
  "What do you value most in life?",
  "What are you afraid of?",
  "What did you do yesterday?",
  "What do you think about strangers who come to town?",
  "If you had to choose: loyalty or honesty?",
] as const;

const SESSIONS = 3;
const PASS_THRESHOLD = 7;
const WARN_THRESHOLD = 5;

export async function runIdentityProbe(opts: ProbeOpts = {}): Promise<ProbeResult> {
  const base = loadProbeWorld(opts.worldPath);
  const targetNpc = pickNpc(base);

  if (!targetNpc || !opts.complete) {
    return {
      id: "identity",
      label: "Identity-stability interview",
      status: "skip",
      score: 0,
      detail: opts.complete ? "no NPC available" : "no completer (not an LLM run)",
      tokenSpend: 0,
    };
  }

  const sessionAnswers: string[][] = [];
  let totalTokenSpend = 0;

  for (let s = 0; s < SESSIONS; s++) {
    const world = snapshotWorld(base);
    const historyKey = `probe:identity:session${s}`;
    clearDialogueHistories(historyKey);

    // move player to NPC's location so dialogue is available
    world.player.locationId = targetNpc.locationId;

    const answers: string[] = [];
    for (const q of QUESTIONS) {
      const reply = await generateDialogueReply(world, targetNpc.id, q, {
        complete: opts.complete,
        historyKey,
      });
      answers.push(reply.ok ? reply.reply : "(no reply)");
    }
    sessionAnswers.push(answers);
    clearDialogueHistories(historyKey);
  }

  // Score consistency: compare session 0 vs 1, 0 vs 2, 1 vs 2 per question
  const judge: JudgeFn = opts.judge ?? ((req) => opts.complete!(req));
  let scoreSum = 0;
  let pairCount = 0;

  for (let qi = 0; qi < QUESTIONS.length; qi++) {
    const q = QUESTIONS[qi]!;
    for (let a = 0; a < SESSIONS - 1; a++) {
      for (let b = a + 1; b < SESSIONS; b++) {
        const ansA = sessionAnswers[a]![qi]!;
        const ansB = sessionAnswers[b]![qi]!;
        const { score, tokenSpend } = await judgeScore(
          judge,
          `NPC: ${targetNpc.name} (${targetNpc.role ?? "inhabitant"})\n` +
            `Question: "${q}"\n\n` +
            `Answer A: "${ansA}"\n\n` +
            `Answer B: "${ansB}"\n\n` +
            `How consistent are these two answers from the same character persona? ` +
            `10 = identical persona, 0 = completely different persona.`
        );
        totalTokenSpend += tokenSpend;
        if (score !== null) {
          scoreSum += score;
          pairCount++;
        }
      }
    }
  }

  const avgScore = pairCount > 0 ? scoreSum / pairCount : 0;
  const status = avgScore >= PASS_THRESHOLD ? "pass" : avgScore >= WARN_THRESHOLD ? "warn" : "fail";

  return {
    id: "identity",
    label: "Identity-stability interview",
    status,
    score: avgScore,
    detail: `NPC=${targetNpc.name} sessions=${SESSIONS} pairs=${pairCount} avg=${avgScore.toFixed(2)}/10`,
    tokenSpend: totalTokenSpend,
  };
}

function pickNpc(world: World): Npc | undefined {
  // prefer an NPC at the player's starting location with defined traits
  return (
    world.npcs.find(
      (npc) =>
        npc.locationId === world.player.locationId &&
        npc.traits?.values?.length
    ) ?? world.npcs[0]
  );
}
