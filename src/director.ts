import { getNpc } from "./simulation.ts";
import type { Action, ProposeRequest, ProposeResult, World } from "./types.ts";

export interface Tension {
  score: number;
  fromId: string;
  toId: string;
}

export interface DirectorOptions {
  propose?: (req: ProposeRequest) => Promise<ProposeResult>;
}

export function createDirector({ propose }: DirectorOptions = {}) {
  return async function director(world: World): Promise<Action | null> {
    const tension = findHighestTension(world);
    if (!tension) return null;

    if (propose) {
      const llmAction = await tryLlmDirector(world, tension, propose);
      if (llmAction) return llmAction;
    }
    return scriptedAction(world, tension);
  };
}

export function findHighestTension(world: World): Tension | null {
  let worst: Tension | null = null;
  let worstScore = 0;
  for (const npc of world.npcs) {
    for (const [otherId, score] of Object.entries(npc.relationships ?? {})) {
      if (otherId === npc.id) continue;
      if (!getNpc(world, otherId)) continue;
      if (score < worstScore) {
        worstScore = score;
        worst = { score, fromId: npc.id, toId: otherId };
      }
    }
  }
  return worst;
}

function scriptedAction(world: World, tension: Tension): Action {
  const from = getNpc(world, tension.fromId);
  if (!from) {
    return { type: "remember", actorId: tension.fromId, text: "Tension lingers." };
  }
  const witness = world.npcs.find((npc) => npc.id !== tension.fromId && npc.id !== tension.toId && npc.locationId === from.locationId);
  if (witness) {
    return {
      type: "gossip",
      actorId: tension.fromId,
      targetId: witness.id,
      aboutId: tension.toId,
      text: `I'm worried about ${getNpc(world, tension.toId)?.name ?? tension.toId}.`,
    };
  }
  return {
    type: "remember",
    actorId: tension.fromId,
    text: `Tension with ${getNpc(world, tension.toId)?.name ?? tension.toId} keeps lingering.`,
  };
}

async function tryLlmDirector(
  world: World,
  tension: Tension,
  propose: NonNullable<DirectorOptions["propose"]>
): Promise<Action | null> {
  const result = await propose({
    tier: "quest",
    system: "You are the village's narrative director. Inject one in-character event that pushes unresolved tension forward without railroading. Pick rumor, confront, or request. Stay short.",
    user: `Tension: ${tension.fromId} vs ${tension.toId} (relationship ${tension.score}). Locations and NPCs follow.\n\n${JSON.stringify({
      tick: world.tick,
      npcs: world.npcs.map((npc) => ({ id: npc.id, name: npc.name, locationId: npc.locationId })),
      locations: world.locations.map((loc) => loc.id),
    })}`,
  });
  if ("skipped" in result && result.skipped) return null;
  if ("error" in result && result.error) return null;
  if (!("action" in result) || !result.action || (result.action.type as string) === "skip") return null;
  return result.action as Action;
}
