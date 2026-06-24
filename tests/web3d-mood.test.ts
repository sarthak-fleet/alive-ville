import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { World } from '../src/types.ts';
import { sceneMoodForClock, worldPressure } from '../web3d/src/mapping/mood.ts';

const base = JSON.parse(
  readFileSync(new URL('../worlds/one-punch-man.json', import.meta.url), 'utf8')
) as World;

function withPressure(pressure: number): World {
  return {
    ...base,
    directorState: { pressure, quietTicks: 0 },
    tensions: [],
    villainPlans: [],
  };
}

describe('web3d tension mood', () => {
  it('computes world pressure from director state, tensions, and villain plans', () => {
    const world = withPressure(10);
    world.tensions = [{ id: 't', title: 't', pressure: 55 }];
    world.villainPlans = [
      { id: 'v', actorId: 'x', title: 'v', objective: 'o', stage: 1, hidden: true, pressure: 72 },
    ];
    expect(worldPressure(world)).toBe(72);
  });

  it('leaves the mood untouched at baseline pressure (worlds ship at 40-60)', () => {
    const calm = sceneMoodForClock(withPressure(0));
    const stillCalm = sceneMoodForClock(withPressure(60));
    expect(stillCalm).toEqual(calm);
  });

  it('shifts the mood ominous as pressure rises', () => {
    const calm = sceneMoodForClock(withPressure(0));
    const tense = sceneMoodForClock(withPressure(95));
    expect(tense.fogDensity).toBeGreaterThan(calm.fogDensity);
    expect(tense.sunIntensity).toBeLessThan(calm.sunIntensity);
    expect(tense.skyColor).not.toBe(calm.skyColor);
    expect(tense.fogColor).not.toBe(calm.fogColor);
  });

  it('is monotonic: more pressure, denser fog', () => {
    const mid = sceneMoodForClock(withPressure(75));
    const high = sceneMoodForClock(withPressure(105));
    expect(high.fogDensity).toBeGreaterThan(mid.fogDensity);
  });

  it('keeps daytime clearly daytime even at maximum pressure', () => {
    const calm = sceneMoodForClock(withPressure(0));
    const max = sceneMoodForClock(withPressure(110));
    expect(max.sunIntensity).toBeGreaterThan(calm.sunIntensity * 0.8);
    expect(max.fogDensity).toBeLessThan(calm.fogDensity * 1.6);
  });
});
