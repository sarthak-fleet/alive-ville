import { CAST, type CastMember } from "./agent-town-world.ts";

export type ObservationKind =
  | "talked"
  | "saw-defeat"
  | "won-duel"
  | "lost-duel"
  | "gave-item"
  | "picked-item"
  | "asked-about";

export interface Observation {
  kind: ObservationKind;
  subject?: string;
  note?: string;
  at: number;
}

export interface NpcMemory {
  observations: Observation[];
  talkCount: number;
  lastSeenAt: number | null;
}

export type MemoryStore = Record<string, NpcMemory>;

const MAX_OBSERVATIONS_PER_NPC = 12;

export function emptyMemory(): NpcMemory {
  return { observations: [], talkCount: 0, lastSeenAt: null };
}

export function getMemory(store: MemoryStore, characterId: string): NpcMemory {
  return store[characterId] ?? emptyMemory();
}

function appendObservation(memory: NpcMemory, observation: Observation): NpcMemory {
  const observations = [observation, ...memory.observations];
  observations.length = Math.min(observations.length, MAX_OBSERVATIONS_PER_NPC);
  return { ...memory, observations };
}

export function recordTalk(store: MemoryStore, characterId: string, now: number): MemoryStore {
  const current = getMemory(store, characterId);
  const updated = appendObservation(current, { kind: "talked", at: now });
  return { ...store, [characterId]: { ...updated, talkCount: current.talkCount + 1, lastSeenAt: now } };
}

export function recordDuelOutcome(
  store: MemoryStore,
  opponentId: string,
  outcome: "victory" | "defeat",
  zoneId: string,
  now: number,
): MemoryStore {
  const next: MemoryStore = { ...store };

  // The opponent themselves remembers it
  const opponentMem = getMemory(store, opponentId);
  next[opponentId] = appendObservation(opponentMem, {
    kind: outcome === "victory" ? "lost-duel" : "won-duel",
    subject: "player",
    at: now,
  });

  // Everyone in the same zone hears about it (word of mouth)
  for (const character of CAST) {
    if (character.id === opponentId) continue;
    if (character.zoneId !== zoneId) continue;
    const mem = getMemory(store, character.id);
    next[character.id] = appendObservation(mem, {
      kind: "saw-defeat",
      subject: opponentId,
      note: outcome === "victory" ? "player won" : "player lost",
      at: now,
    });
  }
  return next;
}

export function recordItemGiven(store: MemoryStore, recipientId: string, item: string, now: number): MemoryStore {
  const mem = getMemory(store, recipientId);
  return { ...store, [recipientId]: appendObservation(mem, { kind: "gave-item", subject: item, at: now }) };
}

export function recordItemPicked(store: MemoryStore, witnessId: string | null, item: string, now: number): MemoryStore {
  if (!witnessId) return store;
  const mem = getMemory(store, witnessId);
  return { ...store, [witnessId]: appendObservation(mem, { kind: "picked-item", subject: item, at: now }) };
}

export interface Reaction {
  kind: "memory";
  line: string;
  weight: number;
}

const NAME_BY_ID: Record<string, string> = Object.fromEntries(CAST.map((member) => [member.id, member.name]));

export function reactionFor(character: CastMember, memory: NpcMemory): Reaction | null {
  const observations = memory.observations;
  if (observations.length === 0 && memory.talkCount === 0) return null;

  const wonAgainst = observations.find((obs) => obs.kind === "saw-defeat" && obs.note === "player won");
  if (wonAgainst) {
    const opponentName = NAME_BY_ID[wonAgainst.subject ?? ""] ?? "them";
    return { kind: "memory", line: `${character.name} eyes you. "Word came in about ${opponentName}. Didn't think you had it."`, weight: 9 };
  }

  const lostAgainst = observations.find((obs) => obs.kind === "saw-defeat" && obs.note === "player lost");
  if (lostAgainst) {
    const opponentName = NAME_BY_ID[lostAgainst.subject ?? ""] ?? "them";
    return { kind: "memory", line: `${character.name} smirks. "Heard ${opponentName} put you down. Try again."`, weight: 6 };
  }

  const ownLoss = observations.find((obs) => obs.kind === "lost-duel");
  if (ownLoss) {
    return { kind: "memory", line: `${character.name} watches you carefully. "Last time didn't go my way. I'm ready now."`, weight: 8 };
  }

  const gaveItem = observations.find((obs) => obs.kind === "gave-item");
  if (gaveItem) {
    return { kind: "memory", line: `${character.name} nods. "Still grateful for the ${gaveItem.subject}."`, weight: 5 };
  }

  if (memory.talkCount >= 3) {
    return { kind: "memory", line: `${character.name} sighs. "Back again. Anything new?"`, weight: 2 };
  }

  if (memory.talkCount >= 1) {
    return { kind: "memory", line: `${character.name} recognises you from before.`, weight: 1 };
  }

  return null;
}

export function summarizeMemoryForPrompt(character: CastMember, memory: NpcMemory): string {
  if (memory.observations.length === 0 && memory.talkCount === 0) {
    return `${character.name} has not interacted with the player yet.`;
  }
  const lines: string[] = [];
  if (memory.talkCount > 0) lines.push(`talked ${memory.talkCount}x before`);
  for (const obs of memory.observations.slice(0, 5)) {
    switch (obs.kind) {
      case "talked": break;
      case "saw-defeat":
        lines.push(`heard player ${obs.note ?? "fought"} ${NAME_BY_ID[obs.subject ?? ""] ?? obs.subject}`);
        break;
      case "won-duel":
        lines.push("beat the player in a duel previously");
        break;
      case "lost-duel":
        lines.push("lost a duel to the player previously");
        break;
      case "gave-item":
        lines.push(`received ${obs.subject} from the player`);
        break;
      case "picked-item":
        lines.push(`saw player take ${obs.subject}`);
        break;
      case "asked-about":
        lines.push(`player asked about ${obs.subject}`);
        break;
    }
  }
  return lines.length > 0 ? `Things ${character.name} knows: ${lines.join("; ")}.` : `${character.name} has only briefly met the player.`;
}
