import type { ChronicleEvent, ChronicleEventKind, World } from './types.ts';

/**
 * The Chronicle: a causal trace of legible world beats. Each event records
 * what happened, when, and what caused it. `playerCaused` is inherited from
 * any cause in the lineage — that's how an offline-evolved confrontation
 * remains legible to the player as "your doing" three hops later (the
 * "memory as mirror" lesson from Shadow of Mordor Nemesis).
 *
 * Rides World.chronicle; capped in trimWorldGrowth(); recorded inline by the
 * sim (dialogue, rumors, confrontations, author, simulation, arcs).
 */

export interface ChroniclePartial {
  kind: ChronicleEventKind;
  text: string;
  actorId?: string;
  targetId?: string;
  causeIds?: string[];
  playerCaused?: boolean;
}

export function recordChronicle(world: World, partial: ChroniclePartial): ChronicleEvent {
  world.chronicle ??= [];
  const causeIds =
    partial.causeIds?.filter((id): id is string => typeof id === 'string' && id.length > 0) ?? [];
  // playerCaused is sticky: if any ancestor is player-caused, so is this beat
  const inheritedPlayerCaused = causeIds.some((id) => {
    const cause = world.chronicle!.find((entry) => entry.id === id);
    return cause?.playerCaused === true;
  });
  const playerCaused = (partial.playerCaused ?? false) || inheritedPlayerCaused;
  const sameTickCount = world.chronicle.filter((entry) => entry.tick === world.tick).length;
  const event: ChronicleEvent = {
    id: `ch_${world.tick}_${sameTickCount}`,
    tick: world.tick,
    day: world.clock.day,
    hour: Math.floor(world.clock.hour),
    kind: partial.kind,
    text: partial.text,
    actorId: partial.actorId,
    targetId: partial.targetId,
    causeIds,
    playerCaused,
  };
  world.chronicle.push(event);
  return event;
}


