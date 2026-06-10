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
  const system = buildSystem(world, npc);
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

function buildSystem(world: World, npc: Npc): string {
  const goals = (npc.goals ?? []).join("; ");
  const traits = [
    ...(npc.traits?.personality ?? []),
    ...(npc.traits?.values ?? []).map((value) => `values ${value}`),
    ...(npc.traits?.flaws ?? []).map((flaw) => `flaw: ${flaw}`),
  ].join(", ");
  return [
    `You are ${npc.name} (id: ${npc.id}) in ${world.story?.title ?? world.name}.`,
    `Role: ${npc.role ?? npc.tier ?? "villager"}.`,
    npc.factionId ? `Faction: ${npc.factionId}.` : "",
    npc.description ? `Description: ${npc.description}` : "",
    `Personality / goals: ${goals || "live your life"}.`,
    traits ? `Traits: ${traits}.` : "",
    npc.traits?.speechStyle ? `Speech style: ${npc.traits.speechStyle}.` : "",
    `Stay in character. Short, specific, in-world actions only.`,
    `You only know your memories, local context, and public world facts. Do not act on secrets you do not know.`,
    `Prefer "skip" over filler. Don't repeat yesterday's confrontation.`,
  ].filter(Boolean).join("\n");
}

function buildContext(world: World, npc: Npc): string {
  const here = world.npcs.filter((other) => other.id !== npc.id && other.locationId === npc.locationId).map((other) => `${other.id} (${other.name})`);
  const everyone = world.npcs.map((other) => `${other.id}=${other.name}`).join(", ");
  const locations = world.locations.map((location) => `${location.id}=${location.name}`).join(", ");
  const exits = reachableLocations(world, npc.locationId).join(", ") || "(none)";
  const memories = retrieveMemories(world, npc.id, recentKeywords(world), MEMORY_LIMIT)
    .map((memory) => `- (t${memory.tick}) ${memory.text}`)
    .join("\n") || "(none retrieved)";
  const relationships = Object.entries(npc.relationships ?? {}).map(([id, score]) => `${id}:${score}`).join(", ") || "(none)";
  const relationshipAxes = Object.entries(npc.relationshipAxes ?? {})
    .map(([id, axes]) => `${id}:${Object.entries(axes).map(([key, value]) => `${key}=${value}`).join("/")}`)
    .join(", ") || "(none)";
  const needs = npc.needs ? Object.entries(npc.needs).map(([key, value]) => `${key}=${value}`).join(", ") : "(unknown)";
  const mood = npc.mood ? `${npc.mood.emotion}; stress=${npc.mood.stress}; confidence=${npc.mood.confidence}; suspicion=${npc.mood.suspicion}` : "(unknown)";
  const intent = npc.plan?.currentIntent ? `${npc.plan.currentIntent.kind}: ${npc.plan.currentIntent.reason}` : "(none)";
  const ambitions = (npc.ambitions ?? [])
    .filter((goal) => (goal.status ?? "active") === "active")
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3)
    .map((goal) => `${goal.id}:${goal.title} priority=${goal.priority}${goal.blocker ? ` blocker=${goal.blocker}` : ""}`)
    .join("\n") || "(none)";
  const knownSecrets = (npc.secrets ?? [])
    .filter((secret) => (secret.knownBy ?? [npc.id]).includes(npc.id))
    .map((secret) => `- ${secret.text} (risk ${secret.risk})`)
    .join("\n") || "(none)";
  const publicRules = (world.rules ?? []).map((rule) => `- ${rule.text}`).join("\n") || "(none)";
  const recentLog = (world.eventLog ?? []).slice(-RECENT_TICKS).flatMap((entry) => entry.actions.map((a) => `t${entry.tick}: ${a.text}`)).join("\n") || "(quiet)";
  const story = world.story
    ? [
        world.story.title,
        world.story.premise,
        world.story.currentObjective ? `Current objective: ${world.story.currentObjective}` : "",
      ].filter(Boolean).join(" — ")
    : "(none)";

  return [
    `Tick: ${world.tick}`,
    `Story: ${story}`,
    `Your location: ${locationName(world, npc.locationId)} (${npc.locationId})`,
    `Others here: ${here.length ? here.join(", ") : "(alone)"}`,
    `All NPC ids: ${everyone}`,
    `All location ids: ${locations}`,
    `Reachable move location ids this tick: ${exits}`,
    `World rules:\n${publicRules}`,
    `Needs: ${needs}`,
    `Mood: ${mood}`,
    `Current intent: ${intent}`,
    `Active ambitions:\n${ambitions}`,
    `Your relationships: ${relationships}`,
    `Relationship axes: ${relationshipAxes}`,
    `Your known secrets:\n${knownSecrets}`,
    `Your retrieved memories:\n${memories}`,
    `Recent village events:\n${recentLog}`,
    ``,
    `Decide your single action this tick.`,
  ].join("\n");
}

function reachableLocations(world: World, locationId: string): string[] {
  return (world.exits ?? []).flatMap((exit) => {
    if (exit.from === locationId) return [exit.to];
    if (exit.bidirectional && exit.to === locationId) return [exit.from];
    return [];
  });
}

function recentKeywords(world: World): string {
  const recent = (world.eventLog ?? []).slice(-RECENT_TICKS);
  return recent.flatMap((entry) => entry.actions.map((a) => a.text ?? "")).join(" ") || "village rumor trust";
}
