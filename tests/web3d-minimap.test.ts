import { describe, expect, it } from 'vitest';

import {
  desaturateTowardParchment,
  hashedJitter,
  labelTrim,
} from '../web3d/src/hud/minimap-style.ts';

describe('hashedJitter', () => {
  it('returns a value within the amplitude bound', () => {
    for (let seed = 0; seed < 50; seed++) {
      const j = hashedJitter(seed, 2);
      expect(j).toBeGreaterThanOrEqual(-2);
      expect(j).toBeLessThanOrEqual(2);
    }
  });

  it('is deterministic — same seed, same value', () => {
    expect(hashedJitter(42, 1)).toBe(hashedJitter(42, 1));
    expect(hashedJitter(0, 5)).toBe(hashedJitter(0, 5));
  });

  it('produces different values for different seeds', () => {
    const vals = new Set(Array.from({ length: 20 }, (_, i) => hashedJitter(i * 17, 10)));
    // expect at least 15 distinct values out of 20
    expect(vals.size).toBeGreaterThan(15);
  });

  it('scales output linearly with amplitude', () => {
    // same seed, double amplitude → double result (linear relation)
    const a = hashedJitter(7, 1);
    const b = hashedJitter(7, 2);
    expect(b).toBeCloseTo(a * 2, 10);
  });
});

describe('labelTrim', () => {
  it('returns the first word', () => {
    expect(labelTrim('Market Plaza')).toBe('Market');
    expect(labelTrim('Harbor District')).toBe('Harbor');
  });

  it('splits on hyphens and underscores', () => {
    expect(labelTrim('Ash-Gate')).toBe('Ash');
    expect(labelTrim('North_Port')).toBe('North');
  });

  it('caps at maxLen', () => {
    expect(labelTrim('Longnamehere', 5)).toBe('Longn');
  });

  it('handles a single-word name without truncation', () => {
    expect(labelTrim('Bazaar')).toBe('Bazaar');
  });

  it('handles empty string gracefully', () => {
    expect(labelTrim('')).toBe('');
  });
});

describe('desaturateTowardParchment', () => {
  it('returns parchment color at t=1', () => {
    // Any hex fully blended should give parchment rgb(244,236,216)
    expect(desaturateTowardParchment('#ff0000', 1)).toBe('rgb(244,236,216)');
    expect(desaturateTowardParchment('#0000ff', 1)).toBe('rgb(244,236,216)');
  });

  it('returns original color at t=0', () => {
    expect(desaturateTowardParchment('#c04000', 0)).toBe('rgb(192,64,0)');
  });

  it('blends correctly at t=0.5 for a primary color', () => {
    // #00c864: r=0, g=200, b=100
    // r: 0 + (244-0)*0.5 = 122; g: 200 + (236-200)*0.5 = 218; b: 100 + (216-100)*0.5 = 158
    const result = desaturateTowardParchment('#00c864', 0.5);
    expect(result).toBe('rgb(122,218,158)');
  });

  it('clamps channel values to 0-255 range', () => {
    const result = desaturateTowardParchment('#ffffff', 0);
    // channels should all be 255 (no overflow)
    expect(result).toBe('rgb(255,255,255)');
  });
});
