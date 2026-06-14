import { phasePressureRevealText, planRevealText, quietWorldRevealText } from "./story-context.ts";
import type { AgentGoalKind, AgentIntent, AppliedAction, Memory, Npc, RelationshipAxes, ScheduleBlock, World } from "./types.ts";

const DEFAULT_NEEDS = {
  safety: 50,
  trust: 50,
  resources: 50,
  status: 50,
  rest: 50,
  curiosity: 50,
  revenge: 0,
  duty: 50,
} as const;

const DEFAULT_RELATIONSHIP_AXES: Required<RelationshipAxes> = {
  trust: 0,
  affection: 0,
  fear: 0,
  respect: 0,
  debt: 0,
  suspicion: 0,
};

export interface RetrievedMemory extends Memory {
  score: number;
}

export function ensureAgentStateDefaults(world: World): void {
  world.rules ??= [];
  world.factions ??= [];
  world.tensions ??= [];
  world.villainPlans ??= [];
  world.directorState ??= { pressure: 0, quietTicks: 0, pendingReveals: [] };

  for (const npc of world.npcs) {
    npc.role ??= roleFor(npc);
    npc.needs = { ...DEFAULT_NEEDS, ...(npc.needs ?? {}) };
    npc.mood ??= { emotion: "focused", stress: 20, confidence: 50, suspicion: 20 };
    npc.traits ??= { personality: [], values: [], flaws: [], fears: [] };
    npc.ambitions ??= goalsToAmbitions(npc);
    npc.relationshipAxes ??= {};
    for (const [actorId, score] of Object.entries(npc.relationships ?? {})) {
      npc.relationshipAxes[actorId] ??= axesFromScore(score);
    }
    npc.plan ??= {};
    npc.plan.schedule ??= defaultScheduleFor(npc.id, world, npc);
    npc.plan.currentIntent ??= planAgentIntent(world, npc);
    npc.plan.nextActionHint = nextActionHint(world, npc);
    for (const memory of npc.memories) {
      memory.meta ??= memoryMetaFromText(memory.text);
    }
  }
}

export function refreshAgentIntents(world: World): void {
  for (const npc of world.npcs) {
    npc.plan ??= {};
    npc.plan.currentIntent = planAgentIntent(world, npc);
    npc.plan.nextActionHint = nextActionHint(world, npc);
  }
}

export function refreshMoods(world: World): void {
  const isNightTime = world.clock.hour >= 20 || world.clock.hour < 6;
  const directorPressure = world.directorState?.pressure ?? 0;

  for (const npc of world.npcs) {
    if (!npc.mood) continue;

    // Gradual mood shifts
    if (isNightTime) {
      npc.mood.stress = Math.max(0, npc.mood.stress - 3);
      npc.mood.suspicion = Math.min(100, npc.mood.suspicion + 2);
    } else {
      npc.mood.stress = Math.min(100, npc.mood.stress + 1);
      npc.mood.suspicion = Math.max(0, npc.mood.suspicion - 1);
    }

    // High director pressure raises village-wide anxiety
    if (directorPressure > 65) {
      npc.mood.stress = Math.min(100, npc.mood.stress + 4);
      npc.mood.emotion = "anxious";
    } else if (npc.mood.stress > 70) {
      npc.mood.emotion = "stressed";
    } else if (npc.mood.suspicion > 70) {
      npc.mood.emotion = "wary";
    } else if (npc.mood.stress < 20 && npc.mood.suspicion < 20) {
      npc.mood.emotion = "calm";
    } else {
      npc.mood.emotion = "focused";
    }
  }
}

export function advanceStoryPressure(world: World, actions: AppliedAction[]): void {
  if (world.directorState) {
    world.directorState.quietTicks = actions.length > 0 ? 0 : world.directorState.quietTicks + 1;
    world.directorState.pressure = clamp(world.directorState.pressure + (actions.length > 0 ? 2 : 8), 0, 100);
    if (world.directorState.quietTicks >= 2) {
      addPendingReveal(world, quietWorldRevealText(world));
    }
    if ((world.storyProgress?.phase === "nightfall_warning" || world.storyProgress?.phase === "shadow_confrontation") && world.directorState.quietTicks >= 1) {
      const phaseReveal = phasePressureRevealText(world);
      if (phaseReveal) addPendingReveal(world, phaseReveal);
    }
  }

  for (const plan of world.villainPlans ?? []) {
    const blocked = isPlanCountered(world, plan.id);
    if (blocked) {
      plan.pressure = clamp(plan.pressure - 18, 0, 100);
      if (plan.pressure < 25) plan.stage = Math.max(0, plan.stage - 1);
      continue;
    }

    const duskOrLater = world.clock.hour >= 18 || world.clock.hour < 6;
    const quietBonus = (world.directorState?.quietTicks ?? 0) >= 2 ? 8 : 0;
    plan.pressure = clamp(plan.pressure + (duskOrLater ? 14 : 4) + quietBonus, 0, 100);
    const nextStage = plan.pressure >= 75 ? 3 : plan.pressure >= 55 ? 2 : Math.max(1, plan.stage);
    if (nextStage > plan.stage) {
      plan.stage = nextStage;
      addPendingReveal(world, planRevealText(world, plan.id, plan.stage));
    }
  }
  advanceTensions(world);
}

function advanceTensions(world: World): void {
  const quietTicks = world.directorState?.quietTicks ?? 0;
  const duskOrNight = world.clock.hour >= 18 || world.clock.hour < 6;
  for (const tension of world.tensions ?? []) {
    if (tension.status === "resolved") continue;
    const previousStatus = tension.status ?? "quiet";
    const hiddenPlanPressure = (world.villainPlans ?? []).some((plan) =>
      plan.stage >= 2 && tension.involvedIds?.some((id) => id === plan.actorId || plan.knownFacts?.some((fact) => fact.toLowerCase().includes(id.toLowerCase())))
    ) ? 6 : 0;
    tension.pressure = clamp(tension.pressure + 2 + (quietTicks >= 2 ? 5 : 0) + (duskOrNight ? 4 : 0) + hiddenPlanPressure, 0, 100);
    tension.status = tension.pressure >= 75 ? "escalating" : tension.pressure >= 40 ? "active" : "quiet";
    if (tension.status === "escalating" && previousStatus !== "escalating") {
      addPendingReveal(world, `Tension escalated: ${tension.title}. Counterplay: ${counterplayForTension(world.id, tension.id)}`);
    }
  }
}

export function counterplayForTension(worldId: string, tensionId: string): string {
  const hints: Record<string, Record<string, string>> = {
    ashment: {
      missing_metal: "inspect the bridge marks, return Mira's shears, or bring bridge proof to Lena",
      forge_unlit: "recover dry bellows leather and rekindle Tomas's forge",
    },
    opm_z_city: {
      overpass_alert: "inspect the report board, recover proof at the overpass, or file it with Mumen Rider",
      sonic_challenge: "recover Saitama's coupon, inspect Sonic's marks, or defeat the challenger cleanly",
    },
  };
  return hints[worldId]?.[tensionId] ?? "find proof, help an involved NPC, or confront the source directly";
}

export function retrieveRelevantMemories(world: World, npcId: string, query: string, limit = 5): RetrievedMemory[] {
  const npc = world.npcs.find((candidate) => candidate.id === npcId);
  if (!npc) return [];
  const terms = tokenize(query);
  return [...npc.memories]
    .map((memory) => ({ ...memory, score: scoreMemory(world.tick, memory, terms) }))
    .filter((memory) => memory.score > 0)
    .sort((a, b) => b.score - a.score || b.tick - a.tick)
    .slice(0, limit);
}

export function planAgentIntent(world: World, npc: Npc): AgentIntent {
  const scheduled = scheduledBlockFor(world, npc);
  const activeAmbition = [...(npc.ambitions ?? [])]
    .filter((goal) => (goal.status ?? "active") === "active")
    .sort((a, b) => b.priority - a.priority)[0];
  const mood = npc.mood ?? { emotion: "focused", stress: 20, confidence: 50, suspicion: 20 };
  const safety = npc.needs?.safety ?? DEFAULT_NEEDS.safety;
  const duty = npc.needs?.duty ?? DEFAULT_NEEDS.duty;
  const suspicion = mood.suspicion + averageSuspicion(npc);
  const villainPlan = world.villainPlans?.find((plan) => plan.actorId === npc.id && plan.hidden && plan.stage > 0);

  if (villainPlan) {
    return {
      kind: "escalate",
      reason: `Advance hidden plan: ${villainPlan.objective}`,
      targetId: villainPlan.id,
      updatedTick: world.tick,
    };
  }
  if (scheduled && scheduled.locationId !== npc.locationId) {
    return {
      kind: "move",
      reason: scheduled.intent,
      targetId: scheduled.locationId,
      updatedTick: world.tick,
    };
  }
  if ((npc.secrets ?? []).some((secret) => secret.risk >= 70) && suspicion >= 50) {
    return {
      kind: "hide",
      reason: "Protect a dangerous secret while suspicion is rising.",
      targetId: npc.secrets?.[0]?.id,
      updatedTick: world.tick,
    };
  }
  if (safety < 35 || mood.stress >= 75) {
    return {
      kind: "avoid",
      reason: "Reduce exposure until stress or danger drops.",
      updatedTick: world.tick,
    };
  }
  if (activeAmbition?.kind === "investigate" || (npc.needs?.curiosity ?? 0) >= 70) {
    return {
      kind: "investigate",
      reason: activeAmbition?.title ?? "Follow the strongest unanswered clue.",
      targetId: activeAmbition?.targetId,
      updatedTick: world.tick,
    };
  }
  if (activeAmbition?.kind === "protect" || duty >= 70) {
    return {
      kind: "help",
      reason: activeAmbition?.title ?? "Protect the people or place this character feels responsible for.",
      targetId: activeAmbition?.targetId,
      updatedTick: world.tick,
    };
  }
  if (suspicion >= 65) {
    return {
      kind: "confront",
      reason: "Suspicion is high enough to challenge someone directly.",
      targetId: mostSuspiciousTarget(npc),
      updatedTick: world.tick,
    };
  }
  return {
    kind: "wait",
    reason: activeAmbition?.title ?? "Keep routine and watch for new information.",
    targetId: activeAmbition?.targetId,
    updatedTick: world.tick,
  };
}

export function scheduledBlockFor(world: World, npc: Npc): ScheduleBlock | null {
  const schedule = npc.plan?.schedule ?? defaultScheduleFor(npc.id, world, npc);
  if (!schedule.length) return null;
  return [...schedule]
    .sort((a, b) => b.hour - a.hour)
    .find((block) => world.clock.hour >= block.hour) ?? schedule.at(-1) ?? null;
}

export function memoryMetaFromText(text: string): NonNullable<Memory["meta"]> {
  const tags = tokenize(text).filter((term) => term.length > 3).slice(0, 6);
  const importance = /secret|bridge|missing|flame|whisper|danger|promise|blue|stole|hide/i.test(text) ? 7 : 4;
  const emotionalWeight = /angry|panic|scared|unsafe|blamed|confronted/i.test(text) ? 6 : 2;
  return { importance, tags, visibility: "private", emotionalWeight, sourceActorId: "world" };
}

function goalsToAmbitions(npc: Npc) {
  return (npc.goals ?? []).map((goal, index) => ({
    id: `${npc.id}_goal_${index + 1}`,
    title: goal,
    kind: inferGoalKind(goal),
    priority: Math.max(30, 80 - index * 10),
    status: "active" as const,
  }));
}

function defaultScheduleFor(npcId: string, world: World, npc?: Npc): ScheduleBlock[] {
  const schedules: Record<string, ScheduleBlock[]> = {
    mira: [
      { hour: 6, locationId: "garden", intent: "Tend moonmint and check for missing tools." },
      { hour: 14, locationId: "square", intent: "Ask neighbors what they saw near the bridge." },
      { hour: 20, locationId: "inn", intent: "Keep the moonmint cuttings safe indoors." },
    ],
    tomas: [
      { hour: 6, locationId: "forge", intent: "Repair tools and listen for the old flame." },
      { hour: 18, locationId: "bridge", intent: "Check whether the bridge quiets after forge work." },
      { hour: 21, locationId: "inn", intent: "Avoid the bridge until morning." },
    ],
    lena: [
      { hour: 6, locationId: "inn", intent: "Collect witness accounts from travelers." },
      { hour: 12, locationId: "square", intent: "Compare rumors at the notice board." },
      { hour: 18, locationId: "inn", intent: "Trim lanterns before nightfall." },
    ],
    orrin: [
      { hour: 6, locationId: "square", intent: "Guard the notice board and watch patterns." },
      { hour: 18, locationId: "inn", intent: "Trade rumors where people gather after dusk." },
    ],
    pax: [
      { hour: 6, locationId: "square", intent: "Pretend nothing is hidden behind the board." },
      { hour: 18, locationId: "bridge", intent: "Check whether the whisper still wants bright pieces." },
      { hour: 21, locationId: "wood", intent: "Hide from anyone asking about metal." },
    ],
  };
  return schedules[npcId] ?? [{
    hour: 6,
    locationId: npc?.locationId ?? world.locations[0]?.id ?? world.player.locationId,
    intent: "Follow the local routine and watch for changes.",
  }];
}

function nextActionHint(world: World, npc: Npc): string {
  const scheduled = scheduledBlockFor(world, npc);
  const intent = npc.plan?.currentIntent;
  if (scheduled && scheduled.locationId !== npc.locationId) {
    return `Should head to ${locationName(world, scheduled.locationId)}: ${scheduled.intent}`;
  }
  if (intent?.kind === "escalate") return "Will protect the hidden plan unless trust or evidence changes.";
  if (intent?.kind === "investigate") return "Will follow the strongest unresolved clue.";
  if (intent?.kind === "help") return "Will support the place or person they feel responsible for.";
  if (intent?.kind === "hide") return "Will avoid direct answers until pressure drops.";
  return scheduled?.intent ?? "Will keep routine and react to new information.";
}

function locationName(world: World, id: string): string {
  return world.locations.find((location) => location.id === id)?.name ?? id;
}

function inferGoalKind(goal: string): AgentGoalKind {
  if (/protect|keep|make sure/i.test(goal)) return "protect";
  if (/find|learn|prove|collect|investigate|admit|tell/i.test(goal)) return "investigate";
  if (/avoid|hide|secret/i.test(goal)) return "hide";
  if (/repair|restart|fix/i.test(goal)) return "repair";
  return "help";
}

function roleFor(npc: Npc): string {
  if (npc.tier === "quest") return "major character";
  if (npc.tier === "background") return "background villager";
  return "local npc";
}

function axesFromScore(score: number): Required<RelationshipAxes> {
  return {
    ...DEFAULT_RELATIONSHIP_AXES,
    trust: score,
    affection: Math.max(0, score),
    respect: Math.max(0, Math.floor(score / 2)),
    suspicion: Math.max(0, -score),
  };
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/\W+/).filter(Boolean);
}

// Memory retrieval score, ported from Generative Agents / "Smallville"
// (joonspk-research/generative_agents, Apache-2.0) and AI Town
// (a16z-infra/ai-town, MIT): combine normalized recency × importance × relevance
// instead of raw additive scores. recency uses exponential decay over ticks;
// each axis is normalized to ~[0,1] and weighted, so a salient/recent memory
// still surfaces even without a keyword hit (closer to true GA retrieval).
const MEMORY_RECENCY_DECAY = 0.97; // per tick; lower = forgets faster
const MEMORY_W_RELEVANCE = 1.0;
const MEMORY_W_IMPORTANCE = 1.0;
const MEMORY_W_RECENCY = 1.0;
const MEMORY_W_EMOTION = 0.3;

function scoreMemory(currentTick: number, memory: Memory, terms: string[]): number {
  const text = memory.text.toLowerCase();
  const tags = (memory.meta?.tags ?? []).map((tag) => tag.toLowerCase());
  // relevance: fraction of query terms hit by text or tags, in [0,1]
  const hits = terms.length === 0 ? 0 : terms.filter((term) => text.includes(term) || tags.includes(term)).length;
  const relevance = terms.length === 0 ? 0 : hits / terms.length;
  // importance: poignancy ~1–10 → [0,1]
  const importance = Math.min(1, Math.max(0, (memory.meta?.importance ?? 1) / 10));
  // recency: exponential decay since the memory was formed, in (0,1]
  const recency = MEMORY_RECENCY_DECAY ** Math.max(0, currentTick - memory.tick);
  // emotion: small bonus for emotionally charged memories, in [0,1]
  const emotion = Math.min(1, Math.abs(memory.meta?.emotionalWeight ?? 0) / 10);
  return (
    MEMORY_W_RELEVANCE * relevance +
    MEMORY_W_IMPORTANCE * importance +
    MEMORY_W_RECENCY * recency +
    MEMORY_W_EMOTION * emotion
  );
}

function averageSuspicion(npc: Npc): number {
  const axes = Object.values(npc.relationshipAxes ?? {});
  if (axes.length === 0) return 0;
  return axes.reduce((sum, value) => sum + (value.suspicion ?? 0), 0) / axes.length;
}

function mostSuspiciousTarget(npc: Npc): string | undefined {
  return Object.entries(npc.relationshipAxes ?? {})
    .sort(([, a], [, b]) => (b.suspicion ?? 0) - (a.suspicion ?? 0))[0]?.[0];
}

function isPlanCountered(world: World, planId: string): boolean {
  if (planId !== "bridge_whisper_plan") return false;
  const quests = world.quests ?? [];
  return quests.some((quest) =>
    (quest.id === "rekindle_forge" || quest.id === "bridge_whisper") && quest.status === "done"
  );
}

function addPendingReveal(world: World, text: string): void {
  world.directorState ??= { pressure: 0, quietTicks: 0, pendingReveals: [] };
  world.directorState.pendingReveals ??= [];
  if (!world.directorState.pendingReveals.includes(text)) {
    world.directorState.pendingReveals.push(text);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
