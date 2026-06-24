import { describe, expect, test } from 'vitest';

import { memoryMetaFromText } from '../src/agents.ts';
import { entitiesInText, memoriesAbout, relationalContext } from '../src/memory-relational.ts';
import type { Memory } from '../src/types.ts';

const mem = (
  text: string,
  tick: number,
  extra: Partial<NonNullable<Memory['meta']>> = {}
): Memory => ({
  tick,
  text,
  meta: { importance: 5, ...extra },
});

describe('relational recall', () => {
  test('memoriesAbout filters by subject tag or name mention, by importance/recency', () => {
    const memories = [
      mem('Random weather note.', 5),
      mem('The player gave me bread.', 6, { subject: 'player', importance: 4 }),
      mem('Tomas argued with me at the bridge.', 7, { importance: 8 }),
    ];
    const aboutPlayer = memoriesAbout(memories, 'player', 'Wanderer', 3);
    expect(aboutPlayer.map((m) => m.text)).toContain('The player gave me bread.');
    const aboutTomas = memoriesAbout(memories, 'tomas', 'Tomas', 3);
    expect(aboutTomas[0]!.text).toContain('Tomas');
  });

  test('entitiesInText finds only named entities present', () => {
    const found = entitiesInText('Have you seen Tomas near the forge?', [
      { id: 'tomas', name: 'Tomas' },
      { id: 'mira', name: 'Mira' },
    ]);
    expect(found.map((e) => e.id)).toEqual(['tomas']);
  });

  test('relationalContext includes the player and a mentioned NPC, skips unmentioned', () => {
    const memories = [
      mem('The player helped me.', 6, { subject: 'player' }),
      mem('Mira owes me a favor.', 7, { subject: 'mira' }),
    ];
    const ctx = relationalContext(
      memories,
      'What do you think of Mira?',
      { id: 'player', name: 'Wanderer' },
      [
        { id: 'mira', name: 'Mira' },
        { id: 'tomas', name: 'Tomas' },
      ]
    );
    expect(ctx).toContain('Wanderer');
    expect(ctx).toContain('Mira');
    expect(ctx).not.toContain('Tomas');
  });
});

describe('graduated importance (mem0-lite)', () => {
  test('high-stakes + conflict text scores higher than a mundane note', () => {
    const mundane = memoryMetaFromText('We talked about the weather.').importance ?? 0;
    const stakes =
      memoryMetaFromText('The player threatened to steal the secret blue ember.').importance ?? 0;
    expect(stakes).toBeGreaterThan(mundane);
    expect(stakes).toBeLessThanOrEqual(9);
  });
});
