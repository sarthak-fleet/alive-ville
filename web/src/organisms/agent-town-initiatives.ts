import type { CastMember, ZoneId } from "./agent-town-world.ts";
import { ZONES } from "./agent-town-world.ts";
import type { AgentOverlays } from "./agent-town-world-tick.ts";

export type InitiativeKind = "talk-to" | "visit-zone" | "win-duel";

export interface Initiative {
  id: string;
  kind: InitiativeKind;
  text: string;
  targetCharacterId?: string;
  targetZoneId?: ZoneId;
  createdAt: number;
  source: "llm" | "deterministic";
}

const ENDPOINT = (import.meta as { env?: { VITE_LOCAL_AI_URL?: string } }).env?.VITE_LOCAL_AI_URL ?? "http://localhost:3456/chat";

interface RequestOptions {
  cast: CastMember[];
  overlays: AgentOverlays;
  recentLog: string[];
  signal: AbortSignal;
}

export async function generateInitiative(opts: RequestOptions): Promise<Initiative> {
  const llm = await tryLlmInitiative(opts);
  if (llm) return llm;
  return deterministicInitiative(opts);
}

async function tryLlmInitiative(opts: RequestOptions): Promise<Initiative | null> {
  const visible = opts.cast.filter((member) => !member.roomId && !opts.overlays[member.id]?.hidden);
  const zoneOf = (member: CastMember) => opts.overlays[member.id]?.zoneId ?? member.zoneId;
  const roster = visible.map((m) => `${m.name} (${m.role}, ${zoneOf(m)})`).join("; ");
  const recent = opts.recentLog.slice(0, 5).join(" | ");
  const candidates = visible.map((m) => m.id).join(", ");

  const system = `You are the patrol director for a small AI sim called Agent Town. Output a single short patrol initiative the player should pursue right now. Respond ONLY with a single JSON object on one line, no prose, with fields: kind ("talk-to" | "visit-zone" | "win-duel"), targetCharacterId (string, one of: ${candidates}; required for talk-to or win-duel), targetZoneId ("hq" | "market" | "alley"; required for visit-zone), text (a short imperative sentence under 18 words). No code fences.`;
  const user = `World roster: ${roster}. Recent events: ${recent}. Pick a directive grounded in this state.`;

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "claude", model: "haiku", systemPrompt: system, messages: [{ role: "user", content: user }] }),
      signal: opts.signal,
    });
    if (!response.ok || !response.body) return null;
    const text = await consumeSseText(response);
    const parsed = extractJson(text);
    if (!parsed) return null;
    return validateInitiative(parsed, visible);
  } catch {
    return null;
  }
}

async function consumeSseText(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let combined = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload) as { text?: string };
        if (typeof parsed.text === "string") combined += parsed.text;
      } catch { /* ignore malformed */ }
    }
  }
  return combined;
}

function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function validateInitiative(raw: Record<string, unknown>, visible: CastMember[]): Initiative | null {
  const kind = raw["kind"];
  if (kind !== "talk-to" && kind !== "visit-zone" && kind !== "win-duel") return null;
  const text = typeof raw["text"] === "string" ? raw["text"].slice(0, 160) : null;
  if (!text) return null;
  if (kind === "talk-to" || kind === "win-duel") {
    const target = raw["targetCharacterId"];
    if (typeof target !== "string" || !visible.some((m) => m.id === target)) return null;
    return { id: `init-${Date.now()}`, kind, targetCharacterId: target, text, createdAt: Date.now(), source: "llm" };
  }
  if (kind === "visit-zone") {
    const zone = raw["targetZoneId"];
    if (zone !== "hq" && zone !== "market" && zone !== "alley") return null;
    return { id: `init-${Date.now()}`, kind, targetZoneId: zone, text, createdAt: Date.now(), source: "llm" };
  }
  return null;
}

function deterministicInitiative(opts: RequestOptions): Initiative {
  const visible = opts.cast.filter((m) => !m.roomId && !opts.overlays[m.id]?.hidden);
  // Pick the NPC who most recently relocated, if any
  const lastWorldEvent = opts.recentLog.find((entry) => entry.startsWith("[world] "));
  if (lastWorldEvent) {
    const moved = visible.find((m) => lastWorldEvent.includes(m.name));
    if (moved) {
      const zone = opts.overlays[moved.id]?.zoneId ?? moved.zoneId;
      const zoneName = ZONES.find((z) => z.id === zone)?.name ?? zone;
      return {
        id: `init-${Date.now()}`,
        kind: "talk-to",
        targetCharacterId: moved.id,
        text: `Catch up with ${moved.name} in ${zoneName} — they moved for a reason.`,
        createdAt: Date.now(),
        source: "deterministic",
      };
    }
  }
  const pool = visible.filter((m) => m.id !== "saitama");
  const pick = pool[Math.floor(Math.random() * pool.length)] ?? visible[0];
  if (!pick) {
    return {
      id: `init-${Date.now()}`,
      kind: "visit-zone",
      targetZoneId: "alley",
      text: "Patrol Monster Alley and check the street.",
      createdAt: Date.now(),
      source: "deterministic",
    };
  }
  const zone = opts.overlays[pick.id]?.zoneId ?? pick.zoneId;
  const zoneName = ZONES.find((z) => z.id === zone)?.name ?? zone;
  return {
    id: `init-${Date.now()}`,
    kind: "talk-to",
    targetCharacterId: pick.id,
    text: `Check in with ${pick.name} over in ${zoneName}.`,
    createdAt: Date.now(),
    source: "deterministic",
  };
}

export function initiativeCompleted(
  initiative: Initiative,
  event: { kind: "talked"; characterId: string } | { kind: "won-duel"; opponentId: string } | { kind: "entered-zone"; zoneId: ZoneId },
): boolean {
  if (initiative.kind === "talk-to" && event.kind === "talked") return initiative.targetCharacterId === event.characterId;
  if (initiative.kind === "win-duel" && event.kind === "won-duel") {
    return !initiative.targetCharacterId || initiative.targetCharacterId === event.opponentId;
  }
  if (initiative.kind === "visit-zone" && event.kind === "entered-zone") return initiative.targetZoneId === event.zoneId;
  return false;
}
