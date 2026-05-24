import { useEffect, useMemo, useState } from "react";

import { combatMovesFor, type CombatMove } from "../../../src/combat.ts";
import { activeObjectives } from "../../../src/objectives.ts";
import type { CombatState, Npc, TickSummary, World } from "../../../src/types.ts";
import { useWorldStore, type BubbleEvent } from "../store/world.ts";

const DEFAULT_PLAYER_COMBAT: CombatState = { hp: 120, maxHp: 120, posture: 100, defeated: false };

export function CombatEncounterOverlay() {
  const world = useWorldStore((s) => s.world);
  const lastSummary = useWorldStore((s) => s.lastSummary);
  const bubbles = useWorldStore((s) => s.bubbles);
  const send = useWorldStore((s) => s.send);
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(performance.now()), 80);
    return () => window.clearInterval(id);
  }, []);

  const enemyTurn = useMemo(() => enemyTurnWindow(bubbles, now), [bubbles, now]);

  if (!world) return null;
  const playerCombat = world.player.combat ?? DEFAULT_PLAYER_COMBAT;
  const resolution = combatResolution(world, lastSummary);
  const target = currentEncounterTarget(world, lastSummary);
  const recovering = !target && (playerCombat.defeated || playerCombat.hp < playerCombat.maxHp || playerCombat.posture < 100);
  if (!resolution && !target && !recovering) return null;

  const combatMoves = combatMovesFor(world);
  const playerName = world.player.name ?? "Player";

  const useMove = async (move: CombatMove) => {
    if (!target || playerCombat.defeated || enemyTurn.active) return;
    await send({
      type: "fight",
      targetId: target.id,
      moveId: move.id,
      text: `${move.label}: ${move.description}`,
    } as never);
  };

  if (resolution) {
    return (
      <section className={`combat-encounter combat-resolution ${resolution.kind}`} aria-label="Combat result">
        <div className="combat-resolution-copy">
          <span>{resolution.kind === "victory" ? "Victory" : "Downed"}</span>
          <strong>{resolution.kind === "victory" ? `${resolution.target.name} is down` : `${playerName} needs to recover`}</strong>
          <p>
            {resolution.kind === "victory"
              ? "The immediate threat is cleared. The patrol can move on."
              : "You lost the exchange. Recover before forcing another fight."}
          </p>
        </div>
        <div className="combat-encounter-roster">
          <CombatantReadout name={playerName} label={playerCombat.defeated ? "Down" : "Player"} combat={playerCombat} />
          <div className="combat-lock-mark" aria-hidden="true">{resolution.kind === "victory" ? "KO" : "RESET"}</div>
          {resolution.kind === "victory" ? (
            <CombatantReadout name={resolution.target.name} label="Defeated" combat={resolution.target.combat} hostile />
          ) : (
            <div className="combatant-readout empty">
              <strong>Breathing room</strong>
              <span>The next beat starts after recovery.</span>
            </div>
          )}
        </div>
        <button type="button" className="encounter-recover" onClick={() => void send(null)}>
          {resolution.kind === "victory" ? "Continue patrol" : "Recover"}
        </button>
      </section>
    );
  }

  return (
    <section className={`combat-encounter ${target ? "locked" : "recovery"}${enemyTurn.active ? " enemy-turn" : ""}`} aria-label="Combat encounter" aria-busy={enemyTurn.active}>
      <div className="combat-encounter-roster">
        <CombatantReadout name={playerName} label={playerCombat.defeated ? "Down" : "Player"} combat={playerCombat} />
        <div className="combat-lock-mark" aria-hidden="true">{enemyTurn.active ? "WAIT" : target ? "VS" : "RECOVER"}</div>
        {target ? (
          <CombatantReadout name={target.name} label={target.factionId === "challengers" ? "Hostile" : "Target"} combat={target.combat} hostile />
        ) : (
          <div className="combatant-readout empty">
            <strong>Clear</strong>
            <span>No hostile target nearby.</span>
          </div>
        )}
      </div>
      {target ? (
        <div className="encounter-moves" aria-label="Encounter moves">
          {enemyTurn.active && (
            <div className="combat-turn-lock" aria-live="polite">
              <span>Enemy turn</span>
              <strong>{enemyTurn.label}</strong>
            </div>
          )}
          {combatMoves.map((move) => (
            <button
              key={move.id}
              type="button"
              className={`encounter-move ${move.style}`}
              disabled={playerCombat.defeated || enemyTurn.active}
              onClick={() => void useMove(move)}
            >
              <span>{move.style}</span>
              <strong>{move.label}</strong>
              <small>{move.damage} dmg / {move.postureDamage} pst</small>
            </button>
          ))}
        </div>
      ) : (
        <button type="button" className="encounter-recover" onClick={() => void send(null)}>
          Recover
        </button>
      )}
    </section>
  );
}

function CombatantReadout({ name, label, combat, hostile = false }: { name: string; label: string; combat?: CombatState; hostile?: boolean }) {
  const state = combat ?? { hp: 100, maxHp: 100, posture: 100, defeated: false };
  return (
    <div className={`combatant-readout${hostile ? " hostile" : ""}${state.defeated ? " defeated" : ""}`}>
      <span>{label}</span>
      <strong>{name}</strong>
      <Meter label="HP" value={state.hp} max={state.maxHp} danger={state.hp <= state.maxHp * 0.32} />
      <Meter label="Posture" value={state.posture} max={100} danger={state.posture <= 30} />
    </div>
  );
}

function Meter({ label, value, max, danger }: { label: string; value: number; max: number; danger?: boolean }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div className={`combat-meter${danger ? " danger" : ""}`}>
      <em>{label}</em>
      <i style={{ width: `${pct}%` }} />
      <b>{value}/{max}</b>
    </div>
  );
}

function currentEncounterTarget(world: World, lastSummary: TickSummary | null): Npc | null {
  if (world.player.combat?.defeated) return null;
  const recentFight = [...(lastSummary?.actions ?? [])].reverse().find((entry) =>
    entry.action.type === "fight" &&
    (entry.action.actorId === "player" || entry.action.targetId === "player")
  );
  if (recentFight?.action.type === "fight") {
    const targetId = recentFight.action.actorId === "player" ? recentFight.action.targetId : recentFight.action.actorId;
    const target = combatTargetById(world, targetId);
    if (target) return target;
  }

  const objective = activeObjectives(world)[0];
  if (objective?.storyAction === "fight_challenger" && world.player.locationId === objective.locationId) {
    return combatTargetById(world, objective.storyTargetId ?? "pax");
  }

  return world.npcs.find((npc) =>
    npc.locationId === world.player.locationId &&
    npc.id !== world.player.characterId &&
    !npc.combat?.defeated &&
    (npc.combat?.hp ?? npc.combat?.maxHp ?? 0) > 0 &&
    ((npc.combat?.hp ?? npc.combat?.maxHp ?? 0) < (npc.combat?.maxHp ?? 0) || (npc.combat?.posture ?? 100) < 100)
  ) ?? null;
}

function combatTargetById(world: World, targetId: string): Npc | null {
  const target = world.npcs.find((npc) =>
    npc.id === targetId &&
    npc.locationId === world.player.locationId &&
    npc.id !== world.player.characterId &&
    !npc.combat?.defeated
  );
  return target ?? null;
}

function combatResolution(world: World, lastSummary: TickSummary | null): { kind: "victory"; target: Npc } | { kind: "defeat" } | null {
  if (world.player.combat?.defeated) return { kind: "defeat" };
  const recentFight = [...(lastSummary?.actions ?? [])].reverse().find((entry) =>
    entry.action.type === "fight" &&
    entry.action.actorId === "player" &&
    entry.action.targetId !== "player"
  );
  const action = recentFight?.action;
  if (!action || action.type !== "fight") return null;
  const target = world.npcs.find((npc) => npc.id === action.targetId);
  if (!target?.combat?.defeated) return null;
  return { kind: "victory", target };
}

function enemyTurnWindow(bubbles: BubbleEvent[], now: number): { active: boolean; label: string } {
  const counter = [...bubbles]
    .reverse()
    .find((bubble) =>
      bubble.actionType === "fight" &&
      bubble.actorId === "player" &&
      bubble.sourceActorId !== null &&
      bubble.sourceActorId !== "player" &&
      bubble.combatStyle === "counter" &&
      now < bubble.startsAt + 900
    );
  if (!counter) return { active: false, label: "" };
  if (now < counter.startsAt) {
    const remaining = Math.max(0, Math.ceil((counter.startsAt - now) / 100) / 10);
    return { active: true, label: `Counter in ${remaining.toFixed(1)}s` };
  }
  return { active: true, label: "Resolving counter" };
}
