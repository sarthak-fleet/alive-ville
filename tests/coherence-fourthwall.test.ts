import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { checkCoherence } from '../src/coherence.ts';
import type { Npc, World } from '../src/types.ts';

const fixture = (): World =>
  JSON.parse(readFileSync(new URL('../worlds/village.json', import.meta.url), 'utf8')) as World;
const npc = (world: World): Npc => world.npcs[0]!;
const ctx = { playerText: 'Who are you really?' };

describe('4th-wall coherence (Inworld immersion boundary)', () => {
  test('flags an AI/model self-reveal', () => {
    const world = fixture();
    const result = checkCoherence(
      world,
      npc(world),
      'As an AI language model, I cannot have feelings.',
      ctx
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations.join(' ')).toMatch(/character|AI/i);
  });

  test("flags 'I am a chatbot' / training references", () => {
    const world = fixture();
    expect(
      checkCoherence(world, npc(world), "I'm just a chatbot, my training data ends in 2023.", ctx)
        .ok
    ).toBe(false);
  });

  test('passes an in-character reply', () => {
    const world = fixture();
    expect(
      checkCoherence(
        world,
        npc(world),
        'The forge has been cold since the flame guttered out.',
        ctx
      ).ok
    ).toBe(true);
  });
});
