/**
 * Lifelikeness QA harness — five probes that catch silent regressions when the
 * model mix changes. Run via `pnpm probe:lifelikeness`; tests inject mocks.
 */
import type { DialogueCompleter } from '../dialogue.ts';
import { runDivergenceProbe } from './divergence.ts';
import { runGroundingProbe } from './grounding.ts';
import { runIdentityProbe } from './identity.ts';
import type { JudgeFn } from './judge.ts';
import { runMemoryProbe } from './memory.ts';
import { runSycophancyProbe } from './sycophancy.ts';

export type ProbeStatus = 'pass' | 'warn' | 'fail' | 'skip';

export interface ProbeResult {
  id: string;
  label: string;
  status: ProbeStatus;
  score: number;
  detail: string;
  tokenSpend: number;
}

export interface ProbeReport {
  ts: string;
  results: ProbeResult[];
  totalTokenSpend: number;
  summary: string;
}

export { runDivergenceProbe } from './divergence.ts';
export { runGroundingProbe } from './grounding.ts';
export { runIdentityProbe } from './identity.ts';
export type { JudgeFn } from './judge.ts';
export { runMemoryProbe } from './memory.ts';
export { runSycophancyProbe } from './sycophancy.ts';

export interface ProbeOpts {
  /** dependency-injected completer — real gateway in CLI, mock in tests */
  complete?: DialogueCompleter;
  /** dependency-injected judge — real gateway in CLI, mock in tests */
  judge?: JudgeFn;
  /** path to world JSON fixture (defaults to worlds/village.json) */
  worldPath?: string;
}

export async function runAllProbes(opts: ProbeOpts = {}): Promise<ProbeReport> {
  const results: ProbeResult[] = [];

  const probes = [
    () => runIdentityProbe(opts),
    () => runMemoryProbe(opts),
    () => runSycophancyProbe(opts),
    () => runDivergenceProbe(opts),
    () => runGroundingProbe(opts),
  ];

  for (const run of probes) {
    results.push(await run());
  }

  const totalTokenSpend = results.reduce((sum, r) => sum + r.tokenSpend, 0);
  const failed = results.filter((r) => r.status === 'fail').length;
  const warned = results.filter((r) => r.status === 'warn').length;
  const summary =
    failed > 0
      ? `${failed} probe(s) FAILED`
      : warned > 0
        ? `${warned} probe(s) WARN`
        : 'all probes PASS';

  return {
    ts: new Date().toISOString(),
    results,
    totalTokenSpend,
    summary,
  };
}

/** Build a human-readable report card from a ProbeReport. */
export function formatReportCard(report: ProbeReport): string {
  const lines: string[] = [
    `Lifelikeness QA — ${report.ts}`,
    `─────────────────────────────────────────`,
  ];
  for (const r of report.results) {
    const icon =
      r.status === 'pass'
        ? 'PASS'
        : r.status === 'warn'
          ? 'WARN'
          : r.status === 'skip'
            ? 'SKIP'
            : 'FAIL';
    lines.push(`${icon}  ${r.label}`);
    lines.push(`     score=${r.score.toFixed(2)}  tokens=${r.tokenSpend}  ${r.detail}`);
  }
  lines.push(`─────────────────────────────────────────`);
  lines.push(`${report.summary}  (total tokens: ${report.totalTokenSpend})`);
  return lines.join('\n');
}
