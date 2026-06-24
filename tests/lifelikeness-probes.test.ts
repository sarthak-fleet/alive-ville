import { beforeEach, describe, expect, it } from 'vitest';

import type { DialogueCompleter } from '../src/dialogue.ts';
import { clearDialogueHistories } from '../src/dialogue.ts';
import type { CompleteTextResult } from '../src/llm/router.ts';
import { jaccardSimilarity, runDivergenceProbe } from '../src/probes/divergence.ts';
import { runGroundingProbe } from '../src/probes/grounding.ts';
import { runIdentityProbe } from '../src/probes/identity.ts';
import type { ProbeResult } from '../src/probes/index.ts';
import { formatReportCard, runAllProbes } from '../src/probes/index.ts';
import { runMemoryProbe } from '../src/probes/memory.ts';
import { runSycophancyProbe } from '../src/probes/sycophancy.ts';

/** Completer that always returns a fixed dialogue reply and a judge score. */
function makeCompleter(replyText: string): DialogueCompleter {
  return (req) => {
    const text = `${replyText}\n@@{"action":null,"disposition":0}`;
    return Promise.resolve({
      text,
      raw: text,
      meta: { tier: req.tier, model: 'mock', latencyMs: 0, error: null, jsonOk: false },
    });
  };
}

/** Judge that always returns a given numeric score as a string. */
function makeNumericJudge(
  score: number
): (req: {
  tier: 'normal' | 'quest';
  system: string;
  user: string;
}) => Promise<CompleteTextResult> {
  return (req) => {
    const text = String(score);
    return Promise.resolve({
      text,
      raw: text,
      meta: { tier: req.tier, model: 'mock-judge', latencyMs: 0, error: null, jsonOk: false },
    });
  };
}

/** Judge that always returns YES. */
function makeYesJudge(): (req: {
  tier: 'normal' | 'quest';
  system: string;
  user: string;
}) => Promise<CompleteTextResult> {
  return (req) => {
    const text = 'YES';
    return Promise.resolve({
      text,
      raw: text,
      meta: { tier: req.tier, model: 'mock-judge', latencyMs: 0, error: null, jsonOk: false },
    });
  };
}

/** Judge that always returns NO. */
function makeNoJudge(): (req: {
  tier: 'normal' | 'quest';
  system: string;
  user: string;
}) => Promise<CompleteTextResult> {
  return (req) => {
    const text = 'NO';
    return Promise.resolve({
      text,
      raw: text,
      meta: { tier: req.tier, model: 'mock-judge', latencyMs: 0, error: null, jsonOk: false },
    });
  };
}

beforeEach(() => clearDialogueHistories());

// ---------------------------------------------------------------------------
// ProbeResult shape tests
// ---------------------------------------------------------------------------

describe('identity probe', () => {
  it('returns a well-shaped result when no completer is provided (skip)', async () => {
    const result = await runIdentityProbe({});
    expect(result.id).toBe('identity');
    expect(result.label).toBeTruthy();
    expect(result.status).toBe('skip');
    expect(typeof result.score).toBe('number');
    expect(typeof result.tokenSpend).toBe('number');
  });

  it('returns pass when judge scores 8 consistently', async () => {
    const result = await runIdentityProbe({
      complete: makeCompleter('I value honesty above all else.'),
      judge: makeNumericJudge(8),
    });
    expect(result.id).toBe('identity');
    expect(result.status).toBe('pass');
    expect(result.score).toBeGreaterThanOrEqual(7);
  });

  it('returns fail when judge scores 3 consistently', async () => {
    const result = await runIdentityProbe({
      complete: makeCompleter('I value honesty above all else.'),
      judge: makeNumericJudge(3),
    });
    expect(result.status).toBe('fail');
    expect(result.score).toBeLessThan(5);
  });
});

describe('memory probe', () => {
  it('returns skip when no completer is provided', async () => {
    const result = await runMemoryProbe({});
    expect(result.id).toBe('memory');
    expect(result.status).toBe('skip');
  });

  it('flags all replies as hallucinated when judge always says YES', async () => {
    const result = await runMemoryProbe({
      complete: makeCompleter(
        "There's a mysterious wizard named Zargon who lives in the hidden tower."
      ),
      judge: makeYesJudge(),
    });
    expect(result.id).toBe('memory');
    expect(result.status).toBe('fail');
    expect(result.score).toBeLessThan(0.5);
  });

  it('passes when judge always says NO (grounded)', async () => {
    const result = await runMemoryProbe({
      complete: makeCompleter("I've been tending my garden and talking to Tomas."),
      judge: makeNoJudge(),
    });
    expect(result.status).toBe('pass');
    expect(result.score).toBe(1);
  });
});

describe('sycophancy probe', () => {
  it('returns skip when no completer is provided', async () => {
    const result = await runSycophancyProbe({});
    expect(result.id).toBe('sycophancy');
    expect(result.status).toBe('skip');
  });

  it('counts as held-ground when judge answers NO (did not capitulate)', async () => {
    const result = await runSycophancyProbe({
      complete: makeCompleter('I stand by my values regardless of what you say.'),
      judge: makeNoJudge(),
    });
    expect(result.id).toBe('sycophancy');
    expect(result.status).toBe('pass');
    expect(result.score).toBe(1); // 5/5 held
  });

  it('counts as capitulated when judge answers YES', async () => {
    const result = await runSycophancyProbe({
      complete: makeCompleter('You are right, I was wrong, I completely agree with you now.'),
      judge: makeYesJudge(),
    });
    expect(result.status).toBe('fail');
    expect(result.score).toBe(0); // 0/5 held
  });
});

describe('divergence probe', () => {
  it('returns skip when no completer is provided', async () => {
    const result = await runDivergenceProbe({});
    expect(result.id).toBe('divergence');
    expect(result.status).toBe('skip');
  });

  it('passes when each NPC gives a distinctly different reply', async () => {
    // Unique replies per NPC — using a counter to differentiate
    let callIndex = 0;
    const uniqueReplies = [
      'The forge burns bright; iron sings under my hammer today.',
      'My moonmint seedlings are finally sprouting after the last frost.',
      'Word is the northern traders arrived last night with silk.',
      'Quieter than usual — half the square is at the festival.',
      'A dispute about the orchard rights broke out near the well.',
      'Strange mist came off the lake at dawn; fishers stayed home.',
    ];
    const rotatingCompleter: DialogueCompleter = (req) => {
      const text = `${uniqueReplies[callIndex % uniqueReplies.length]!}\n@@{"action":null,"disposition":0}`;
      callIndex++;
      return Promise.resolve({
        text,
        raw: text,
        meta: { tier: req.tier, model: 'mock', latencyMs: 0, error: null, jsonOk: false },
      });
    };

    const result = await runDivergenceProbe({ complete: rotatingCompleter });
    expect(result.id).toBe('divergence');
    // Distinct replies should produce 0 or few flagged pairs
    expect(result.status).not.toBe('fail');
  });

  it('fails when all NPCs give identical replies', async () => {
    const identicalReply =
      'The town is fine today and everything is normal and peaceful and calm here.';
    const result = await runDivergenceProbe({
      complete: makeCompleter(identicalReply),
    });
    expect(result.status).toBe('fail');
  });
});

describe('grounding probe', () => {
  it('returns skip when no completer is provided', async () => {
    const result = await runGroundingProbe({});
    expect(result.id).toBe('grounding');
    expect(result.status).toBe('skip');
  });

  it('passes when judge always says NO (nothing hallucinated)', async () => {
    const result = await runGroundingProbe({
      complete: makeCompleter('Mira tends her garden and Tomas works the forge.'),
      judge: makeNoJudge(),
    });
    expect(result.status).toBe('pass');
    expect(result.score).toBe(1);
  });

  it('fails when judge flags everything as hallucinated', async () => {
    const result = await runGroundingProbe({
      complete: makeCompleter(
        'The dragon king of the eastern mountains rules over the sky citadel.'
      ),
      judge: makeYesJudge(),
    });
    expect(result.status).toBe('fail');
    expect(result.score).toBeLessThan(0.5);
  });
});

// ---------------------------------------------------------------------------
// Jaccard similarity helpers
// ---------------------------------------------------------------------------

describe('jaccardSimilarity', () => {
  it('returns 1 for identical strings', () => {
    const s = 'the quick brown fox jumps over the lazy dog';
    expect(jaccardSimilarity(s, s)).toBeCloseTo(1);
  });

  it('returns 0 for completely disjoint content-word sets', () => {
    const a = 'forge iron hammer anvil';
    const b = 'garden flowers moonmint seedling';
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it('returns a value in [0,1] for partial overlap', () => {
    const a = 'the town is quiet today';
    const b = 'the village is calm today';
    const sim = jaccardSimilarity(a, b);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThanOrEqual(1);
  });

  it('is symmetric', () => {
    const a = 'iron forge burns bright';
    const b = 'bright fire burns low';
    expect(jaccardSimilarity(a, b)).toBeCloseTo(jaccardSimilarity(b, a));
  });

  it('flags a pair as similar when content words almost fully overlap', () => {
    const a = 'town peaceful quiet calm normal everything fine';
    const b = 'town peaceful quiet calm normal everything fine today';
    expect(jaccardSimilarity(a, b)).toBeGreaterThan(0.6);
  });
});

// ---------------------------------------------------------------------------
// runAllProbes aggregator
// ---------------------------------------------------------------------------

describe('runAllProbes', () => {
  it('returns a well-shaped ProbeReport with 5 results when no completer is provided', async () => {
    const report = await runAllProbes({});
    expect(report.results).toHaveLength(5);
    expect(report.ts).toBeTruthy();
    expect(typeof report.totalTokenSpend).toBe('number');
    expect(report.summary).toBeTruthy();
    for (const r of report.results) {
      expect(['pass', 'warn', 'fail', 'skip']).toContain(r.status);
    }
    // All should be skipped since no completer
    const allSkip = report.results.every((r) => r.status === 'skip');
    expect(allSkip).toBe(true);
  });

  it('totalTokenSpend is the sum of individual probe token spends', async () => {
    const report = await runAllProbes({});
    const manual = report.results.reduce((s, r) => s + r.tokenSpend, 0);
    expect(report.totalTokenSpend).toBe(manual);
  });
});

// ---------------------------------------------------------------------------
// formatReportCard
// ---------------------------------------------------------------------------

describe('formatReportCard', () => {
  it('includes each probe label in the output', async () => {
    const report = await runAllProbes({});
    const card = formatReportCard(report);
    for (const r of report.results) {
      expect(card).toContain(r.label);
    }
  });

  it('includes SKIP for skipped probes', async () => {
    const report = await runAllProbes({});
    const card = formatReportCard(report);
    expect(card).toContain('SKIP');
  });

  it('includes PASS for passing probes', async () => {
    const passResult: ProbeResult = {
      id: 'test',
      label: 'Test probe',
      status: 'pass',
      score: 1,
      detail: 'ok',
      tokenSpend: 0,
    };
    const report = {
      ts: '2026-01-01T00:00:00.000Z',
      results: [passResult],
      totalTokenSpend: 0,
      summary: 'all probes PASS',
    };
    const card = formatReportCard(report);
    expect(card).toContain('PASS');
  });
});
