import { useEffect, useMemo, useState } from "react";

import { playSfx } from "../lib/sfx.ts";
import { attackBonus, emptyUpgrades, healBonus, playerMaxHp, type Upgrades } from "./agent-town-upgrades.ts";

export interface DuelMove {
  id: string;
  label: string;
  hint: string;
  damage: number;
  selfRecoil: number;
  defensive?: boolean;
}

export interface DuelOpponent {
  name: string;
  title: string;
  location: string;
  introLine: string;
  victoryLine: string;
  defeatLine: string;
  maxHp: number;
  damageMin: number;
  damageMax: number;
  moves: DuelMove[];
}

const PLAYER_NAME = "Tatsumaki";

type Outcome = "victory" | "defeat" | null;

interface Props {
  opponent: DuelOpponent;
  upgrades?: Upgrades;
  onClose: (outcome: Outcome) => void;
}

export function DuelOverlay({ opponent, upgrades = emptyUpgrades(), onClose }: Props) {
  const PLAYER_MAX_HP = playerMaxHp(upgrades);
  const ATTACK_BONUS = attackBonus(upgrades);
  const HEAL_BONUS = healBonus(upgrades);
  const [playerHp, setPlayerHp] = useState(PLAYER_MAX_HP);
  const [enemyHp, setEnemyHp] = useState(opponent.maxHp);
  const [log, setLog] = useState<string[]>([opponent.introLine]);
  const [busy, setBusy] = useState(false);
  const outcome: Outcome = useMemo(() => {
    if (enemyHp <= 0) return "victory";
    if (playerHp <= 0) return "defeat";
    return null;
  }, [playerHp, enemyHp]);

  useEffect(() => {
    if (outcome === "victory") playSfx("victory");
    else if (outcome === "defeat") playSfx("defeat");
  }, [outcome]);

  const playMove = (move: DuelMove) => {
    if (busy || outcome) return;
    setBusy(true);
    playSfx("hit");
    setLog((existing) => [`You use ${move.label}.`, ...existing].slice(0, 5));
    const effectiveDamage = move.damage + (move.defensive ? 0 : ATTACK_BONUS);
    const effectiveRecoil = move.selfRecoil < 0 ? move.selfRecoil - HEAL_BONUS : move.selfRecoil;
    setEnemyHp((hp) => Math.max(0, hp - effectiveDamage));
    if (effectiveRecoil !== 0) setPlayerHp((hp) => clamp(hp - effectiveRecoil, 0, PLAYER_MAX_HP));

    window.setTimeout(() => {
      setEnemyHp((current) => {
        if (current <= 0) {
          setLog((existing) => [opponent.victoryLine, ...existing].slice(0, 5));
          setBusy(false);
          return current;
        }
        if (move.defensive) {
          setLog((existing) => [`${opponent.name} swings — your guard absorbs it.`, ...existing].slice(0, 5));
          setBusy(false);
          return current;
        }
        const damage = opponent.damageMin + Math.floor(Math.random() * (opponent.damageMax - opponent.damageMin + 1));
        setPlayerHp((hp) => Math.max(0, hp - damage));
        playSfx("counter");
        setLog((existing) => [`${opponent.name} counters for ${damage}.`, ...existing].slice(0, 5));
        setBusy(false);
        return current;
      });
    }, 380);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (outcome) {
        if (event.key === "Enter" || event.key === "Escape") onClose(outcome);
        return;
      }
      const index = Number(event.key) - 1;
      if (Number.isInteger(index) && index >= 0 && index < opponent.moves.length) playMove(opponent.moves[index]!);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="sonic-duel-overlay" role="dialog" aria-label={`Duel with ${opponent.name}`}>
      <div className="sonic-duel-card">
        <header className="sonic-duel-head">
          <span>{opponent.location}</span>
          <h2>Duel · {opponent.title}</h2>
        </header>
        <div className="sonic-duel-bars">
          <HpBar name={PLAYER_NAME} hp={playerHp} max={PLAYER_MAX_HP} tone="player" />
          <HpBar name={opponent.name} hp={enemyHp} max={opponent.maxHp} tone="enemy" />
        </div>
        <ul className="sonic-duel-log">
          {log.map((entry, index) => <li key={`${index}-${entry}`}>{entry}</li>)}
        </ul>
        {!outcome ? (
          <div className="sonic-duel-moves">
            {opponent.moves.map((move, index) => (
              <button
                key={move.id}
                type="button"
                onClick={() => playMove(move)}
                disabled={busy}
              >
                <span className="sonic-duel-key">{index + 1}</span>
                <span>
                  <strong>{move.label}</strong>
                  <small>{move.hint}</small>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className={`sonic-duel-resolution ${outcome}`}>
            <strong>{outcome === "victory" ? `${opponent.name} is down.` : opponent.defeatLine}</strong>
            <button type="button" onClick={() => onClose(outcome)}>
              {outcome === "victory" ? "Continue (Enter)" : "Retreat (Enter)"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function HpBar({ name, hp, max, tone }: { name: string; hp: number; max: number; tone: "player" | "enemy" }) {
  const pct = Math.max(0, Math.min(100, Math.round((hp / max) * 100)));
  return (
    <div className={`sonic-duel-hp ${tone}`}>
      <div className="sonic-duel-hp-head">
        <span>{name}</span>
        <span>{hp}/{max}</span>
      </div>
      <div className="sonic-duel-hp-track">
        <div className="sonic-duel-hp-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
