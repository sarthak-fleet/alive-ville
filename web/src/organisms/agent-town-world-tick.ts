import type { CastMember, ZoneId } from "./agent-town-world.ts";
import { ZONES } from "./agent-town-world.ts";

export type AgentOverlay = {
  zoneId: ZoneId;
  hidden?: boolean;
};

export type AgentOverlays = Record<string, AgentOverlay>;

export type WorldAction =
  | { kind: "relocate"; characterId: string; toZone: ZoneId; reason: string }
  | { kind: "challenge"; aggressorId: string; targetId: string; winnerId: string; reason: string }
  | { kind: "abandon"; characterId: string; reason: string }
  | { kind: "idle"; reason: string };

const ZONE_IDS: ZoneId[] = ZONES.map((zone) => zone.id);

const ROLE_BIAS: Record<string, { relocate: number; challenge: number; abandon: number; idle: number }> = {
  "Errand hero":           { relocate: 5, challenge: 0, abandon: 1, idle: 2 },
  "Cyborg disciple":       { relocate: 4, challenge: 1, abandon: 0, idle: 2 },
  "Witness hero":          { relocate: 2, challenge: 0, abandon: 0, idle: 4 },
  "Ninja rival":           { relocate: 2, challenge: 5, abandon: 0, idle: 1 },
  "Psychic leader":        { relocate: 3, challenge: 1, abandon: 1, idle: 3 },
  "Legend":                { relocate: 0, challenge: 0, abandon: 0, idle: 8 },
  "Master":                { relocate: 1, challenge: 2, abandon: 0, idle: 4 },
  "Backup":                { relocate: 2, challenge: 2, abandon: 1, idle: 3 },
  "Analyst":               { relocate: 3, challenge: 0, abandon: 0, idle: 3 },
  "Rogue martial artist":  { relocate: 3, challenge: 6, abandon: 1, idle: 1 },
};

function weightedPick<T extends string>(weights: Record<T, number>, rng: () => number): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let pick = rng() * total;
  for (const [key, weight] of entries) {
    pick -= weight;
    if (pick <= 0) return key;
  }
  return entries[entries.length - 1]![0];
}

function pickRandom<T>(items: T[], rng: () => number): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(rng() * items.length)] ?? null;
}

export function chooseWorldAction(
  cast: CastMember[],
  overlays: AgentOverlays,
  rng: () => number = Math.random,
): WorldAction {
  // Only outdoor (no roomId) NPCs that aren't hidden
  const eligible = cast.filter((member) => !member.roomId && !overlays[member.id]?.hidden);
  if (eligible.length === 0) return { kind: "idle", reason: "everyone is indoors or off the map" };

  const actor = pickRandom(eligible, rng);
  if (!actor) return { kind: "idle", reason: "no actor picked" };

  const bias = ROLE_BIAS[actor.role] ?? { relocate: 3, challenge: 1, abandon: 0, idle: 3 };
  const kind = weightedPick(bias, rng);

  const currentZone = overlays[actor.id]?.zoneId ?? actor.zoneId;

  if (kind === "relocate") {
    const otherZones = ZONE_IDS.filter((zone) => zone !== currentZone);
    const toZone = pickRandom(otherZones, rng);
    if (!toZone) return { kind: "idle", reason: "no zone to move to" };
    return {
      kind: "relocate",
      characterId: actor.id,
      toZone,
      reason: reasonForRelocate(actor, toZone),
    };
  }

  if (kind === "challenge") {
    const peersInZone = eligible.filter((other) =>
      other.id !== actor.id && (overlays[other.id]?.zoneId ?? other.zoneId) === currentZone,
    );
    const target = pickRandom(peersInZone, rng);
    if (!target) return { kind: "idle", reason: `${actor.name} found nobody to spar with` };
    const winnerId = rng() < winRateOf(actor, target) ? actor.id : target.id;
    return {
      kind: "challenge",
      aggressorId: actor.id,
      targetId: target.id,
      winnerId,
      reason: reasonForChallenge(actor, target),
    };
  }

  if (kind === "abandon") {
    return {
      kind: "abandon",
      characterId: actor.id,
      reason: reasonForAbandon(actor),
    };
  }

  return { kind: "idle", reason: `${actor.name} stayed put` };
}

function winRateOf(actor: CastMember, target: CastMember): number {
  const power = (member: CastMember) => {
    if (member.id === "sonic") return 0.7;
    if (member.id === "garou") return 0.85;
    if (member.id === "bang") return 0.75;
    if (member.id === "saitama") return 0.95;
    return 0.5;
  };
  const a = power(actor);
  const b = power(target);
  return a / (a + b);
}

function reasonForRelocate(actor: CastMember, toZone: ZoneId): string {
  const targetName = ZONES.find((zone) => zone.id === toZone)?.name ?? toZone;
  const flavors: Record<string, string> = {
    "Errand hero":  `${actor.name} headed to ${targetName} for groceries.`,
    "Cyborg disciple": `${actor.name} relocated to ${targetName} to log a new anomaly.`,
    "Witness hero": `${actor.name} cycled out to ${targetName} on patrol.`,
    "Ninja rival":  `${actor.name} drifted toward ${targetName} looking for a fight.`,
    "Psychic leader": `${actor.name} moved to ${targetName} to redirect a stray crowd.`,
    "Analyst":      `${actor.name} relocated to ${targetName} to cross-reference clues.`,
    "Rogue martial artist": `${actor.name} stalked off toward ${targetName}.`,
  };
  return flavors[actor.role] ?? `${actor.name} moved to ${targetName}.`;
}

function reasonForChallenge(actor: CastMember, target: CastMember): string {
  return `${actor.name} squared off against ${target.name}.`;
}

function reasonForAbandon(actor: CastMember): string {
  return `${actor.name} stepped away from the patrol.`;
}
