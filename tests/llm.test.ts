import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { logLlmCall } from '../src/llm/log.ts';
import { isLlmEnabled, proposeAction } from '../src/llm/router.ts';
import { parseActionJson } from '../src/llm/schema.ts';

describe('llm primitives', () => {
  test('parseActionJson strips fences and validates shape', () => {
    const ok = parseActionJson('```json\n{"type":"talk","actorId":"mira","reason":"hello"}\n```');
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.action['type']).toBe('talk');

    const bad = parseActionJson('not json');
    expect(bad.ok).toBe(false);
  });

  test('logLlmCall writes JSONL entry', () => {
    const dir = mkdtempSync(join(tmpdir(), 'llmlog-'));
    const path = join(dir, 'llm.jsonl');
    try {
      logLlmCall({ tier: 'normal', model: 'x', latencyMs: 10, jsonOk: true }, path);
      const lines = readFileSync(path, 'utf8').trim().split('\n');
      expect(lines.length).toBe(1);
      const entry = JSON.parse(lines[0]!) as { tier: string; ts: string };
      expect(entry.tier).toBe('normal');
      expect(entry.ts).toMatch(/\d{4}-\d{2}-\d{2}T/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('proposeAction skips when LLM disabled', async () => {
    const prev = { key: process.env['LLM_API_KEY'], base: process.env['LLM_BASE_URL'] };
    delete process.env['LLM_API_KEY'];
    delete process.env['LLM_BASE_URL'];
    try {
      expect(isLlmEnabled()).toBe(false);
      const result = await proposeAction({ tier: 'normal', system: 's', user: 'u' });
      expect('skipped' in result && result.skipped).toBe(true);
      if ('skipped' in result && result.skipped) expect(result.reason).toMatch(/no LLM_API_KEY/);
    } finally {
      if (prev.key) process.env['LLM_API_KEY'] = prev.key;
      if (prev.base) process.env['LLM_BASE_URL'] = prev.base;
    }
  });

  test('proposeAction background tier short-circuits', async () => {
    const result = await proposeAction({ tier: 'background', system: 's', user: 'u' });
    expect('skipped' in result && result.skipped).toBe(true);
  });
});
