import { useEffect, useMemo, useState } from "react";

import type { Npc, World } from "../../../src/types.ts";
import { useWorldStore } from "../store/world.ts";

export function FightCinematicOverlay() {
  const world = useWorldStore((s) => s.world);
  const bubbles = useWorldStore((s) => s.bubbles);
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(performance.now()), 160);
    return () => window.clearInterval(id);
  }, []);

  const fight = useMemo(() => [...bubbles]
    .reverse()
    .find((bubble) => bubble.actionType === "fight" && bubble.startsAt <= now && bubble.expiresAt > now), [bubbles, now]);

  if (!fight) return null;
  const hpMax = fight.combatHpMax ?? 100;
  const hpAfter = Math.max(0, fight.combatHpAfter ?? hpMax);
  const hpBefore = Math.max(hpAfter, fight.combatHpBefore ?? hpAfter);
  const damage = Math.max(0, hpBefore - hpAfter);
  const hpPct = Math.max(0, Math.min(100, (hpAfter / hpMax) * 100));
  const style = fight.combatStyle ?? "strike";
  const attacker = world ? combatantFor(world, fight.sourceActorId ?? "player") : null;
  const defender = world ? combatantFor(world, fight.actorId ?? "player", fight.combatTargetName) : null;

  return (
    <div className={`fight-cinematic ${style}`} aria-live="polite">
      <div className="fight-cinematic-stage" aria-hidden="true">
        <CombatantPortrait combatant={attacker} side="attacker" />
        <div className="fight-style-mark">
          <span>{style}</span>
          <b>{damage > 0 ? `-${damage}` : "break"}</b>
        </div>
        <CombatantPortrait combatant={defender} side="defender" />
      </div>
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

interface CombatantView {
  name: string;
  role: string;
  portrait?: string;
  initials: string;
}

function CombatantPortrait({ combatant, side }: { combatant: CombatantView | null; side: "attacker" | "defender" }) {
  const view = combatant ?? { name: side === "attacker" ? "Attacker" : "Target", role: side, initials: side === "attacker" ? "A" : "T" };
  return (
    <div className={`fight-portrait ${side}`}>
      <div className="fight-portrait-image">
        {view.portrait ? <img src={view.portrait} alt="" /> : <span>{view.initials}</span>}
      </div>
      <small>{view.role}</small>
      <strong>{view.name}</strong>
    </div>
  );
}

function combatantFor(world: World, actorId: string | null, fallbackName?: string): CombatantView | null {
  if (!actorId) return null;
  if (actorId === "player") {
    const chosen = world.player.characterId ? world.npcs.find((npc) => npc.id === world.player.characterId) : null;
    const name = world.player.name ?? chosen?.name ?? fallbackName ?? "Player";
    return {
      name,
      role: "Player",
      portrait: world.player.appearance?.portrait ?? chosen?.appearance?.portrait ?? "/assets/characters/player-hero.svg",
      initials: initialsFor(name),
    };
  }
  const npc = world.npcs.find((candidate) => candidate.id === actorId);
  if (!npc && !fallbackName) return null;
  return {
    name: npc?.name ?? fallbackName ?? actorId,
    role: roleFor(npc),
    portrait: npc?.appearance?.portrait,
    initials: initialsFor(npc?.name ?? fallbackName ?? actorId),
  };
}

function roleFor(npc: Npc | undefined): string {
  if (!npc) return "Combatant";
  if (npc.factionId === "challengers") return "Hostile";
  if (npc.factionId === "heroes") return "Hero";
  return npc.role ?? "Combatant";
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0]![0]}${parts.at(-1)![0]}` : name.slice(0, 2)).toUpperCase();
}
