/**
 * outcome.ts — pure, read-only derivations for the gameplay spine.
 *
 * core-gameplay-fix.md dimensions A + C:
 *  - nextObjective(): the HUD must ALWAYS answer "what do I do right now".
 *  - sessionOutcome(): a legible win/lose state from existing arc + director
 *    pressure, surfaced so the session has stakes.
 *
 * Both are pure functions of world state — they never mutate the sim, so they
 * cannot corrupt a save and are trivially testable. Locking/ending flow (e.g.
 * forcing a respawn on "lost") is intentionally left to gameplay tuning + a
 * playtest; this module only makes the state legible.
 */

import type { World } from "./types.ts";

export type SessionOutcome = "won" | "lost" | "ongoing";

/** Director pressure at which the session is considered lost (pressure is 0–100). */
export const PRESSURE_LOSE_THRESHOLD = 100;

export function sessionOutcome(world: World): SessionOutcome {
  const arcComplete = world.arc?.stage === "complete";
  const resolved = world.storyProgress?.phase === "dawn_after_tasks";
  if (arcComplete || resolved) return "won";
  if ((world.directorState?.pressure ?? 0) >= PRESSURE_LOSE_THRESHOLD) return "lost";
  return "ongoing";
}

/** The single most relevant "next action" for the player, never empty. */
export function nextObjective(world: World): string {
  const authored = world.story?.currentObjective?.trim();
  if (authored) return authored;

  const activePlayerQuest = (world.quests ?? []).find((quest) => quest.acceptedBy === "player" && quest.status === "active");
  if (activePlayerQuest) return activePlayerQuest.description?.trim() || `Finish: ${activePlayerQuest.title}`;

  const openQuest = (world.quests ?? []).find((quest) => quest.status === "open" || quest.status === undefined);
  if (openQuest) return `Look into: ${openQuest.title}`;

  const arc = world.arc;
  if (arc && arc.stage !== "complete") return arc.stageTexts[arc.stage];

  return "Explore the town and talk to its people.";
}
