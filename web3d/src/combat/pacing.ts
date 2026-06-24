/**
 * Combat pacing constants and pure helpers.
 * No browser APIs, no store imports — safe for Node/vitest.
 */

/** Distance at which a hostile NPC enters combat stance (approach + strafe mode). */
export const STANCE_RANGE = 12;

/** Distance at which combat stance drops (hysteresis prevents flicker). */
export const STANCE_EXIT_RANGE = 14;

/** Distance at which the enemy is considered in melee range and stops closing. */
export const MELEE_RANGE = 1.8;

/** Distance at which the enemy starts its telegraph. */
export const MELEE_STRIKE_RANGE = 2.2;

/** Side-step orbit speed while strafing (m/s). */
export const STRAFE_SPEED = 0.5;

/** Minimum interval (ms) between client-side chip attacks. */
export const CHIP_INTERVAL_MIN = 1600;

/** Maximum interval (ms) between client-side chip attacks. */
export const CHIP_INTERVAL_MAX = 2400;

/** Damage per chip attack (client-side, small). */
export const CHIP_DAMAGE = 5;

/**
 * Player HP floor as a fraction of maxHp: chip attacks cannot bring the
 * player below this threshold. Only server-authoritative hits (full strike
 * flag set to false) can finish the player.
 */
export const CHIP_HP_FLOOR_FRACTION = 0.1;

/**
 * Returns the next chip delay in milliseconds using the provided rng function.
 * Result is deterministic for a given rng seed.
 */
export function nextChipDelay(rng: () => number): number {
  return CHIP_INTERVAL_MIN + rng() * (CHIP_INTERVAL_MAX - CHIP_INTERVAL_MIN);
}

/**
 * Returns the damage amount to apply for a chip hit, clamped so the player
 * cannot be brought below CHIP_HP_FLOOR_FRACTION of their max HP.
 * Returns 0 if the player is already at or below the floor.
 */
export function chipDamageAllowed(currentHp: number, maxHp: number, attempted: number): number {
  const floor = Math.round(maxHp * CHIP_HP_FLOOR_FRACTION);
  if (currentHp <= floor) return 0;
  return Math.min(attempted, currentHp - floor);
}
