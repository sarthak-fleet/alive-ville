import { describe, expect, it } from 'vitest';

import {
  buildVariation,
  faceVariantFor,
  hairStyleV2For,
  roleSilhouetteFor,
} from '../web3d/src/characters/identity.ts';

// ---------------------------------------------------------------------------
// faceVariantFor
// ---------------------------------------------------------------------------
describe('faceVariantFor', () => {
  it('is deterministic for the same seed', () => {
    const a = faceVariantFor('tanjiro', 'demon slayer');
    const b = faceVariantFor('tanjiro', 'demon slayer');
    expect(a).toEqual(b);
  });

  it('persona override: angry text → angry brow', () => {
    const v = faceVariantFor('any-npc', 'a fierce and stern guard who is angry');
    expect(v.brow).toBe('angry');
  });

  it('persona override: cheery text → smile mouth', () => {
    const v = faceVariantFor('any-npc', 'a warm friendly baker who is always cheerful');
    expect(v.mouth).toBe('smile');
  });

  it('persona override: tired text → sleepy eyes', () => {
    const v = faceVariantFor('elder-001', 'an old tired merchant who is sleepy');
    expect(v.eyes).toBe('sleepy');
  });

  it('produces distinct results for different seeds (distribution)', () => {
    const seeds = ['npc-1', 'npc-2', 'npc-3', 'npc-4', 'npc-5', 'npc-6', 'npc-7', 'npc-8'];
    const keys = seeds.map((s) => {
      const v = faceVariantFor(s, 'a villager');
      return `${v.eyes}:${v.brow}:${v.mouth}`;
    });
    const distinct = new Set(keys);
    expect(distinct.size).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// buildVariation
// ---------------------------------------------------------------------------
describe('buildVariation', () => {
  it('is deterministic for the same seed', () => {
    const a = buildVariation('saitama', 'bald hero');
    const b = buildVariation('saitama', 'bald hero');
    expect(a).toEqual(b);
  });

  it('heightScale stays uniform across personas (deliberately no height variation)', () => {
    // d177b5a made NPC heights uniform: seeded height jitter read as a
    // rendering bug at distance. Silhouette variety comes from widthScale +
    // body-shape decor instead. Giant/child/lanky no longer change height.
    const base = buildVariation('npc-x', 'a villager');
    const giant = buildVariation('npc-x', 'a towering giant');
    expect(base.heightScale).toBe(1);
    expect(giant.heightScale).toBe(1);
  });

  it('child persona shrinks widthScale', () => {
    const v = buildVariation('npc-y', 'a small child kid');
    expect(v.heightScale).toBe(1);
    expect(v.widthScale).toBeLessThan(1.0);
  });

  it('lanky persona narrows width (height stays uniform)', () => {
    const v = buildVariation('npc-z', 'a lanky thin person');
    expect(v.heightScale).toBe(1);
    expect(v.widthScale).toBeLessThan(1.0);
  });

  it('scales stay within sane bounds for any persona override', () => {
    const personas = [
      'a child kid',
      'a tower giant',
      'a lanky thin person',
      'a villager',
      'a broad warrior',
    ];
    for (const p of personas) {
      const v = buildVariation('test-seed', p);
      expect(v.heightScale).toBe(1);
      expect(v.widthScale).toBeGreaterThanOrEqual(0.78);
      expect(v.widthScale).toBeLessThanOrEqual(1.12);
    }
  });

  it('different seeds yield different widthScales (distribution spread)', () => {
    const scales = ['s1', 's2', 's3', 's4', 's5', 's6'].map(
      (s) => buildVariation(s, 'a villager').widthScale
    );
    const distinct = new Set(scales.map((x) => x.toFixed(3)));
    expect(distinct.size).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// roleSilhouetteFor
// ---------------------------------------------------------------------------
describe('roleSilhouetteFor', () => {
  it('detects smith role', () => {
    expect(roleSilhouetteFor('master blacksmith at the forge')).toBe('smith');
  });

  it('detects guard role', () => {
    expect(roleSilhouetteFor('city guard and soldier')).toBe('guard');
  });

  it('detects merchant role', () => {
    expect(roleSilhouetteFor('travelling merchant with a shop')).toBe('merchant');
  });

  it('detects elder role', () => {
    expect(roleSilhouetteFor('wise elder sage of the village')).toBe('elder');
  });

  it('detects noble role', () => {
    expect(roleSilhouetteFor('a noble gentleman from the court')).toBe('noble');
  });

  it('returns null for generic villager', () => {
    expect(roleSilhouetteFor('a simple villager who likes farming')).toBeNull();
  });

  it('first match wins (smith before guard)', () => {
    // smith regex comes first in the implementation
    expect(roleSilhouetteFor('blacksmith who is also a guard')).toBe('smith');
  });
});

// ---------------------------------------------------------------------------
// hairStyleV2For
// ---------------------------------------------------------------------------
describe('hairStyleV2For', () => {
  it('is deterministic for the same seed', () => {
    const a = hairStyleV2For('long dark hair', 'npc-1', false);
    const b = hairStyleV2For('long dark hair', 'npc-1', false);
    expect(a).toBe(b);
  });

  it('bald keyword always returns bald', () => {
    expect(hairStyleV2For('bald shaved head', 'any', false)).toBe('bald');
    expect(hairStyleV2For('bald shaved head', 'any', true)).toBe('bald');
  });

  it('mohawk keyword returns mohawk', () => {
    expect(hairStyleV2For('mohawk hairstyle', 'any', false)).toBe('mohawk');
  });

  it('curl keyword returns curly', () => {
    expect(hairStyleV2For('curly afro hair', 'any', true)).toBe('curly');
  });

  it('flowing long keyword returns long (not ponytail)', () => {
    const style = hairStyleV2For('long flowing waist-length hair', 'any', true);
    expect(style).toBe('long');
  });

  it('plain long returns ponytail (not new long style)', () => {
    const style = hairStyleV2For('long hair', 'any', false);
    expect(style).toBe('ponytail');
  });

  it('distributes across styles for neutral seeded NPCs', () => {
    const styles = Array.from({ length: 12 }, (_, i) =>
      hairStyleV2For('', `npc-${i}`, i % 2 === 0)
    );
    const distinct = new Set(styles);
    expect(distinct.size).toBeGreaterThanOrEqual(4);
  });
});
