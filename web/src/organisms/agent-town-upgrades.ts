export interface Upgrades {
  toughness: number;
  power: number;
  recovery: number;
}

export type UpgradeKind = keyof Upgrades;

export const UPGRADE_CAP = 3;
const BASE_PLAYER_HP = 80;

export const UPGRADE_META: Record<UpgradeKind, { label: string; blurb: string; effect: string }> = {
  toughness: { label: "Toughness", blurb: "Take more punishment.", effect: "+15 Max HP" },
  power:     { label: "Power",     blurb: "Hit harder.",            effect: "+3 dmg on attacks" },
  recovery:  { label: "Recovery",  blurb: "Heal more on defense.",  effect: "+5 heal on guard moves" },
};

export function emptyUpgrades(): Upgrades {
  return { toughness: 0, power: 0, recovery: 0 };
}

export function canUpgrade(upgrades: Upgrades, kind: UpgradeKind): boolean {
  return upgrades[kind] < UPGRADE_CAP;
}

export function applyUpgrade(upgrades: Upgrades, kind: UpgradeKind): Upgrades {
  if (!canUpgrade(upgrades, kind)) return upgrades;
  return { ...upgrades, [kind]: upgrades[kind] + 1 };
}

export function playerMaxHp(upgrades: Upgrades): number {
  return BASE_PLAYER_HP + upgrades.toughness * 15;
}

export function attackBonus(upgrades: Upgrades): number {
  return upgrades.power * 3;
}

export function healBonus(upgrades: Upgrades): number {
  return upgrades.recovery * 5;
}

export function totalLevels(upgrades: Upgrades): number {
  return upgrades.toughness + upgrades.power + upgrades.recovery;
}
