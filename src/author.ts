import { recordChronicle } from "./chronicle.ts";
import { completeText } from "./llm/router.ts";
import type { Npc, World } from "./types.ts";

/**
 * The authoring director: instead of nudging existing actions, it periodically
 * WRITES new content into the running world — a fresh quest, a new character
 * arriving, or an incident that seeds the rumor network. This is what makes a
 * long-running world feel authored rather than looping.
 */

const AUTHOR_EVERY_TICKS = 60; // ≈ every 15 in-game hours
const AUTHOR_TIMEOUT_MS = 45_000;

const AUTHOR_SYSTEM = `You are the showrunner of a living RPG world. Given its current state,
write ONE new story beat that complicates or escalates things — grounded in
the world's tone and what has already happened. Return ONLY JSON:
{"kind":"quest","quest":{"title":"<short>","description":"<one sentence, concrete>","giverName":"<existing character name>"}}
OR {"kind":"arrival","arrival":{"name":"<new character>","role":"<short epithet>","description":"<2 sentences>","locationName":"<existing location>","hair":"<hair>","outfit":"<outfit>","palette":["#hex","#hex","#hex"],"visualTags":["<3 words>"]}}
OR {"kind":"incident","incident":{"text":"<one sentence of something that just happened, concrete and rumor-worthy>","locationName":"<existing location>","pressureDelta":<-8..8>}}
Prefer beats that create CONSEQUENCES: secrets at risk, rivalries, stakes.
Never repeat a recent event. JSON only.`;

export interface AuthoredResult {
  text: string;
  focusActorId: string;
}

export function shouldAuthorBeat(world: World): boolean {
  const last = world.directorState?.lastAuthoredTick ?? 0;
  return world.tick - last >= AUTHOR_EVERY_TICKS;
}

export async function authorBeat(world: World, complete: typeof completeText = completeText): Promise<AuthoredResult | null> {
  world.directorState ??= { pressure: 0, quietTicks: 0 };
  world.directorState.lastAuthoredTick = world.tick;

  const user = describeWorldForAuthor(world);
  const result = await complete({
    tier: "quest",
    system: AUTHOR_SYSTEM,
    user,
    timeoutMs: AUTHOR_TIMEOUT_MS,
    model: process.env["LLM_MODEL_RESEARCH"] ?? undefined,
  });
  if (!("text" in result) || !result.text) return null;
  const beat = parseBeat(result.text);
  if (!beat) return null;

  const applied =
    beat.kind === "quest" && beat.quest ? applyQuestBeat(world, beat.quest) :
    beat.kind === "arrival" && beat.arrival ? applyArrivalBeat(world, beat.arrival) :
    beat.kind === "incident" && beat.incident ? applyIncidentBeat(world, beat.incident) :
    null;
  if (applied) {
    recordChronicle(world, {
      kind: "authored",
      text: applied.text,
      actorId: applied.focusActorId,
    });
  }
  return applied;
}

// ---------------------------------------------------------------------------

interface BeatJson {
  kind?: string;
  quest?: { title?: string; description?: string; giverName?: string };
  arrival?: {
    name?: string;
    role?: string;
    description?: string;
    locationName?: string;
    hair?: string;
    outfit?: string;
    palette?: string[];
    visualTags?: string[];
  };
  incident?: { text?: string; locationName?: string; pressureDelta?: number };
}

function parseBeat(text: string): BeatJson | null {
  const trimmed = text.replace(/```(?:json)?/g, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as BeatJson;
  } catch {
    return null;
  }
}

function describeWorldForAuthor(world: World): string {
  const recent = world.eventLog
    .slice(-12)
    .flatMap((summary) => summary.actions.map((entry) => entry.text))
    .slice(-14);
  const cast = world.npcs
    .filter((npc) => !npc.combat?.defeated)
    .map((npc) => `${npc.name} (${npc.role ?? "resident"}) at ${locationNameOf(world, npc.locationId)} — wants: ${npc.goals?.[0] ?? "?"}`);
  const tensions = (world.tensions ?? []).map((tension) => `${tension.title} (pressure ${tension.pressure ?? "?"})`);
  const villain = world.villainPlans?.[0];
  return [
    `World: ${world.story?.title ?? world.name}. ${world.story?.premise ?? ""}`,
    `Day ${world.clock.day}, arc stage: ${world.arc?.stage ?? "none"}.`,
    `Cast:\n${cast.join("\n")}`,
    `Locations: ${world.locations.map((location) => location.name).join(", ")}`,
    tensions.length ? `Tensions: ${tensions.join("; ")}` : "",
    villain ? `Villain plan: ${villain.title} (stage ${villain.stage})` : "",
    recent.length ? `Recent events:\n${recent.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function locationNameOf(world: World, id: string): string {
  return world.locations.find((location) => location.id === id)?.name ?? id;
}

function locationIdByName(world: World, name: string | undefined): string {
  if (name) {
    const hit = world.locations.find((location) => location.name.toLowerCase() === name.toLowerCase());
    if (hit) return hit.id;
  }
  return world.locations[0]!.id;
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function applyQuestBeat(world: World, quest: NonNullable<BeatJson["quest"]>): AuthoredResult | null {
  if (!quest.title || !quest.giverName) return null;
  const giver = world.npcs.find((npc) => npc.name.toLowerCase() === quest.giverName!.toLowerCase()) ?? world.npcs[0];
  if (!giver) return null;
  const dynamicCount = (world.quests ?? []).filter((entry) => entry.id.startsWith("dyn_")).length;
  if (dynamicCount >= 10) return null;
  world.quests = [
    ...(world.quests ?? []),
    {
      id: `dyn_author_${world.tick}_${slug(quest.title).slice(0, 24)}`,
      title: quest.title,
      description: quest.description,
      giverId: giver.id,
      status: "open",
      rewards: { relationshipDelta: { [giver.id]: 2 } },
    },
  ];
  giver.memories.push({
    tick: world.tick,
    text: `New trouble: ${quest.description ?? quest.title}. I need help with this.`,
    meta: { importance: 6, visibility: "shared", tags: ["quest"] },
  });
  return { text: `${giver.name} has new trouble: ${quest.title}`, focusActorId: giver.id };
}

function applyArrivalBeat(world: World, arrival: NonNullable<BeatJson["arrival"]>): AuthoredResult | null {
  if (!arrival.name) return null;
  const id = slug(arrival.name);
  if (world.npcs.some((npc) => npc.id === id)) return null;
  if (world.npcs.length >= 16) return null; // keep the town readable
  const locationId = locationIdByName(world, arrival.locationName);
  const npc: Npc = {
    id,
    name: arrival.name,
    locationId,
    role: arrival.role,
    description: arrival.description,
    tier: "normal",
    relationships: {},
    appearance: {
      sourceLook: `${arrival.name} / ${arrival.role ?? "newcomer"}`,
      hair: arrival.hair,
      outfit: arrival.outfit,
      palette: arrival.palette,
      visualTags: arrival.visualTags ?? ["newcomer"],
    },
    memories: [
      {
        tick: world.tick,
        text: `I have just arrived at ${locationNameOf(world, locationId)}. ${arrival.description ?? ""}`,
        meta: { importance: 5, visibility: "shared", tags: ["arrival"] },
      },
    ],
    goals: [`find my footing in ${world.story?.title ?? world.name}`],
  };
  world.npcs = [...world.npcs, npc];
  return { text: `A stranger arrives: ${arrival.name}, ${arrival.role ?? "newcomer"}.`, focusActorId: id };
}

function applyIncidentBeat(world: World, incident: NonNullable<BeatJson["incident"]>): AuthoredResult | null {
  if (!incident.text) return null;
  const locationId = locationIdByName(world, incident.locationName);
  const witnesses = world.npcs.filter((npc) => npc.locationId === locationId && !npc.combat?.defeated).slice(0, 2);
  const fallback = world.npcs.find((npc) => !npc.combat?.defeated);
  const tellers = witnesses.length > 0 ? witnesses : fallback ? [fallback] : [];
  for (const witness of tellers) {
    witness.memories.push({
      tick: world.tick,
      text: `I witnessed it: ${incident.text}`,
      meta: { importance: 6, visibility: "shared", tags: ["incident"] },
    });
  }
  if (world.directorState && typeof incident.pressureDelta === "number") {
    world.directorState.pressure = Math.max(0, Math.min(100, world.directorState.pressure + incident.pressureDelta));
  }
  return tellers.length > 0 ? { text: incident.text, focusActorId: tellers[0]!.id } : null;
}
