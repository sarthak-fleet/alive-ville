import { describe, expect, it } from "vitest";

import {
  applyUpgrade,
  attackBonus,
  canUpgrade,
  emptyUpgrades,
  healBonus,
  playerMaxHp,
  UPGRADE_CAP,
} from "../web/src/organisms/agent-town-upgrades.ts";

describe("agent-town upgrades", () => {
  it("starts at zeros and computes baseline stats", () => {
    const base = emptyUpgrades();
    expect(playerMaxHp(base)).toBe(80);
    expect(attackBonus(base)).toBe(0);
    expect(healBonus(base)).toBe(0);
  });

  it("levels Toughness adds HP", () => {
    let upgrades = emptyUpgrades();
    upgrades = applyUpgrade(upgrades, "toughness");
    upgrades = applyUpgrade(upgrades, "toughness");
    expect(playerMaxHp(upgrades)).toBe(110);
  });

  it("levels Power adds attack damage and Recovery adds heal", () => {
    let upgrades = emptyUpgrades();
    upgrades = applyUpgrade(upgrades, "power");
    upgrades = applyUpgrade(upgrades, "recovery");
    expect(attackBonus(upgrades)).toBe(3);
    expect(healBonus(upgrades)).toBe(5);
  });

  it("caps each upgrade at UPGRADE_CAP", () => {
    let upgrades = emptyUpgrades();
    for (let i = 0; i < UPGRADE_CAP + 2; i += 1) upgrades = applyUpgrade(upgrades, "power");
    expect(upgrades.power).toBe(UPGRADE_CAP);
    expect(canUpgrade(upgrades, "power")).toBe(false);
  });
});
