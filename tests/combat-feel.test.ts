import { describe, expect, it } from 'vitest';

import { wasDodgedInWindow } from '../web3d/src/combat/combat-utils.ts';

describe('wasDodgedInWindow', () => {
  it('returns true when player is in dodge state', () => {
    expect(wasDodgedInWindow('dodge')).toBe(true);
  });

  it('returns false when player is in free state', () => {
    expect(wasDodgedInWindow('free')).toBe(false);
  });

  it('returns false when player is attacking', () => {
    expect(wasDodgedInWindow('attack')).toBe(false);
  });

  it('returns false when player is in hitstun', () => {
    expect(wasDodgedInWindow('hitstun')).toBe(false);
  });

  it('returns false when player is dead', () => {
    expect(wasDodgedInWindow('dead')).toBe(false);
  });
});
