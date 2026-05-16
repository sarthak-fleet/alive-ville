import type { AgentGoalKind, AgentIntent, AppliedAction, Memory, Npc, RelationshipAxes, World } from "./types.ts";

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
    npc.plan.currentIntent ??= planAgentIntent(world, npc);
    for (const memory of npc.memories) {
      memory.meta ??= memoryMetaFromText(memory.text);
    }
  }
}

export function refreshAgentIntents(world: World): void {
  for (const npc of world.npcs) {
    npc.plan ??= {};
    npc.plan.currentIntent = planAgentIntent(world, npc);
  }
}

export function advanceStoryPressure(world: World, actions: AppliedAction[]): void {
  if (world.directorState) {
    world.directorState.quietTicks = actions.length > 0 ? 0 : world.directorState.quietTicks + 1;
    world.directorState.pressure = clamp(world.directorState.pressure + (actions.length > 0 ? 2 : 8), 0, 100);
    if (world.directorState.quietTicks >= 2) {
      addPendingReveal(world, "The village has gone quiet enough for the bridge pattern to stand out.");
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
      addPendingReveal(world, revealForPlan(plan.id, plan.stage));
    }
  }
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

function scoreMemory(currentTick: number, memory: Memory, terms: string[]): number {
  const text = memory.text.toLowerCase();
  const termScore = terms.reduce((score, term) => score + (text.includes(term) ? 10 : 0), 0);
  const tagScore = (memory.meta?.tags ?? []).reduce((score, tag) => score + (terms.includes(tag.toLowerCase()) ? 6 : 0), 0);
  const importance = memory.meta?.importance ?? 1;
  const recency = Math.max(0, 8 - Math.max(0, currentTick - memory.tick));
  const emotion = memory.meta?.emotionalWeight ?? 0;
  return termScore + tagScore + importance + recency + emotion;
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

function revealForPlan(planId: string, stage: number): string {
  if (planId === "bridge_whisper_plan") {
    if (stage >= 3) return "The bridge whisper is loud enough that loose nails tremble near the river.";
    return "A blue pulse runs from the bridge toward every missing metal object.";
  }
  return "An unresolved hidden plan is pushing the village into a new stage.";
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
