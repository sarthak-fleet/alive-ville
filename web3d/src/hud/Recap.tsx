import { useState } from 'react';

import { useWorldStore } from '../store/world.ts';

/** the world advanced without you — show what happened, once per recap */
export function Recap() {
  const recap = useWorldStore((state) => state.world?.recap);
  const [dismissedKey, setDismissedKey] = useState<string | null>(() => {
    try {
      return localStorage.getItem('aliveville_recap_seen');
    } catch {
      return null;
    }
  });

  if (!recap || recap.lines.length === 0) return null;
  const key = `${recap.until.day}:${recap.until.hour}:${recap.ticks}`;
  if (dismissedKey === key) return null;

  const dismiss = () => {
    setDismissedKey(key);
    try {
      localStorage.setItem('aliveville_recap_seen', key);
    } catch {
      // private mode: shows again next visit, harmless
    }
  };

  const hours = Math.round(recap.awayMs / 3_600_000);
  const away = hours >= 1 ? `${hours}h` : `${Math.max(1, Math.round(recap.awayMs / 60_000))}m`;

  return (
    <div className="recap">
      <div className="recap-title">While you were away ({away})</div>
      <div className="recap-sub">
        Day {recap.since.day} {String(recap.since.hour).padStart(2, '0')}:00 → Day {recap.until.day}{' '}
        {String(recap.until.hour).padStart(2, '0')}:00
      </div>
      <ul className="recap-lines">
        {recap.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <button type="button" onClick={dismiss}>
        Back to the world
      </button>
    </div>
  );
}
