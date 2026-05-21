import { useEffect, useMemo, useState } from "react";

import { useWorldStore } from "../store/world.ts";

export function FightCinematicOverlay() {
  const bubbles = useWorldStore((s) => s.bubbles);
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(performance.now()), 160);
    return () => window.clearInterval(id);
  }, []);

  const fight = useMemo(() => [...bubbles]
    .reverse()
    .find((bubble) => bubble.actionType === "fight" && bubble.expiresAt > now), [bubbles, now]);

  if (!fight) return null;
  const hpMax = fight.combatHpMax ?? 100;
  const hpAfter = Math.max(0, fight.combatHpAfter ?? hpMax);
  const hpBefore = Math.max(hpAfter, fight.combatHpBefore ?? hpAfter);
  const damage = Math.max(0, hpBefore - hpAfter);
  const hpPct = Math.max(0, Math.min(100, (hpAfter / hpMax) * 100));
  const style = fight.combatStyle ?? "strike";

  return (
    <div className={`fight-cinematic ${style}`} aria-live="polite">
      <div className="fight-cinematic-top">
        <span>{fight.combatLabel ?? "Combat"}</span>
        <strong>{fight.combatTargetName ?? "Target"}</strong>
      </div>
      <div className="fight-cinematic-meter" aria-label={`${fight.combatTargetName ?? "Target"} HP ${hpAfter} of ${hpMax}`}>
        <i style={{ width: `${hpPct}%` }} />
      </div>
      <div className="fight-cinematic-bottom">
        <b>{damage > 0 ? `${damage} damage` : "pressure break"}</b>
        <small>{hpAfter}/{hpMax} HP</small>
      </div>
    </div>
  );
}
