import { describe, expect, it } from 'vitest';

import { useUiStore } from '../web3d/src/store/ui.ts';

describe('web3d ui store', () => {
  it('refreshes the same dialogue when reopened with a new opener', () => {
    useUiStore.setState({
      dialogueNpcId: 'mira',
      dialogueOpener: 'hello',
      dialogueLines: [{ speaker: 'npc', speakerName: 'Mira', text: 'hello' }],
      dialogueBusy: true,
      interactionTarget: null,
      interiorBuildingId: null,
      gamePhase: 'playing',
    });

    useUiStore.getState().openDialogue('mira', 'new opener');

    expect(useUiStore.getState().dialogueNpcId).toBe('mira');
    expect(useUiStore.getState().dialogueOpener).toBe('new opener');
    expect(useUiStore.getState().dialogueLines).toEqual([]);
    expect(useUiStore.getState().dialogueBusy).toBe(false);
  });
});
