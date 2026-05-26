import { useEffect } from "react";

import { playSfx } from "../lib/sfx.ts";
import { canUpgrade, UPGRADE_CAP, UPGRADE_META, type UpgradeKind, type Upgrades } from "./agent-town-upgrades.ts";

interface Props {
  opponentName: string;
  upgrades: Upgrades;
  onPick: (kind: UpgradeKind) => void;
}

const ORDER: UpgradeKind[] = ["toughness", "power", "recovery"];

export function UpgradeOverlay({ opponentName, upgrades, onPick }: Props) {
  useEffect(() => {
    playSfx("victory");
  }, []);

  return (
    <div className="upgrade-overlay" role="dialog" aria-label="Choose upgrade">
      <div className="upgrade-card">
        <span className="upgrade-eyebrow">{opponentName} down · pick a perk</span>
        <h2>Level up</h2>
        <div className="upgrade-options">
          {ORDER.map((kind) => {
            const meta = UPGRADE_META[kind];
            const level = upgrades[kind];
            const locked = !canUpgrade(upgrades, kind);
            return (
              <button
                key={kind}
                type="button"
                className={`upgrade-option ${locked ? "locked" : ""}`}
                disabled={locked}
                onClick={() => onPick(kind)}
              >
                <span className="upgrade-option-head">
                  <strong>{meta.label}</strong>
                  <span className="upgrade-pip">{level}/{UPGRADE_CAP}</span>
                </span>
                <small>{meta.blurb}</small>
                <span className="upgrade-effect">{meta.effect}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
