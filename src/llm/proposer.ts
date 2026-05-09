import { locationName, retrieveMemories, validateAction } from "../simulation.ts";
import type { Action, Npc, ProposeRequest, ProposeResult, Tier, World } from "../types.ts";
import { logLlmCall } from "./log.ts";
import { isLlmEnabled, proposeAction } from "./router.ts";

const RECENT_TICKS = 3;
const MEMORY_LIMIT = 4;

export type ProposeFn = (req: ProposeRequest) => Promise<ProposeResult>;

export interface LlmProposerOptions {
  tier?: Tier;
  maxNpcs?: number;
  propose?: ProposeFn;
}

export function createLlmProposer({ tier = "normal", maxNpcs = 5, propose = proposeAction }: LlmProposerOptions = {}) {
  return async function llmProposer(world: World): Promise<Action[]> {
    if (!isLlmEnabled()) return [];
    const candidates = pickActiveNpcs(world).slice(0, maxNpcs);
    const proposals = await Promise.all(candidates.map((npc) => proposeOne(world, npc, tier, propose)));
    return proposals.filter((value): value is Action => Boolean(value));
  };
}

async function proposeOne(world: World, npc: Npc, tier: Tier, propose: ProposeFn): Promise<Action | null> {
  const system = buildSystem(npc);
  const user = buildContext(world, npc);
  const result = await propose({ tier, system, user });
  if ("skipped" in result && result.skipped) return null;
  if ("error" in result && result.error) return null;
  if (!("action" in result) || !result.action) return null;

  const candidate = { ...result.action, actorId: npc.id } as Action & { type: string };
  if ((candidate.type as string) === "skip") {
    logLlmCall({ kind: "skip", actorId: npc.id });
    return null;
  }

  const validation = validateAction(world, candidate);
  if (!validation.ok) {
    logLlmCall({ kind: "rejected", actorId: npc.id, reason: validation.reason, action: candidate });
    return null;
  }
  return candidate;
}

function pickActiveNpcs(world: World): Npc[] {
  return world.npcs.filter((npc) => npc.tier !== "background");
}

function buildSystem(npc: Npc): string {
  const goals = (npc.goals ?? []).join("; ");
  return [
    `You are ${npc.name} (id: ${npc.id}) in a small village simulation.`,
    `Personality / goals: ${goals || "live your life"}.`,
    `Stay in character. Short, specific, in-world actions only.`,
    `Prefer "skip" over filler. Don't repeat yesterday's confrontation.`,
  ].join("\n");
}

function buildContext(world: World, npc: Npc): string {
  const here = world.npcs.filter((other) => other.id !== npc.id && other.locationId === npc.locationId).map((other) => `${other.id} (${other.name})`);
  const everyone = world.npcs.map((other) => `${other.id}=${other.name}`).join(", ");
  const locations = world.locations.map((location) => `${location.id}=${location.name}`).join(", ");
  const memories = retrieveMemories(world, npc.id, recentKeywords(world), MEMORY_LIMIT)
    .map((memory) => `- (t${memory.tick}) ${memory.text}`)
    .join("\n") || "(none retrieved)";
  const relationships = Object.entries(npc.relationships ?? {}).map(([id, score]) => `${id}:${score}`).join(", ") || "(none)";
  const recentLog = (world.eventLog ?? []).slice(-RECENT_TICKS).flatMap((entry) => entry.actions.map((a) => `t${entry.tick}: ${a.text}`)).join("\n") || "(quiet)";

  return [
    `Tick: ${world.tick}`,
    `Your location: ${locationName(world, npc.locationId)} (${npc.locationId})`,
    `Others here: ${here.length ? here.join(", ") : "(alone)"}`,
    `All NPC ids: ${everyone}`,
    `All location ids: ${locations}`,
    `Your relationships: ${relationships}`,
    `Your retrieved memories:\n${memories}`,
    `Recent village events:\n${recentLog}`,
    ``,
    `Decide your single action this tick.`,
  ].join("\n");
}

function recentKeywords(world: World): string {
  const recent = (world.eventLog ?? []).slice(-RECENT_TICKS);
  return recent.flatMap((entry) => entry.actions.map((a) => a.text ?? "")).join(" ") || "village rumor trust";
}
