import type { World } from './types.ts';

export interface CombatMove {
  id: string;
  label: string;
  style: 'strike' | 'rush' | 'counter' | 'guard' | 'special' | 'finisher';
  description: string;
  impact: string;
  damage: number;
  postureDamage: number;
}

const OPM_MOVES: CombatMove[] = [
  {
    id: 'normal_punch',
    label: 'Normal Punch',
    style: 'strike',
    description: 'A clean direct hit that ends low-stakes trouble fast.',
    impact: 'lands a clean normal punch',
    damage: 30,
    postureDamage: 18,
  },
  {
    id: 'consecutive_normal_punches',
    label: 'Consecutive Normal Punches',
    style: 'rush',
    description: 'A short rush combo for stopping a fast opponent.',
    impact: 'chains consecutive normal punches',
    damage: 42,
    postureDamage: 24,
  },
  {
    id: 'serious_side_step',
    label: 'Serious Side Step',
    style: 'counter',
    description: "A sudden reposition that breaks the opponent's angle.",
    impact: 'vanishes into a serious side step',
    damage: 18,
    postureDamage: 32,
  },
  {
    id: 'guard_break',
    label: 'Guard Break',
    style: 'strike',
    description: 'A compact hit that punishes showy defense.',
    impact: 'cracks the guard with a compact hit',
    damage: 34,
    postureDamage: 34,
  },
  {
    id: 'justice_crash',
    label: 'Justice Crash',
    style: 'special',
    description: 'A heroic tackle for interrupting a challenge speech.',
    impact: 'throws a Justice Crash tackle',
    damage: 36,
    postureDamage: 26,
  },
  {
    id: 'clean_finisher',
    label: 'Clean Finisher',
    style: 'finisher',
    description: 'A restrained final blow that clears the patrol loop.',
    impact: 'ends the exchange with a restrained finisher',
    damage: 120,
    postureDamage: 100,
  },
];

const OPM_CHARACTER_MOVES: Record<string, CombatMove[]> = {
  tomas: [
    opmMove(
      'normal_punch',
      'Cyborg Jab',
      'strike',
      'A precise mechanical hit that tests armor and timing.',
      'fires a precise cyborg jab',
      30,
      18
    ),
    opmMove(
      'consecutive_normal_punches',
      'Machine Gun Blows',
      'rush',
      'A rapid cyborg rush that keeps a fast opponent boxed in.',
      'unleashes machine gun blows',
      42,
      24
    ),
    opmMove(
      'serious_side_step',
      'Afterburner Feint',
      'counter',
      'A booster-assisted angle change that breaks pursuit.',
      'burns sideways through an afterburner feint',
      18,
      32
    ),
    opmMove(
      'guard_break',
      'Arm Cannon Break',
      'strike',
      'A compact cannon burst that cracks showy defense.',
      'cracks the guard with an arm cannon burst',
      34,
      34
    ),
    opmMove(
      'justice_crash',
      'Incineration Burst',
      'special',
      'A controlled blast for interrupting a challenge speech.',
      'fires a controlled incineration burst',
      36,
      26
    ),
    opmMove(
      'clean_finisher',
      'Core-Heat Finisher',
      'finisher',
      'A restrained core blast that ends the patrol exchange.',
      'ends the exchange with a restrained core blast',
      120,
      100
    ),
  ],
  lena: [
    opmMove(
      'normal_punch',
      'Justice Punch',
      'strike',
      'A committed hero strike that keeps pressure honest.',
      'lands a committed justice punch',
      30,
      18
    ),
    opmMove(
      'consecutive_normal_punches',
      'Bicycle Rush',
      'rush',
      'A brave rush combo for stopping a fast opponent.',
      'chains a bicycle rush combo',
      42,
      24
    ),
    opmMove(
      'serious_side_step',
      'Heroic Sidestep',
      'counter',
      "A stubborn reposition that breaks the opponent's angle.",
      'slides into a heroic sidestep',
      18,
      32
    ),
    opmMove(
      'guard_break',
      'Justice Guard Break',
      'strike',
      'A compact hit backed by stubborn timing.',
      'breaks the guard with stubborn timing',
      34,
      34
    ),
    opmMove(
      'justice_crash',
      'Justice Crash',
      'special',
      'A heroic tackle for interrupting a challenge speech.',
      'throws a Justice Crash tackle',
      36,
      26
    ),
    opmMove(
      'clean_finisher',
      'Citizen-Safe Finish',
      'finisher',
      'A clean final hit that protects bystanders first.',
      'ends the exchange with a citizen-safe finish',
      120,
      100
    ),
  ],
  mira: OPM_MOVES,
  orrin: [
    opmMove(
      'normal_punch',
      'Psychic Jab',
      'strike',
      "A clipped telekinetic hit that tests the rival's guard.",
      'lands a clipped psychic jab',
      30,
      18
    ),
    opmMove(
      'consecutive_normal_punches',
      'Telekinetic Barrage',
      'rush',
      'A rapid psychic barrage that boxes in a fast opponent.',
      'chains a telekinetic barrage',
      42,
      24
    ),
    opmMove(
      'serious_side_step',
      'Vector Shift',
      'counter',
      "A sudden psychic displacement that breaks the opponent's angle.",
      'vanishes through a vector shift',
      18,
      32
    ),
    opmMove(
      'guard_break',
      'Gravity Crush',
      'strike',
      'A compact gravity spike that punishes showy defense.',
      'cracks the guard with a gravity crush',
      34,
      34
    ),
    opmMove(
      'justice_crash',
      'Psychic Maelstrom',
      'special',
      'A controlled psychic surge for interrupting a challenge speech.',
      'throws a controlled psychic maelstrom',
      36,
      26
    ),
    opmMove(
      'clean_finisher',
      'Psychic Seal',
      'finisher',
      'A restrained psychic bind that clears the patrol loop.',
      'ends the exchange with a restrained psychic seal',
      120,
      100
    ),
  ],
};

const DEFAULT_MOVES: CombatMove[] = [
  {
    id: 'quick_strike',
    label: 'Quick Strike',
    style: 'strike',
    description: 'A basic interrupting hit.',
    impact: 'lands a quick strike',
    damage: 22,
    postureDamage: 16,
  },
  {
    id: 'guard',
    label: 'Guard',
    style: 'guard',
    description: 'Brace and reduce incoming pressure.',
    impact: 'guards and absorbs the pressure',
    damage: 8,
    postureDamage: 28,
  },
  {
    id: 'counter',
    label: 'Counter',
    style: 'counter',
    description: 'Wait for an opening and answer back.',
    impact: 'counters through the opening',
    damage: 24,
    postureDamage: 30,
  },
  {
    id: 'rush',
    label: 'Rush',
    style: 'rush',
    description: 'Close distance before the target can reset.',
    impact: 'rushes the target',
    damage: 28,
    postureDamage: 18,
  },
  {
    id: 'special',
    label: 'Special',
    style: 'special',
    description: "Use the character's signature move.",
    impact: 'uses a special move',
    damage: 34,
    postureDamage: 24,
  },
  {
    id: 'finisher',
    label: 'Finisher',
    style: 'finisher',
    description: 'End the exchange decisively.',
    impact: 'ends the exchange',
    damage: 100,
    postureDamage: 100,
  },
];

export function combatMovesFor(worldOrId: World | string): CombatMove[] {
  const worldId = typeof worldOrId === 'string' ? worldOrId : worldOrId.id;
  if (worldId !== 'opm_z_city') return DEFAULT_MOVES;
  if (typeof worldOrId === 'string') return OPM_MOVES;
  return OPM_CHARACTER_MOVES[worldOrId.player.characterId ?? ''] ?? OPM_MOVES;
}

export function combatMoveFor(world: World, moveId: string | undefined): CombatMove {
  const moves = combatMovesFor(world);
  return moves.find((move) => move.id === moveId) ?? moves[0]!;
}

function opmMove(
  id: CombatMove['id'],
  label: string,
  style: CombatMove['style'],
  description: string,
  impact: string,
  damage: number,
  postureDamage: number
): CombatMove {
  return { id, label, style, description, impact, damage, postureDamage };
}
