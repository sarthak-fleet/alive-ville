import { useCallback, useEffect, useState } from 'react';

import { sessionOutcome } from '../../../src/outcome.ts';
import { useCombatStore } from '../combat/store.ts';
import { isTypingTarget } from '../controls/input.ts';
import { useUiStore } from '../store/ui.ts';
import { useWorldStore } from '../store/world.ts';
import {
  advanceRivalGuide,
  browserRivalGuideStorage,
  loadRivalGuideStep,
  RIVAL_WORLD_ID,
  rivalGuideStepNumber,
  saveRivalGuideStep,
  type RivalGuideSignals,
  type RivalGuideStep,
} from './rival-onboarding.ts';

const SEEN_KEY = 'aliveville_controls_seen';

const ROWS: Array<[string, string]> = [
  ['WASD', 'move'],
  ['Shift', 'run'],
  ['Mouse', 'look (click to capture)'],
  ['E', 'talk · pick up · enter buildings'],
  ['F', 'attack'],
  ['Space', 'dodge'],
  ['Q', 'lock on'],
];

interface RivalGuideCopy {
  key: string;
  title: string;
  body: string;
}

const RIVAL_COPY: Record<Exclude<RivalGuideStep, 'dismissed'>, RivalGuideCopy> = {
  move: {
    key: 'WASD',
    title: 'Reach the saloon',
    body: 'Move into Iron Hill. Kael is already working the room, and the claim closes at sundown.',
  },
  talk: {
    key: 'E',
    title: 'Face Kael',
    body: 'Find Kael inside the saloon. Get close and talk to learn what your rival wants.',
  },
  fight: {
    key: 'F / click',
    title: 'Challenge your rival',
    body: 'Close the conversation, then attack Kael. Use Space to dodge and Q to lock on.',
  },
  consequence: {
    key: 'Finish',
    title: 'Make it count',
    body: 'Finish the showdown. Watch the objective, camp reaction, and ending change because of you.',
  },
  complete: {
    key: 'Changed',
    title: 'Iron Hill reacted',
    body: 'Your action changed this session. Follow the objective to stop Kael before pressure peaks.',
  },
};

/** one-time controls card on first spawn; the arc panel is the player's goal */
export function Onboarding() {
  const worldId = useWorldStore((state) => state.world?.id ?? null);
  if (worldId === RIVAL_WORLD_ID) return <RivalOnboarding />;
  return <GenericControlsCard />;
}

function RivalOnboarding() {
  const world = useWorldStore((state) => state.world);
  const phase = useUiStore((state) => state.gamePhase);
  const dialogueNpcId = useUiStore((state) => state.dialogueNpcId);
  const kaelEnemy = useCombatStore((state) => state.enemies['kael']);
  const worldId = world?.id ?? RIVAL_WORLD_ID;
  const [step, setStep] = useState<RivalGuideStep>(() =>
    loadRivalGuideStep(browserRivalGuideStorage(), worldId)
  );

  const advance = useCallback(
    (signals: RivalGuideSignals) => {
      setStep((current) => {
        const next = advanceRivalGuide(current, signals);
        if (next !== current) saveRivalGuideStep(browserRivalGuideStorage(), next, worldId);
        return next;
      });
    },
    [worldId]
  );

  useEffect(() => {
    if (phase !== 'playing' || step !== 'move') return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isTypingTarget(event.target)) return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) advance({ moved: true });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [advance, phase, step]);

  useEffect(() => {
    if (step === 'talk' && dialogueNpcId === 'kael') advance({ kaelDialogueOpen: true });
  }, [advance, dialogueNpcId, step]);

  const kaelCombatStarted = Boolean(
    kaelEnemy && (kaelEnemy.hostile || kaelEnemy.defeated || kaelEnemy.hp < kaelEnemy.maxHp)
  );
  useEffect(() => {
    if (step === 'fight' && kaelCombatStarted) advance({ kaelCombatStarted: true });
  }, [advance, kaelCombatStarted, step]);

  const kaelDefeated = Boolean(
    kaelEnemy?.defeated || world?.npcs.find((npc) => npc.id === 'kael')?.combat?.defeated
  );
  const terminalOutcome = world ? sessionOutcome(world) !== 'ongoing' : false;
  useEffect(() => {
    if (step === 'consequence' && (kaelDefeated || terminalOutcome)) {
      advance({ consequenceVisible: true });
    }
  }, [advance, kaelDefeated, step, terminalOutcome]);

  if (phase !== 'playing' || step === 'dismissed') return null;

  const copy = RIVAL_COPY[step];
  const complete = step === 'complete';
  return (
    <section
      className={`onboarding rival-guide ${complete ? 'rival-guide-complete' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Rival first-minute guide"
    >
      <div className="rival-guide-kicker">
        {complete ? 'Core loop complete' : `First minute · ${rivalGuideStepNumber(step)} of 4`}
      </div>
      <div className="rival-guide-progress" aria-hidden="true">
        <span style={{ width: `${(rivalGuideStepNumber(step) / 4) * 100}%` }} />
      </div>
      <div className="rival-guide-action">
        <span className="onboarding-key">{copy.key}</span>
        <div>
          <div className="onboarding-title">{copy.title}</div>
          <div className="onboarding-goal">{copy.body}</div>
        </div>
      </div>
      {complete ? (
        <button
          type="button"
          onClick={() => {
            saveRivalGuideStep(browserRivalGuideStorage(), 'dismissed', worldId);
            setStep('dismissed');
            const worldStore = useWorldStore.getState();
            if (!worldStore.agentLoopRunning) void worldStore.toggleAgentLoop();
          }}
        >
          Continue the claim
        </button>
      ) : null}
    </section>
  );
}

function GenericControlsCard() {
  const phase = useUiStore((state) => state.gamePhase);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return Boolean(localStorage.getItem(SEEN_KEY));
    } catch {
      return true;
    }
  });

  if (dismissed || phase !== 'playing') return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // private mode: show again next session
    }
  };

  return (
    <div className="onboarding">
      <div className="onboarding-title">How to live here</div>
      <div className="onboarding-rows">
        {ROWS.map(([key, what]) => (
          <div key={key} className="onboarding-row">
            <span className="onboarding-key">{key}</span>
            <span>{what}</span>
          </div>
        ))}
      </div>
      <div className="onboarding-goal">
        Your journey lives in the arc panel (bottom-left). Talk to people — they remember, act, and
        fight.
      </div>
      <button type="button" onClick={dismiss}>
        Got it
      </button>
    </div>
  );
}
