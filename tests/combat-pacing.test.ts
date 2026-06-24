import { describe, expect, it } from 'vitest';

import {
  CHIP_DAMAGE,
  CHIP_HP_FLOOR_FRACTION,
  CHIP_INTERVAL_MAX,
  CHIP_INTERVAL_MIN,
  chipDamageAllowed,
  MELEE_RANGE,
  MELEE_STRIKE_RANGE,
  nextChipDelay,
  STANCE_EXIT_RANGE,
  STANCE_RANGE,
} from '../web3d/src/combat/pacing.ts';

// ---------------------------------------------------------------------------
// chipDamageAllowed — HP floor math
// ---------------------------------------------------------------------------

describe('chipDamageAllowed', () => {
  const maxHp = 120;
  const floor = Math.round(maxHp * CHIP_HP_FLOOR_FRACTION); // 12

  it('returns full damage when player is well above the floor', () => {
    expect(chipDamageAllowed(100, maxHp, CHIP_DAMAGE)).toBe(CHIP_DAMAGE);
  });

  it('clamps damage so player lands exactly on the floor', () => {
    const hp = floor + 3; // 15
    // can take 3 damage (15 → 12), not 5
    expect(chipDamageAllowed(hp, maxHp, CHIP_DAMAGE)).toBe(3);
  });

  it('returns 0 when player is already at the floor', () => {
    expect(chipDamageAllowed(floor, maxHp, CHIP_DAMAGE)).toBe(0);
  });

  it("returns 0 when player is below the floor (shouldn't happen but is safe)", () => {
    expect(chipDamageAllowed(floor - 1, maxHp, CHIP_DAMAGE)).toBe(0);
  });

  it('does not let chips reduce HP below 10% regardless of damage amount', () => {
    const hp = floor + 1; // 13
    const bigDamage = 50;
    const actual = chipDamageAllowed(hp, maxHp, bigDamage);
    expect(hp - actual).toBeGreaterThanOrEqual(floor);
  });

  it('floor is 10% of maxHp', () => {
    expect(floor).toBe(Math.round(maxHp * 0.1));
  });

  it('works with different maxHp values', () => {
    const mhp = 200;
    const f = Math.round(mhp * CHIP_HP_FLOOR_FRACTION); // 20
    expect(chipDamageAllowed(f + 10, mhp, 15)).toBe(10); // clamp to 10
    expect(chipDamageAllowed(f, mhp, 5)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// nextChipDelay — interval bounds + determinism
// ---------------------------------------------------------------------------

describe('nextChipDelay', () => {
  it('returns a value within [CHIP_INTERVAL_MIN, CHIP_INTERVAL_MAX]', () => {
    // run 1000 samples with a deterministic LCG-style rng
    let seed = 42;
    const rng = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    for (let i = 0; i < 1000; i++) {
      const delay = nextChipDelay(rng);
      expect(delay).toBeGreaterThanOrEqual(CHIP_INTERVAL_MIN);
      expect(delay).toBeLessThanOrEqual(CHIP_INTERVAL_MAX);
    }
  });

  it('is deterministic for the same rng sequence', () => {
    // Two independent rng instances with the same seed produce identical delays
    let s1 = 77;
    let s2 = 77;
    const rng1 = (): number => {
      s1 = (s1 * 1664525 + 1013904223) >>> 0;
      return s1 / 0xffffffff;
    };
    const rng2 = (): number => {
      s2 = (s2 * 1664525 + 1013904223) >>> 0;
      return s2 / 0xffffffff;
    };

    for (let i = 0; i < 20; i++) {
      expect(nextChipDelay(rng1)).toBe(nextChipDelay(rng2));
    }
  });
});

// ---------------------------------------------------------------------------
// Stance range constants — entry / exit hysteresis
// ---------------------------------------------------------------------------

describe('stance range constants', () => {
  it('STANCE_RANGE is less than STANCE_EXIT_RANGE (hysteresis)', () => {
    expect(STANCE_RANGE).toBeLessThan(STANCE_EXIT_RANGE);
  });

  it('MELEE_RANGE is less than MELEE_STRIKE_RANGE', () => {
    expect(MELEE_RANGE).toBeLessThan(MELEE_STRIKE_RANGE);
  });

  it('MELEE_STRIKE_RANGE is well within STANCE_RANGE', () => {
    expect(MELEE_STRIKE_RANGE).toBeLessThan(STANCE_RANGE);
  });

  it('CHIP_HP_FLOOR_FRACTION is 0.10', () => {
    expect(CHIP_HP_FLOOR_FRACTION).toBe(0.1);
  });
});
