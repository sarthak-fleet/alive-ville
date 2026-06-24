import { recordChronicle } from './chronicle.ts';
import type { AgentGoal, Npc, World } from './types.ts';

/**
 * Consequences move bodies: an NPC who turned against someone doesn't sit on
 * it — they cross the map and have it out. Runs every tick after rumor
 * propagation; works scripted (no LLM), so drama unfolds offline too.
 *
 * The confrontation itself becomes shared memory for both parties AND nearby
 * witnesses, feeding the rumor network the next round of material.
 */

export interface ConfrontationEvent {
  kind: 'approach' | 'confrontation';
  actorId: string;
  targetId: string;
  text: string;
}

const CONFRONT_ID = /^(.+)_confront_(.+?)_\d+$/;

export function executeConfrontations(world: World): ConfrontationEvent[] {
  const events: ConfrontationEvent[] = [];
  for (const npc of world.npcs) {
    if (npc.combat?.defeated) continue;
    const ambition = activeConfrontation(npc);
    if (!ambition) continue;
    const match = CONFRONT_ID.exec(ambition.id);
    const holderId = match?.[2];
    const holder = holderId ? world.npcs.find((entry) => entry.id === holderId) : undefined;
    if (!holder || holder.combat?.defeated) {
      ambition.status = 'abandoned';
      continue;
    }

    if (npc.locationId !== holder.locationId) {
      const next = nextHop(world, npc.locationId, holder.locationId);
      if (!next) {
        ambition.status = 'blocked';
        ambition.blocker = 'no route';
        continue;
      }
      npc.locationId = next;
      events.push({
        kind: 'approach',
        actorId: npc.id,
        targetId: holder.id,
        text: `${npc.name} goes looking for ${holder.name}.`,
      });
      continue;
    }

    // face to face: the confrontation happens
    ambition.status = 'satisfied';
    const line = `${npc.name} confronts ${holder.name}: "I know what you've been hiding."`;
    const confrontChronicle = recordChronicle(world, {
      kind: 'confrontation',
      text: line,
      actorId: npc.id,
      targetId: holder.id,
      causeIds: ambition.chronicleId ? [ambition.chronicleId] : [],
    });
    npc.memories.push({
      tick: world.tick,
      text: `I confronted ${holder.name} about the secret. It is in the open between us now.`,
      meta: {
        importance: 6,
        visibility: 'shared',
        sourceActorId: holder.id,
        tags: ['confrontation'],
        chronicleId: confrontChronicle.id,
      },
    });
    holder.memories.push({
      tick: world.tick,
      text: `${npc.name} confronted me — they know my secret. I must decide what to do about them.`,
      meta: {
        importance: 7,
        visibility: 'private',
        sourceActorId: npc.id,
        tags: ['confrontation'],
        chronicleId: confrontChronicle.id,
      },
    });
    // the accused resents being cornered
    holder.relationships = {
      ...holder.relationships,
      [npc.id]: Math.max(-10, (holder.relationships?.[npc.id] ?? 0) - 3),
    };
    if (holder.mood) {
      holder.mood.stress = Math.min(100, holder.mood.stress + 18);
      holder.mood.suspicion = Math.min(100, holder.mood.suspicion + 10);
    }
    // bystanders saw it happen — fuel for the rumor network
    for (const witness of world.npcs) {
      if (witness.id === npc.id || witness.id === holder.id) continue;
      if (witness.locationId !== npc.locationId || witness.combat?.defeated) continue;
      witness.memories.push({
        tick: world.tick,
        text: `I watched ${npc.name} confront ${holder.name} in public. Something serious is between them.`,
        meta: { importance: 5, visibility: 'shared', tags: ['confrontation'] },
      });
    }
    events.push({ kind: 'confrontation', actorId: npc.id, targetId: holder.id, text: line });
  }
  return events;
}

function activeConfrontation(npc: Npc): AgentGoal | null {
  return (
    (npc.ambitions ?? []).find(
      (goal) => (goal.status ?? 'active') === 'active' && CONFRONT_ID.test(goal.id)
    ) ?? null
  );
}

/** BFS next hop over the exit graph (exits are mostly bidirectional) */
function nextHop(world: World, from: string, to: string): string | null {
  if (from === to) return null;
  const neighbors = new Map<string, string[]>();
  for (const exit of world.exits ?? []) {
    neighbors.set(exit.from, [...(neighbors.get(exit.from) ?? []), exit.to]);
    if (exit.bidirectional !== false)
      neighbors.set(exit.to, [...(neighbors.get(exit.to) ?? []), exit.from]);
  }
  const previous = new Map<string, string>();
  const queue = [from];
  const seen = new Set([from]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of neighbors.get(current) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      previous.set(next, current);
      if (next === to) {
        let step = to;
        while (previous.get(step) !== from) step = previous.get(step)!;
        return step;
      }
      queue.push(next);
    }
  }
  return null;
}
