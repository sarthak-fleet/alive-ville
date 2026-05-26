import type { DuelOpponent } from "./DuelOverlay.tsx";

export const DUEL_OPPONENTS: Record<string, DuelOpponent> = {
  sonic: {
    name: "Sonic",
    title: "Sonic the Sound-Speed Ninja",
    location: "Monster Alley",
    introLine: "Sonic blurs into stance. Pick a move.",
    victoryLine: "Sonic concedes the duel.",
    defeatLine: "You go down. Sonic vanishes.",
    maxHp: 60,
    damageMin: 6,
    damageMax: 12,
    moves: [
      { id: "strike", label: "Quick Strike", hint: "Reliable 16 damage. They counter.",     damage: 16, selfRecoil: 0 },
      { id: "feint",  label: "Feint",        hint: "9 damage · heal 8 · skips their counter.", damage: 9,  selfRecoil: -8, defensive: true },
      { id: "burst",  label: "Heavy Burst",  hint: "26 damage. 4 recoil. They counter.",    damage: 26, selfRecoil: 4 },
    ],
  },
  bang: {
    name: "Bang",
    title: "Bang, Water Stream Rock Smashing Fist",
    location: "Market Street",
    introLine: "Bang settles into a low stance. Your turn, kid.",
    victoryLine: "Bang nods and steps back. Form approved.",
    defeatLine: "Bang ends the bout with a controlled palm. Recover and try again.",
    maxHp: 70,
    damageMin: 5,
    damageMax: 11,
    moves: [
      { id: "jab",   label: "Sharp Jab",    hint: "14 damage. He counters.",               damage: 14, selfRecoil: 0 },
      { id: "guard", label: "Guard Step",   hint: "7 damage · heal 10 · skips his counter.", damage: 7,  selfRecoil: -10, defensive: true },
      { id: "river", label: "River Combo",  hint: "22 damage. 3 recoil. He counters.",     damage: 22, selfRecoil: 3 },
    ],
  },
  garou: {
    name: "Garou",
    title: "Garou, Rogue Martial Artist",
    location: "Dojo Yard",
    introLine: "Garou cracks his neck. Don't waste my time.",
    victoryLine: "Garou spits blood and grins. Decent.",
    defeatLine: "Garou pins you in two moves. He walks away laughing.",
    maxHp: 80,
    damageMin: 8,
    damageMax: 15,
    moves: [
      { id: "test",   label: "Probe Strike", hint: "13 damage. He counters.",              damage: 13, selfRecoil: 0 },
      { id: "read",   label: "Read Stance",  hint: "5 damage · heal 12 · skips his counter.", damage: 5,  selfRecoil: -12, defensive: true },
      { id: "finish", label: "Finishing Blow", hint: "30 damage. 6 recoil. He counters.",  damage: 30, selfRecoil: 6 },
    ],
  },
};

export function opponentForCharacter(characterId: string): DuelOpponent | null {
  return DUEL_OPPONENTS[characterId] ?? null;
}
