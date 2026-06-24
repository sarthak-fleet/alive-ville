import { useState } from 'react';

import { useUiStore } from '../store/ui.ts';

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

/** one-time controls card on first spawn; the arc panel is the player's goal */
export function Onboarding() {
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
