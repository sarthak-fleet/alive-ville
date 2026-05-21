import type { World } from "./types.ts";

export interface CombatMove {
  id: string;
  label: string;
  style: "strike" | "rush" | "counter" | "guard" | "special" | "finisher";
  description: string;
  impact: string;
  damage: number;
  postureDamage: number;
}

const OPM_MOVES: CombatMove[] = [
  {
    id: "normal_punch",
    label: "Normal Punch",
    style: "strike",
    description: "A clean direct hit that ends low-stakes trouble fast.",
    impact: "lands a clean normal punch",
    damage: 30,
    postureDamage: 18,
  },
  {
    id: "consecutive_normal_punches",
    label: "Consecutive Normal Punches",
    style: "rush",
    description: "A short rush combo for stopping a fast opponent.",
    impact: "chains consecutive normal punches",
    damage: 42,
    postureDamage: 24,
  },
  {
    id: "serious_side_step",
    label: "Serious Side Step",
    style: "counter",
    description: "A sudden reposition that breaks the opponent's angle.",
    impact: "vanishes into a serious side step",
    damage: 18,
    postureDamage: 32,
  },
  {
    id: "guard_break",
    label: "Guard Break",
    style: "strike",
    description: "A compact hit that punishes showy defense.",
    impact: "cracks the guard with a compact hit",
    damage: 34,
    postureDamage: 34,
  },
  {
    id: "justice_crash",
    label: "Justice Crash",
    style: "special",
    description: "A heroic tackle for interrupting a challenge speech.",
    impact: "throws a Justice Crash tackle",
    damage: 36,
    postureDamage: 26,
  },
  {
    id: "clean_finisher",
    label: "Clean Finisher",
    style: "finisher",
    description: "A restrained final blow that clears the patrol loop.",
    impact: "ends the exchange with a restrained finisher",
    damage: 120,
    postureDamage: 100,
  },
];

const DEFAULT_MOVES: CombatMove[] = [
  {
    id: "quick_strike",
    label: "Quick Strike",
    style: "strike",
    description: "A basic interrupting hit.",
    impact: "lands a quick strike",
    damage: 22,
    postureDamage: 16,
  },
  {
    id: "guard",
    label: "Guard",
    style: "guard",
    description: "Brace and reduce incoming pressure.",
    impact: "guards and absorbs the pressure",
    damage: 8,
    postureDamage: 28,
  },
  {
    id: "counter",
    label: "Counter",
    style: "counter",
    description: "Wait for an opening and answer back.",
    impact: "counters through the opening",
    damage: 24,
    postureDamage: 30,
  },
  {
    id: "rush",
    label: "Rush",
    style: "rush",
    description: "Close distance before the target can reset.",
    impact: "rushes the target",
    damage: 28,
    postureDamage: 18,
  },
  {
    id: "special",
    label: "Special",
    style: "special",
    description: "Use the character's signature move.",
    impact: "uses a special move",
    damage: 34,
    postureDamage: 24,
  },
  {
    id: "finisher",
    label: "Finisher",
    style: "finisher",
    description: "End the exchange decisively.",
    impact: "ends the exchange",
    damage: 100,
    postureDamage: 100,
  },
];

export function combatMovesFor(worldOrId: World | string): CombatMove[] {
  const worldId = typeof worldOrId === "string" ? worldOrId : worldOrId.id;
  return worldId === "opm_z_city" ? OPM_MOVES : DEFAULT_MOVES;
}

export function combatMoveFor(world: World, moveId: string | undefined): CombatMove {
  const moves = combatMovesFor(world);
  return moves.find((move) => move.id === moveId) ?? moves[0]!;
}
