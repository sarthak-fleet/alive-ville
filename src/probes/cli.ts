import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { dialogueAvailable } from '../dialogue.ts';
import { completeText } from '../llm/router.ts';
import { formatReportCard, runAllProbes } from './index.ts';

async function main(): Promise<void> {
  if (!dialogueAvailable()) {
    console.error(
      'LLM not available. Set LLM_BASE_URL + LLM_API_KEY (or LLM_LOCAL_AI_URL) ' +
        'and re-run to execute the live probes.'
    );
    process.exit(1);
  }

  console.info('Running lifelikeness QA harness...\n');

  // NPC dialogue: routes by tier (NORMAL for in-character turns, QUEST for
  // quest-givers) so the probe measures the same model players actually hit.
  const complete = (req: {
    tier: 'normal' | 'quest';
    system: string;
    user: string;
    onToken?: (delta: string) => void;
  }) => completeText({ tier: req.tier, system: req.system, user: req.user });

  // Judge calls: pinned to the cheap proposal model to keep costs low.
  const judge = (req: { tier: 'normal' | 'quest'; system: string; user: string }) =>
    completeText({
      tier: req.tier,
      system: req.system,
      user: req.user,
      model: process.env['LLM_MODEL_PROPOSE'],
    });

  const report = await runAllProbes({ complete, judge });

  console.info(formatReportCard(report));
  console.info('');

  const logsDir = join(process.cwd(), 'logs');
  mkdirSync(logsDir, { recursive: true });
  const filename = `lifelikeness-${report.ts.replace(/[:.]/g, '-')}.json`;
  const outPath = join(logsDir, filename);
  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.info(`Report written to logs/${filename}`);

  const failed = report.results.some((r) => r.status === 'fail');
  if (failed) process.exit(1);
}

main().catch((err: unknown) => {
  console.error('probe:lifelikeness failed:', err);
  process.exit(1);
});
