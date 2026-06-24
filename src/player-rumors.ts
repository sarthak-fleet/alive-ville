import { recordChronicle } from './chronicle.ts';
import type { Npc, World } from './types.ts';

/**
 * Player-witnessed events: when the player does something visible (combat win,
 * combat loss, public confrontation) nearby NPCs gain a shared Memory with
 * subject="player" that enters the normal rumor diffusion pipeline.
 *
 * Chronicle events are stamped with playerCaused=true so the full lineage
 * (witness rumor → diffusion → dialogue reference) is traceable back to the
 * player's action.
 */

export interface PlayerWitnessedOpts {
  /** short description of the deed for the memory text */
  deed: string;
  /** importance score for the witness memory (5-7 for normal deeds) */
  importance: number;
  /** chronicles id of the action that caused this (e.g. the fight chronicle) */
  causeId?: string;
  /** NPC who directly acted (or was acted upon) — excluded from witnesses */
  actorId?: string;
  /** target NPC — excluded from witnesses */
  targetId?: string;
}

/**
 * Stamps player-subject memories on all non-defeated co-located NPCs (witnesses).
 * One chronicle event per call; every witness memory carries that same id.
 */
export function recordPlayerWitnessed(world: World, opts: PlayerWitnessedOpts): string {
  const { deed, importance, causeId, actorId, targetId } = opts;
  const excludeIds = new Set(
    [actorId, targetId, world.player.characterId].filter(
      (id): id is string => typeof id === 'string'
    )
  );
  const witnesses: Npc[] = world.npcs.filter(
    (npc) =>
      !npc.combat?.defeated && npc.locationId === world.player.locationId && !excludeIds.has(npc.id)
  );

  const chronicle = recordChronicle(world, {
    kind: 'player_witnessed',
    text: deed,
    actorId: actorId ?? 'player',
    targetId,
    causeIds: causeId ? [causeId] : [],
    playerCaused: true,
  });

  for (const witness of witnesses) {
    witness.memories.push({
      tick: world.tick,
      text: deed,
      meta: {
        importance,
        visibility: 'shared',
        subject: 'player',
        tags: ['rumor', 'player'],
        chronicleId: chronicle.id,
      },
    });
  }

  return chronicle.id;
}

/**
 * Tags the NPC who bested the player: stamps a high-importance "bested_the_player"
 * memory on the victor, records a defeat_promotion chronicle event, and enters
 * the shared rumor pipeline so other NPCs learn about it.
 */
export function tagBestedThePlayer(
  world: World,
  victorId: string,
  combatChronicleId?: string
): void {
  const victor = world.npcs.find((npc) => npc.id === victorId);
  if (!victor) return;

  const playerName = world.player.name ?? 'the outsider';
  const deed = `${victor.name} bested ${playerName} in combat.`;

  const chronicle = recordChronicle(world, {
    kind: 'defeat_promotion',
    text: deed,
    actorId: victorId,
    causeIds: combatChronicleId ? [combatChronicleId] : [],
    playerCaused: true,
  });

  victor.memories.push({
    tick: world.tick,
    text: `I bested ${playerName} in combat.`,
    meta: {
      importance: 10,
      visibility: 'shared',
      subject: 'player',
      tags: ['bested_the_player', 'rumor', 'player'],
      chronicleId: chronicle.id,
    },
  });
}

/** Returns the first NPC that has a "bested_the_player" memory, if any. */
export function findBestedThePlayerNpc(world: World): Npc | undefined {
  return world.npcs.find((npc) =>
    npc.memories.some((m) => m.meta?.tags?.includes('bested_the_player'))
  );
}
