import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { createLlmProposer, type ProposeFn } from '../src/llm/proposer.ts';
import type { World } from '../src/types.ts';

const fixture = (): World =>
  JSON.parse(readFileSync(new URL('../worlds/village.json', import.meta.url), 'utf8')) as World;

function withLlmEnv(fn: () => Promise<void>) {
  return async () => {
    const prev = { key: process.env['LLM_API_KEY'], base: process.env['LLM_BASE_URL'] };
    process.env['LLM_API_KEY'] = 'test';
    process.env['LLM_BASE_URL'] = 'https://example';
    try {
      await fn();
    } finally {
      if (prev.key) process.env['LLM_API_KEY'] = prev.key;
      else delete process.env['LLM_API_KEY'];
      if (prev.base) process.env['LLM_BASE_URL'] = prev.base;
      else delete process.env['LLM_BASE_URL'];
    }
  };
}

describe('LLM proposer', () => {
  test('returns empty when LLM disabled', async () => {
    delete process.env['LLM_API_KEY'];
    delete process.env['LLM_BASE_URL'];
    const propose = createLlmProposer({
      propose: (async () => ({
        action: { type: 'remember', text: 'x', reason: 'y' },
      })) as ProposeFn,
    });
    expect(await propose(fixture())).toEqual([]);
  });

  test(
    'parses, validates, and forces actorId per NPC',
    withLlmEnv(async () => {
      const propose = createLlmProposer({
        maxNpcs: 2,
        propose: (async () => ({
          action: { type: 'remember', text: 'check garden gate', reason: 'vigilance' },
        })) as ProposeFn,
      });
      const result = await propose(fixture());
      expect(result.length).toBe(2);
      expect(result.every((action) => action.type === 'remember')).toBe(true);
      expect(result.map((action) => action.actorId).sort()).toEqual(['mira', 'tomas']);
    })
  );

  test(
    'drops invalid actions and skip',
    withLlmEnv(async () => {
      const responses = [
        { action: { type: 'skip', reason: 'tired' } },
        { action: { type: 'talk', targetId: 'ghost', text: 'hi', reason: 'x' } },
      ];
      const propose = createLlmProposer({
        maxNpcs: 2,
        propose: (async () => responses.shift()!) as ProposeFn,
      });
      expect(await propose(fixture())).toEqual([]);
    })
  );

  test(
    'skips when router returns error or skipped',
    withLlmEnv(async () => {
      const responses = [{ skipped: true, reason: 'no key' }, { error: 'HTTP 500' }];
      const propose = createLlmProposer({
        maxNpcs: 2,
        propose: (async () => responses.shift()!) as ProposeFn,
      });
      expect(await propose(fixture())).toEqual([]);
    })
  );
});
