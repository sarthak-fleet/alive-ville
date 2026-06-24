/**
 * Pure combat helper functions extracted for testability.
 * No browser APIs or store imports — safe to run in Node.
 */

/**
 * Returns true when the player's FSM state has dodge i-frames active,
 * meaning an incoming enemy swing would whiff.
 */
export function wasDodgedInWindow(playerStateKind: string): boolean {
  return playerStateKind === 'dodge';
}
