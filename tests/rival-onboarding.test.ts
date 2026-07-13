import { describe, expect, it } from 'vitest';

import {
  advanceRivalGuide,
  loadRivalGuideStep,
  parseRivalGuideRecord,
  rivalGuideStepNumber,
  rivalGuideStorageKey,
  saveRivalGuideStep,
  shouldAutostartAgentLoop,
  type RivalGuideStorage,
} from '../web3d/src/hud/rival-onboarding.ts';

class MemoryStorage implements RivalGuideStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('Rival guided onboarding progression', () => {
  it('advances through move, Kael dialogue, combat, and consequence one gate at a time', () => {
    expect(advanceRivalGuide('move', { moved: true })).toBe('talk');
    expect(advanceRivalGuide('talk', { kaelDialogueOpen: true })).toBe('fight');
    expect(advanceRivalGuide('fight', { kaelCombatStarted: true })).toBe('consequence');
    expect(advanceRivalGuide('consequence', { consequenceVisible: true })).toBe('complete');
  });

  it('does not skip an earlier gate when only a later signal is present', () => {
    expect(
      advanceRivalGuide('move', {
        kaelDialogueOpen: true,
        kaelCombatStarted: true,
        consequenceVisible: true,
      })
    ).toBe('move');
    expect(advanceRivalGuide('talk', { consequenceVisible: true })).toBe('talk');
  });

  it('keeps terminal states terminal', () => {
    expect(advanceRivalGuide('complete', { moved: true })).toBe('complete');
    expect(advanceRivalGuide('dismissed', { consequenceVisible: true })).toBe('dismissed');
    expect(rivalGuideStepNumber('complete')).toBe(4);
  });
});

describe('Rival guided onboarding persistence', () => {
  it('round-trips intermediate and dismissed progress in a scoped versioned record', () => {
    const storage = new MemoryStorage();
    expect(saveRivalGuideStep(storage, 'fight')).toBe(true);
    expect(loadRivalGuideStep(storage)).toBe('fight');
    expect(JSON.parse(storage.values.get(rivalGuideStorageKey()) ?? '{}')).toEqual({
      version: 1,
      step: 'fight',
    });

    saveRivalGuideStep(storage, 'dismissed');
    expect(loadRivalGuideStep(storage)).toBe('dismissed');
  });

  it.each([
    null,
    '',
    '{',
    JSON.stringify({ version: 99, step: 'talk' }),
    JSON.stringify({ version: 1, step: 'teleport' }),
  ])('starts safely at movement for unsupported record %j', (raw) => {
    const storage = new MemoryStorage();
    if (raw !== null) storage.values.set(rivalGuideStorageKey(), raw);
    expect(parseRivalGuideRecord(raw)).toBeNull();
    expect(loadRivalGuideStep(storage)).toBe('move');
  });

  it('falls back safely when browser storage throws', () => {
    const broken: RivalGuideStorage = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
    };
    expect(loadRivalGuideStep(broken)).toBe('move');
    expect(saveRivalGuideStep(broken, 'talk')).toBe(false);
  });

  it('holds only an untrained Rival world and preserves normal autostart', () => {
    const storage = new MemoryStorage();
    expect(shouldAutostartAgentLoop('rival_duel', storage)).toBe(false);
    expect(shouldAutostartAgentLoop('village', storage)).toBe(true);

    saveRivalGuideStep(storage, 'complete');
    expect(shouldAutostartAgentLoop('rival_duel', storage)).toBe(false);

    saveRivalGuideStep(storage, 'dismissed');
    expect(shouldAutostartAgentLoop('rival_duel', storage)).toBe(true);
  });
});
