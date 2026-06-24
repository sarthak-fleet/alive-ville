import { readFileSync } from 'node:fs';

import { beforeEach, describe, expect, it } from 'vitest';

import type { TickSummary, World } from '../src/types.ts';
import { useDirectorStore } from '../web3d/src/director/store.ts';

const world = JSON.parse(
  readFileSync(new URL('../worlds/one-punch-man.json', import.meta.url), 'utf8')
) as World;

function summaryWith(actions: TickSummary['actions']): TickSummary {
  return { tick: world.tick + 1, actions, rejected: [], checksum: 'x', clock: world.clock };
}

const directorEntry: TickSummary['actions'][number] = {
  action: { type: 'remember', actorId: 'mira', text: 'The overpass hums again.' },
  text: 'Mira noted: The overpass hums again.',
  fromDirector: true,
};

beforeEach(() => {
  useDirectorStore.setState({ cutscene: null, lastEndedAt: Number.NEGATIVE_INFINITY });
});

describe('web3d director beats', () => {
  it('starts a cutscene for a fromDirector action', () => {
    useDirectorStore.getState().maybeTriggerFromSummary(summaryWith([directorEntry]), world, world);
    const cutscene = useDirectorStore.getState().cutscene;
    expect(cutscene?.actorId).toBe('mira');
    expect(cutscene?.kind).toBe('director');
    expect(cutscene?.text).toContain('overpass');
  });

  it('ignores ordinary actions', () => {
    useDirectorStore.getState().maybeTriggerFromSummary(
      summaryWith([
        {
          action: { type: 'talk', actorId: 'mira', targetId: 'player', text: 'hi' },
          text: 'Mira talked.',
        },
      ]),
      world,
      world
    );
    expect(useDirectorStore.getState().cutscene).toBeNull();
  });

  it('prefers a villain plan stage advance and frames the villain', () => {
    const prev: World = {
      ...world,
      villainPlans: [
        {
          id: 'p',
          actorId: 'pax',
          title: 'Duel',
          objective: 'o',
          stage: 1,
          hidden: true,
          pressure: 50,
        },
      ],
    };
    const next: World = {
      ...world,
      villainPlans: [
        {
          id: 'p',
          actorId: 'pax',
          title: 'Duel',
          objective: 'o',
          stage: 2,
          hidden: true,
          pressure: 60,
          nextTrigger: 'Pax calls out a public challenge.',
        },
      ],
    };
    useDirectorStore.getState().maybeTriggerFromSummary(summaryWith([directorEntry]), prev, next);
    const cutscene = useDirectorStore.getState().cutscene;
    expect(cutscene?.kind).toBe('villain');
    expect(cutscene?.actorId).toBe('pax');
    expect(cutscene?.text).toContain('challenge');
  });

  it('respects the cooldown after a cutscene ends', () => {
    const store = useDirectorStore.getState();
    store.beginCutscene({ actorId: 'mira', text: 'x', kind: 'director' });
    store.endCutscene();
    useDirectorStore.getState().maybeTriggerFromSummary(summaryWith([directorEntry]), world, world);
    expect(useDirectorStore.getState().cutscene).toBeNull();
  });

  it('does not stack cutscenes', () => {
    const store = useDirectorStore.getState();
    store.beginCutscene({ actorId: 'mira', text: 'first', kind: 'director' });
    useDirectorStore.getState().maybeTriggerFromSummary(summaryWith([directorEntry]), world, world);
    expect(useDirectorStore.getState().cutscene?.text).toBe('first');
  });

  it('can be reset on world replacement', () => {
    const store = useDirectorStore.getState();
    store.beginCutscene({ actorId: 'mira', text: 'first', kind: 'director' });
    store.reset();
    expect(useDirectorStore.getState().cutscene).toBeNull();
    expect(useDirectorStore.getState().lastEndedAt).toBe(Number.NEGATIVE_INFINITY);
  });
});
