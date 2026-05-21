import {
  advanceStoryPressure,
  ensureAgentStateDefaults,
  memoryMetaFromText,
  refreshAgentIntents,
  retrieveRelevantMemories,
  scheduledBlockFor,
} from "./agents.ts";
import { combatMoveFor, combatMovesFor } from "./combat.ts";
import {
  advanceNightfallTravel,
  ensureStoryProgress,
  resolveShadowConfrontation,
  syncStoryProgress,
} from "./story-progress.ts";
import type {
  Action,
  ActionResult,
  ActionType,
  AgentMood,
  AppliedAction,
  CombatState,
  Director,
  Item,
  Npc,
  PlayerAction,
  Proposer,
  Quest,
  RejectedAction,
  RelationshipAxes,
  TickSummary,
  World,
} from "./types.ts";
import { HOURS_PER_DAY } from "./types.ts";

const ACTION_TYPES: Set<ActionType> = new Set([
  "move", "talk", "gossip", "confront", "fight", "choose_character", "remember",
  "inspect", "pickup", "drop", "give",
  "offer_quest", "accept_quest", "complete_quest", "fail_quest",
]);

export function cloneWorld(world: World): World {
  return JSON.parse(JSON.stringify(world)) as World;
}

function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export interface EngineOptions {
  propose?: Proposer;
  director?: Director;
}

export interface Engine {
  state: World;
  tick(playerAction?: PlayerAction): Promise<TickSummary>;
  npc(id: string): Npc | undefined;
  /** Replace world state from a snapshot. Mutates the existing state
   *  object so existing closures keep working. */
  setState(world: World): void;
}

export function createEngine(world: World, { propose, director }: EngineOptions = {}): Engine {
  const state = cloneWorld(world);
  ensureWorldDefaults(state);
  return {
    state,
    async tick(playerAction) {
      return runTick(state, playerAction, { propose, director });
    },
    npc(id) {
      return getNpc(state, id);
    },
    setState(next) {
      const cloned = cloneWorld(next);
      ensureWorldDefaults(cloned);
      const bag = state as unknown as Record<string, unknown>;
      for (const k of Object.keys(bag)) delete bag[k];
      Object.assign(state, cloned);
    },
  };
}

function ensureWorldDefaults(world: World): void {
  world.exits ??= [];
  world.items ??= [];
  world.interactables ??= [];
  world.clock ??= { hoursPerTick: 1, hour: 8, day: 1 };
  world.eventLog ??= [];
  ensureAgentStateDefaults(world);
  ensureCombatDefaults(world);
  ensureStoryProgress(world);
}

export async function runTick(
  world: World,
  playerAction?: PlayerAction,
  { propose, director }: EngineOptions = {}
): Promise<TickSummary> {
  ensureWorldDefaults(world);
  const actions: AppliedAction[] = [];
  const rejected: RejectedAction[] = [];

  if (playerAction) {
    const result = applyAction(world, { ...playerAction, actorId: "player" } as Action);
    (result.applied ? actions : rejected).push(result as AppliedAction & RejectedAction);
  }

  const proposer = propose ?? proposeNpcActions;
  const proposed = (await proposer(world)) ?? [];
  for (const action of proposed) {
    const result = applyAction(world, action);
    (result.applied ? actions : rejected).push(result as AppliedAction & RejectedAction);
  }

  if (director && actions.length === 0) {
    const directed = await director(world);
    if (directed) {
      const result = applyAction(world, directed);
      const tagged = { ...result, fromDirector: true } as ActionResult;
      (tagged.applied ? actions : rejected).push(tagged as AppliedAction & RejectedAction);
    }
  }

  world.tick += 1;
  advanceClock(world);
  syncStoryProgress(world);
  advanceStoryPressure(world, actions);
  refreshAgentIntents(world);
  const summary = summarizeTick(world, actions, rejected);
  world.eventLog.push(summary);
  return summary;
}

function advanceClock(world: World): void {
  world.clock.hour += world.clock.hoursPerTick;
  while (world.clock.hour >= HOURS_PER_DAY) {
    world.clock.hour -= HOURS_PER_DAY;
    world.clock.day += 1;
  }
}

export function applyAction(world: World, action: Action): ActionResult {
  ensureWorldDefaults(world);
  const validation = validateAction(world, action);
  if (!validation.ok) {
    return { applied: false, action, reason: validation.reason };
  }

  switch (action.type) {
    case "move": {
      if (action.actorId === "player") {
        world.player = { ...(world.player ?? { locationId: action.locationId }), locationId: action.locationId };
        advanceNightfallTravel(world, action.locationId);
      } else {
        const npc = mustNpc(world, action.actorId);
        npc.locationId = action.locationId;
      }
      return applied(action, `${nameOf(world, action.actorId)} moved to ${locationName(world, action.locationId)}.`);
    }
    case "talk":
      remember(world, action.targetId, `${nameOf(world, action.actorId)} said: ${action.text}`);
      remember(world, action.actorId, `Told ${nameOf(world, action.targetId)}: ${action.text}`);
      applyTalkConsequences(world, action.actorId, action.targetId, action.text);
      return applied(action, `${nameOf(world, action.actorId)} spoke with ${nameOf(world, action.targetId)}.`);
    case "gossip":
      remember(world, action.targetId, `${nameOf(world, action.actorId)} shared a rumor: ${action.text}`);
      remember(world, action.actorId, `Shared a rumor with ${nameOf(world, action.targetId)} about ${nameOf(world, action.aboutId)}: ${action.text}`);
      adjustRelationship(world, action.actorId, action.aboutId, -1, { trust: -1, suspicion: 2 });
      adjustRelationship(world, action.targetId, action.aboutId, -1, { trust: -1, suspicion: 2, fear: 1 });
      adjustRelationshipAxes(world, action.targetId, action.actorId, { trust: 1, respect: action.text.length > 12 ? 1 : 0 });
      nudgeMood(world, action.targetId, { suspicion: 4, stress: 2 });
      return applied(action, `${nameOf(world, action.actorId)} gossiped to ${nameOf(world, action.targetId)} about ${nameOf(world, action.aboutId)}.`);
    case "confront":
      remember(world, action.targetId, `${nameOf(world, action.actorId)} confronted you: ${action.text}`);
      remember(world, action.actorId, `Confronted ${nameOf(world, action.targetId)}: ${action.text}`);
      adjustRelationship(world, action.actorId, action.targetId, -2, { trust: -1, respect: 1, suspicion: 2 });
      adjustRelationship(world, action.targetId, action.actorId, -1, { trust: -2, fear: 1, suspicion: 3 });
      nudgeMood(world, action.actorId, { confidence: 3, stress: 1 });
      nudgeMood(world, action.targetId, { stress: 8, suspicion: 5, confidence: -3 });
      if (action.actorId === "player" && isStoryConfrontationTarget(world, action.targetId)) {
        resolveShadowConfrontation(world);
      }
      return applied(action, `${nameOf(world, action.actorId)} confronted ${nameOf(world, action.targetId)}.`);
    case "fight":
      applyFightDamage(world, action.targetId, action.moveId);
      remember(world, action.targetId, `${nameOf(world, action.actorId)} used ${combatMoveFor(world, action.moveId).label}: ${action.text ?? "No speech, just action."}`);
      remember(world, action.actorId, `Used ${combatMoveFor(world, action.moveId).label} on ${nameOf(world, action.targetId)}: ${action.text ?? "No speech, just action."}`);
      adjustRelationship(world, action.actorId, action.targetId, -3, { trust: -2, respect: 2, suspicion: 2 });
      adjustRelationship(world, action.targetId, action.actorId, -2, { trust: -2, fear: 2, respect: 1, suspicion: 3 });
      nudgeMood(world, action.actorId, { confidence: 8, stress: 3 });
      nudgeMood(world, action.targetId, { stress: 12, confidence: -8, suspicion: 5 });
      if (getNpc(world, action.targetId)?.combat?.defeated) resolveFightConsequences(world, action.actorId, action.targetId);
      return applied(action, fightOutcomeText(world, action.actorId, action.targetId, action.moveId));
    case "choose_character": {
      const chosen = mustNpc(world, action.targetId);
      world.player = {
        ...world.player,
        characterId: chosen.id,
        name: chosen.name,
        appearance: chosen.appearance ? clonePlain(chosen.appearance) : undefined,
        locationId: chosen.locationId,
      };
      remember(world, chosen.id, `${nameOf(world, action.actorId)} chose to play as ${chosen.name}.`);
      return applied(action, `${nameOf(world, action.actorId)} is now playing as ${chosen.name}.`);
    }
    case "inspect": {
      const prop = mustProp(world, action.propId);
      prop.inspected = true;
      if (action.actorId !== "player") remember(world, action.actorId, `Inspected ${prop.name}: ${prop.inspectText}`);
      if (prop.pressureDelta && world.directorState) {
        world.directorState.pressure = clampPressure(world.directorState.pressure + prop.pressureDelta);
      }
      if (prop.involvedIds?.length) {
        for (const tension of world.tensions ?? []) {
          if (prop.involvedIds.some((id) => tension.involvedIds?.includes(id))) {
            tension.pressure = clampPressure(tension.pressure + (prop.pressureDelta ?? -4));
          }
        }
      }
      return applied(action, `${nameOf(world, action.actorId)} inspected ${prop.name}: ${prop.inspectText}`);
    }
    case "remember":
      remember(world, action.actorId, action.text);
      return applied(action, `${nameOf(world, action.actorId)} noted: ${action.text}`);
    case "pickup": {
      const item = mustItem(world, action.itemId);
      delete item.locationId;
      item.holderId = action.actorId;
      remember(world, action.actorId, `Picked up ${item.name}.`);
      return applied(action, `${nameOf(world, action.actorId)} picked up ${item.name}.`);
    }
    case "drop": {
      const item = mustItem(world, action.itemId);
      const here = locationOf(world, action.actorId);
      delete item.holderId;
      if (here) item.locationId = here;
      remember(world, action.actorId, `Dropped ${item.name}.`);
      return applied(action, `${nameOf(world, action.actorId)} dropped ${item.name}.`);
    }
    case "give": {
      const item = mustItem(world, action.itemId);
      item.holderId = action.targetId;
      delete item.locationId;
      remember(world, action.targetId, `${nameOf(world, action.actorId)} gave you ${item.name}.`);
      remember(world, action.actorId, `Gave ${item.name} to ${nameOf(world, action.targetId)}.`);
      adjustRelationshipAxes(world, action.targetId, action.actorId, { trust: 1, affection: 1, debt: 1 });
      const completed = completeQuestForGift(world, action.actorId, action.targetId, action.itemId);
      syncStoryProgress(world);
      const questText = completed ? ` ${completed.title} is complete. ${questOutcomeText(world, completed, action.actorId)}` : "";
      return applied(action, `${nameOf(world, action.actorId)} gave ${item.name} to ${nameOf(world, action.targetId)}.${questText}`);
    }
    case "offer_quest": {
      const quest = mustQuest(world, action.questId);
      quest.status = "open";
      quest.giverId = action.actorId;
      remember(world, action.targetId, `${nameOf(world, action.actorId)} offered a task: ${quest.title}`);
      adjustRelationshipAxes(world, action.targetId, action.actorId, { respect: 1 });
      return applied(action, `${nameOf(world, action.actorId)} offered "${quest.title}" to ${nameOf(world, action.targetId)}.`);
    }
    case "accept_quest": {
      const quest = mustQuest(world, action.questId);
      quest.status = "active";
      quest.acceptedBy = action.actorId;
      if (quest.giverId) {
        remember(world, quest.giverId, `${nameOf(world, action.actorId)} accepted: ${quest.title}`);
        adjustRelationshipAxes(world, quest.giverId, action.actorId, { trust: 1, respect: 1 });
      }
      if (action.actorId !== "player") remember(world, action.actorId, `Accepted "${quest.title}" from ${nameOf(world, quest.giverId ?? "")}.`);
      return applied(action, `${nameOf(world, action.actorId)} accepted "${quest.title}".`);
    }
    case "complete_quest": {
      const quest = mustQuest(world, action.questId);
      quest.status = "done";
      applyQuestDeltas(world, quest.rewards?.relationshipDelta, quest.acceptedBy);
      applyQuestCompletionConsequences(world, quest, action.actorId);
      if (action.actorId !== "player" && quest.giverId) remember(world, action.actorId, `Completed "${quest.title}" for ${nameOf(world, quest.giverId)}.`);
      markAmbitionProgress(world, quest);
      syncStoryProgress(world);
      return applied(action, `${nameOf(world, action.actorId)} completed "${quest.title}". ${questOutcomeText(world, quest, action.actorId)}`);
    }
    case "fail_quest": {
      const quest = mustQuest(world, action.questId);
      quest.status = "failed";
      applyQuestDeltas(world, quest.consequences?.relationshipDelta, quest.acceptedBy);
      if (quest.giverId) {
        remember(world, quest.giverId, `${nameOf(world, action.actorId)} failed: ${quest.title}`);
        nudgeMood(world, quest.giverId, { stress: 8, suspicion: 4, confidence: -2 });
      }
      return applied(action, `${nameOf(world, action.actorId)} failed "${quest.title}".`);
    }
    default:
      return { applied: false, action: action as Action, reason: "Unsupported action type." };
  }
}

function isStoryConfrontationTarget(world: World, targetId: string): boolean {
  return targetId === (world.id === "opm_z_city" ? "pax" : "lena");
}

function ensureCombatDefaults(world: World): void {
  for (const npc of world.npcs) {
    if (!shouldTrackCombat(npc)) continue;
    npc.combat = normalizeCombatState(npc.combat);
  }
}

function shouldTrackCombat(npc: Npc): boolean {
  return npc.factionId === "challengers" || npc.id === "pax";
}

function normalizeCombatState(combat: CombatState | undefined): CombatState {
  const maxHp = combat?.maxHp ?? 100;
  const hp = Math.max(0, Math.min(maxHp, combat?.hp ?? maxHp));
  const posture = Math.max(0, Math.min(100, combat?.posture ?? 100));
  return { maxHp, hp, posture, defeated: combat?.defeated ?? hp <= 0, lastMoveId: combat?.lastMoveId };
}

function applyFightDamage(world: World, targetId: string, moveId: string | undefined): void {
  const target = mustNpc(world, targetId);
  target.combat = normalizeCombatState(target.combat);
  const move = combatMoveFor(world, moveId);
  const postureBroken = target.combat.posture <= 25;
  const damage = move.damage + (postureBroken && move.style !== "guard" ? 8 : 0);
  target.combat.hp = Math.max(0, target.combat.hp - damage);
  target.combat.posture = Math.max(0, target.combat.posture - move.postureDamage);
  target.combat.lastMoveId = move.id;
  target.combat.defeated = target.combat.hp <= 0 || move.style === "finisher";
  if (target.combat.defeated) {
    target.combat.hp = 0;
    target.combat.posture = 0;
  }
}

function resolveFightConsequences(world: World, actorId: string, targetId: string): void {
  if (actorId === "player" && isStoryConfrontationTarget(world, targetId)) {
    resolveShadowConfrontation(world);
  }
  const tension = world.tensions?.find((candidate) => candidate.involvedIds?.includes(targetId) && candidate.status !== "resolved");
  if (tension) {
    tension.status = "resolved";
    tension.pressure = Math.max(0, tension.pressure - 35);
  }
  const plan = world.villainPlans?.find((candidate) => candidate.actorId === targetId);
  if (plan) {
    plan.stage += 1;
    plan.pressure = Math.max(0, plan.pressure - 30);
    plan.nextTrigger = "Recovered after the first direct fight; future loops need stronger combat stakes.";
  }
}

function fightOutcomeText(world: World, actorId: string, targetId: string, moveId: string | undefined): string {
  const move = combatMoveFor(world, moveId);
  const combat = getNpc(world, targetId)?.combat;
  const hpText = combat ? ` ${nameOf(world, targetId)} has ${combat.hp}/${combat.maxHp} HP left.` : "";
  if (world.id === "opm_z_city" && targetId === "pax") {
    if (combat?.defeated) {
      return `${nameOf(world, actorId)} ${move.impact} on ${nameOf(world, targetId)}. The overpass challenger is knocked out of the first patrol loop.`;
    }
    return `${nameOf(world, actorId)} ${move.impact} on ${nameOf(world, targetId)}.${hpText}`;
  }
  return `${nameOf(world, actorId)} ${move.impact} on ${nameOf(world, targetId)}.${hpText}`;
}

function applyQuestDeltas(world: World, deltas: Record<string, number> | undefined, completerId: string | undefined): void {
  if (!deltas || !completerId) return;
  for (const [npcId, delta] of Object.entries(deltas)) {
    adjustRelationship(world, npcId, completerId, delta);
    adjustRelationship(world, completerId, npcId, delta);
  }
}

function applyQuestCompletionConsequences(world: World, quest: Quest, completerId: string): void {
  resolveQuestTensions(world, quest.id);
  writeQuestAftermathMemories(world, quest, completerId);
}

function resolveQuestTensions(world: World, questId: string): void {
  const impact: Record<string, Partial<Record<string, number>>> = {
    ashbend: {
      return_shears: -8,
      rekindle_forge: -35,
      bridge_whisper: -28,
    },
    opm_z_city: {
      return_shears: -6,
      rekindle_forge: -10,
      bridge_whisper: -32,
    },
  };
  const tensionByQuest: Record<string, Partial<Record<string, string[]>>> = {
    ashbend: {
      return_shears: ["missing_metal"],
      rekindle_forge: ["forge_unlit"],
      bridge_whisper: ["missing_metal"],
    },
    opm_z_city: {
      return_shears: ["sonic_challenge"],
      rekindle_forge: ["overpass_alert"],
      bridge_whisper: ["overpass_alert"],
    },
  };
  const ids = tensionByQuest[world.id]?.[questId] ?? [];
  const delta = impact[world.id]?.[questId] ?? -10;
  for (const tension of world.tensions ?? []) {
    if (!ids.includes(tension.id) || tension.status === "resolved") continue;
    tension.pressure = clampPressure(tension.pressure + delta);
    if (questId === "rekindle_forge" && world.id === "ashbend") {
      tension.status = "resolved";
    } else if (questId === "bridge_whisper") {
      tension.status = tension.pressure <= 20 ? "resolved" : "quiet";
    } else if (tension.pressure <= 25) {
      tension.status = "quiet";
    }
  }
  if (world.directorState) {
    world.directorState.pressure = clampPressure(world.directorState.pressure - Math.max(4, Math.abs(delta) / 4));
  }
}

function writeQuestAftermathMemories(world: World, quest: Quest, completerId: string): void {
  if (!quest.giverId) return;
  const giver = getNpc(world, quest.giverId);
  if (!giver) return;
  const branch = questRelationshipBranch(giver, completerId);
  const consequence = questConsequenceLine(world, quest.id, branch);
  remember(world, quest.giverId, `${branch.label} quest outcome: ${nameOf(world, completerId)} finished "${quest.title}". ${consequence}`);
  if (completerId !== "player") return;
  remember(world, completerId, `Quest aftermath with ${giver.name}: ${consequence}`);
}

function questRelationshipBranch(npc: Npc, actorId: string): { label: "Trusted" | "Wary" | "Resolved"; tone: "trusted" | "wary" | "neutral" } {
  const axes = npc.relationshipAxes?.[actorId] ?? {};
  const trust = axes.trust ?? 0;
  const suspicion = axes.suspicion ?? 0;
  if (trust >= 3 && trust >= suspicion) return { label: "Trusted", tone: "trusted" };
  if (suspicion >= 3 && suspicion > trust) return { label: "Wary", tone: "wary" };
  return { label: "Resolved", tone: "neutral" };
}

function questConsequenceLine(world: World, questId: string, branch: { tone: "trusted" | "wary" | "neutral" }): string {
  const lines: Record<string, Record<string, Record<string, string>>> = {
    ashbend: {
      return_shears: {
        trusted: "Mira shares the bridge-dew clue without holding back.",
        wary: "Mira accepts the shears but keeps watching how you handle Tomas.",
        neutral: "The garden stabilizes and Mira has one less reason to suspect the forge.",
      },
      rekindle_forge: {
        trusted: "Tomas admits the forge flame weakens the bridge whisper.",
        wary: "Tomas restarts the forge but keeps his bridge fear half-hidden.",
        neutral: "The forge breathes again and the bridge pressure drops.",
      },
      bridge_whisper: {
        trusted: "Lena treats the proof as enough to prepare a calm night watch.",
        wary: "Lena files the proof but keeps your name out of the first report.",
        neutral: "The bridge clue becomes official and the village panic recedes.",
      },
    },
    opm_z_city: {
      return_shears: {
        trusted: "Saitama treats you as reliable enough to handle errands without speeches.",
        wary: "Saitama takes the coupon back, unimpressed but no longer blocked.",
        neutral: "The coupon errand closes and the plaza drama drops slightly.",
      },
      rekindle_forge: {
        trusted: "Genos logs you as tactically reliable for the next patrol.",
        wary: "Genos accepts the core but keeps a backup scan running.",
        neutral: "Genos repairs enough damage to keep the overpass patrol stable.",
      },
      bridge_whisper: {
        trusted: "Mumen Rider trusts the proof and moves civilians away from the overpass.",
        wary: "Mumen Rider files the alert carefully, separating proof from rumor.",
        neutral: "The overpass alert becomes actionable instead of vague panic.",
      },
    },
  };
  return lines[world.id]?.[questId]?.[branch.tone] ?? "The task changes how the giver treats the next problem.";
}

function questOutcomeText(world: World, quest: Quest, completerId: string): string {
  const giver = quest.giverId ? getNpc(world, quest.giverId) : undefined;
  const branch = giver ? questRelationshipBranch(giver, completerId) : { label: "Resolved" as const, tone: "neutral" as const };
  return questConsequenceLine(world, quest.id, branch);
}

function completeQuestForGift(world: World, giverId: string, targetId: string, itemId: string): Quest | null {
  const questByGift: Record<string, { targetId: string; questId: string }> = {
    shears: { targetId: "mira", questId: "return_shears" },
    bellows_leather: { targetId: "tomas", questId: "rekindle_forge" },
    blue_ember: { targetId: "lena", questId: "bridge_whisper" },
    rumor_note: { targetId: "lena", questId: "bridge_whisper" },
  };
  const match = questByGift[itemId];
  if (!match || match.targetId !== targetId) return null;
  const quest = getQuest(world, match.questId);
  if (!quest || quest.status !== "active" || quest.acceptedBy !== giverId) return null;
  quest.status = "done";
  applyQuestDeltas(world, quest.rewards?.relationshipDelta, giverId);
  applyQuestCompletionConsequences(world, quest, giverId);
  remember(world, giverId, `Completed "${quest.title}" by giving ${getItem(world, itemId)?.name ?? itemId} to ${nameOf(world, targetId)}.`);
  markAmbitionProgress(world, quest);
  return quest;
}

export function getQuest(world: World, id: string): Quest | undefined {
  return (world.quests ?? []).find((quest) => quest.id === id);
}

function mustQuest(world: World, id: string): Quest {
  const quest = getQuest(world, id);
  if (!quest) throw new Error(`Unknown quest ${id}`);
  return quest;
}

export function getItem(world: World, id: string): Item | undefined {
  return (world.items ?? []).find((item) => item.id === id);
}

function mustItem(world: World, id: string): Item {
  const item = getItem(world, id);
  if (!item) throw new Error(`Unknown item ${id}`);
  return item;
}

export function locationOf(world: World, actorId: string): string | undefined {
  if (actorId === "player") return world.player?.locationId;
  return getNpc(world, actorId)?.locationId;
}

export function itemsHeldBy(world: World, holderId: string): Item[] {
  return (world.items ?? []).filter((item) => item.holderId === holderId);
}

export function itemsAt(world: World, locationId: string): Item[] {
  return (world.items ?? []).filter((item) => item.locationId === locationId);
}

export function hasExit(world: World, fromId: string, toId: string): boolean {
  return (world.exits ?? []).some((exit) =>
    (exit.from === fromId && exit.to === toId) ||
    (exit.bidirectional && exit.from === toId && exit.to === fromId)
  );
}

export type ValidationResult = { ok: true } | { ok: false; reason: string };

export function validateAction(world: World, action: Action | unknown): ValidationResult {
  if (!action || typeof action !== "object") return invalid("Action must be an object.");
  const a = action as Partial<Action> & { type?: string };
  if (!a.type || !ACTION_TYPES.has(a.type as ActionType)) return invalid("Unsupported action type.");
  if (a.actorId !== "player" && !getNpc(world, a.actorId ?? "")) return invalid("Unknown actor.");

  if (a.type === "talk" || a.type === "gossip" || a.type === "confront" || a.type === "fight") {
    const targetId = (a as { targetId?: string }).targetId;
    if (!targetId || !getNpc(world, targetId)) return invalid("Unknown target.");
  }
  if (a.type === "gossip") {
    const aboutId = (a as { aboutId?: string }).aboutId;
    if (!aboutId || !getNpc(world, aboutId)) return invalid("Unknown gossip subject.");
  }
  if (a.type === "choose_character") {
    const targetId = (a as { targetId?: string }).targetId;
    if (a.actorId !== "player") return invalid("Only the player can choose a character.");
    if (!targetId || !getNpc(world, targetId)) return invalid("Unknown character.");
  }
  if (a.type === "inspect") {
    const propId = (a as { propId?: string }).propId;
    const prop = getProp(world, propId ?? "");
    if (!prop) return invalid("Unknown prop.");
    const here = locationOf(world, a.actorId ?? "");
    if (prop.locationId !== here) return invalid("Prop is not here.");
  }
  if (a.type === "move") {
    const locationId = (a as { locationId?: string }).locationId;
    if (!locationId || !world.locations.some((loc) => loc.id === locationId)) return invalid("Unknown location.");
    const fromId = locationOf(world, a.actorId ?? "");
    if (!fromId) return invalid("Actor has no current location.");
    if (fromId === locationId) return invalid("Actor is already there.");
    if (fromId !== locationId && (world.exits?.length ?? 0) > 0 && !hasExit(world, fromId, locationId)) {
      return invalid("No exit to that location.");
    }
  }
  if (a.type === "talk" || a.type === "gossip" || a.type === "confront" || a.type === "remember") {
    if (typeof (a as { text?: unknown }).text !== "string") return invalid("Text is required.");
  }
  if (a.type === "fight") {
    const here = locationOf(world, a.actorId ?? "");
    const targetId = (a as { targetId?: string }).targetId;
    const there = locationOf(world, targetId ?? "");
    if (here !== there) return invalid("Target is not here.");
    const text = (a as { text?: unknown }).text;
    if (text !== undefined && typeof text !== "string") return invalid("Fight text must be a string.");
    const moveId = (a as { moveId?: unknown }).moveId;
    if (moveId !== undefined && typeof moveId !== "string") return invalid("Fight move must be a string.");
    if (typeof moveId === "string" && !combatMovesFor(world).some((move) => move.id === moveId)) {
      return invalid("Unknown fight move.");
    }
    if (getNpc(world, targetId ?? "")?.combat?.defeated) return invalid("Target is already defeated.");
  }

  if (a.type === "pickup" || a.type === "drop" || a.type === "give") {
    const itemId = (a as { itemId?: string }).itemId;
    const item = getItem(world, itemId ?? "");
    if (!item) return invalid("Unknown item.");
    if (a.type === "pickup") {
      const here = locationOf(world, a.actorId ?? "");
      if (item.locationId !== here) return invalid("Item is not here.");
    }
    if (a.type === "drop" && item.holderId !== a.actorId) return invalid("Actor does not hold that item.");
    if (a.type === "give") {
      if (item.holderId !== a.actorId) return invalid("Actor does not hold that item.");
      const targetId = (a as { targetId?: string }).targetId;
      if (!targetId || (!getNpc(world, targetId) && targetId !== "player")) return invalid("Unknown gift target.");
      const here = locationOf(world, a.actorId ?? "");
      const there = locationOf(world, targetId);
      if (here !== there) return invalid("Target is not here.");
    }
  }

  if (a.type.endsWith("_quest")) {
    const questId = (a as { questId?: string }).questId;
    const quest = getQuest(world, questId ?? "");
    if (!quest) return invalid("Unknown quest.");
    if (a.type === "offer_quest") {
      const targetId = (a as { targetId?: string }).targetId;
      if (a.actorId === "player") return invalid("Player cannot offer quests.");
      if (!targetId || (!getNpc(world, targetId) && targetId !== "player")) return invalid("Unknown quest target.");
      if (quest.status && quest.status !== "open" && quest.status !== "failed") return invalid(`Quest already ${quest.status}.`);
    }
    if (a.type === "accept_quest") {
      if (quest.status !== "open") return invalid(`Quest is ${quest.status ?? "unoffered"}.`);
    }
    if (a.type === "complete_quest" || a.type === "fail_quest") {
      if (quest.status !== "active") return invalid(`Quest is ${quest.status ?? "unstarted"}.`);
      if (quest.acceptedBy !== a.actorId) return invalid("Only the accepter can resolve.");
    }
  }

  return { ok: true };
}

export function retrieveMemories(world: World, npcId: string, query: string, limit = 3) {
  return retrieveRelevantMemories(world, npcId, query, limit);
}

export function proposeNpcActions(world: World): Action[] {
  const actions: Action[] = [];
  const mira = getNpc(world, "mira");
  const tomas = getNpc(world, "tomas");
  const orrin = getNpc(world, "orrin");
  const pax = getNpc(world, "pax");

  if (world.id === "opm_z_city") {
    if (world.tick === 0 && pax && mira) {
      actions.push({
        type: "confront", actorId: "pax", targetId: "mira",
        text: "Caped bald hero, stop pretending errands are more important than our duel.",
      });
    }
    if (world.tick === 0 && orrin && pax) {
      actions.push({
        type: "gossip", actorId: "orrin", targetId: "lena", aboutId: "pax",
        text: "Sonic is turning the overpass alert into a challenge stage.",
      });
    }
    actions.push(...scheduledNpcMoveActions(world, actions));
    return actions;
  }

  if (world.tick === 0 && mira && tomas) {
    actions.push({
      type: "confront", actorId: "mira", targetId: "tomas",
      text: "The garden tools went missing after you borrowed them.",
    });
  }
  if (world.tick === 0 && orrin && pax) {
    actions.push({
      type: "gossip", actorId: "orrin", targetId: "lena", aboutId: "pax",
      text: "Pax may know why the notice board keeps losing trinkets.",
    });
  }
  const tomasMira = tomas?.relationships?.["mira"] ?? 0;
  if (world.tick > 0 && tomas && tomasMira < 0) {
    actions.push({
      type: "remember", actorId: "tomas",
      text: "Mira is angry about the missing tools; return them before asking for herbs.",
    });
  }
  actions.push(...scheduledNpcMoveActions(world, actions));
  return actions;
}

function scheduledNpcMoveActions(world: World, existingActions: Action[], limit = 2): Action[] {
  const busyActors = new Set(existingActions.map((action) => action.actorId));
  const moves: Action[] = [];
  for (const npc of world.npcs) {
    if (moves.length >= limit) break;
    if (npc.id === world.player.characterId || busyActors.has(npc.id)) continue;
    if (isQuestCriticalNpc(world, npc.id)) continue;
    const scheduled = scheduledBlockFor(world, npc);
    if (!scheduled || scheduled.locationId === npc.locationId) continue;
    const nextStep = nextLocationStep(world, npc.locationId, scheduled.locationId);
    if (!nextStep || nextStep === npc.locationId) continue;
    moves.push({ type: "move", actorId: npc.id, locationId: nextStep });
    busyActors.add(npc.id);
  }
  return moves;
}

function isQuestCriticalNpc(world: World, npcId: string): boolean {
  return (world.quests ?? []).some((quest) => {
    const status = quest.status ?? "open";
    return quest.giverId === npcId && (status === "open" || status === "active");
  });
}

function nextLocationStep(world: World, fromId: string, toId: string): string | null {
  if (fromId === toId) return fromId;
  const queue = [fromId];
  const previous = new Map<string, string | null>([[fromId, null]]);

  for (let i = 0; i < queue.length; i += 1) {
    const current = queue[i]!;
    if (current === toId) break;
    for (const next of neighboringLocations(world, current)) {
      if (previous.has(next)) continue;
      previous.set(next, current);
      queue.push(next);
    }
  }

  if (!previous.has(toId)) return null;
  const route: string[] = [];
  let current: string | null = toId;
  while (current && current !== fromId) {
    route.push(current);
    current = previous.get(current) ?? null;
  }
  return route.reverse()[0] ?? null;
}

function neighboringLocations(world: World, locationId: string): string[] {
  const result = new Set<string>();
  for (const exit of world.exits ?? []) {
    if (exit.from === locationId) result.add(exit.to);
    if (exit.bidirectional && exit.to === locationId) result.add(exit.from);
  }
  return [...result];
}

function applied(action: Action, text: string): AppliedAction {
  return { applied: true, action, text };
}

function invalid(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

function remember(world: World, npcId: string, text: string): void {
  const npc = getNpc(world, npcId);
  if (!npc) return;
  npc.memories.push({ tick: world.tick, text, meta: memoryMetaFromText(text) });
}

function adjustRelationship(world: World, fromId: string, toId: string, delta: number, axesDelta?: RelationshipAxes): void {
  const npc = getNpc(world, fromId);
  if (!npc) return;
  npc.relationships[toId] = (npc.relationships[toId] ?? 0) + delta;
  adjustRelationshipAxes(world, fromId, toId, axesDelta ?? axesDeltaFromRelationship(delta));
}

function adjustRelationshipAxes(world: World, fromId: string, toId: string, delta: RelationshipAxes): void {
  const npc = getNpc(world, fromId);
  if (!npc) return;
  npc.relationshipAxes ??= {};
  const current = npc.relationshipAxes[toId] ?? {};
  npc.relationshipAxes[toId] = {
    trust: clampAxis((current.trust ?? 0) + (delta.trust ?? 0)),
    affection: clampAxis((current.affection ?? 0) + (delta.affection ?? 0)),
    fear: clampAxis((current.fear ?? 0) + (delta.fear ?? 0)),
    respect: clampAxis((current.respect ?? 0) + (delta.respect ?? 0)),
    debt: clampAxis((current.debt ?? 0) + (delta.debt ?? 0)),
    suspicion: clampAxis((current.suspicion ?? 0) + (delta.suspicion ?? 0)),
  };
}

function axesDeltaFromRelationship(delta: number): RelationshipAxes {
  if (delta > 0) return { trust: delta, affection: Math.max(0, delta - 1), respect: Math.ceil(delta / 2), suspicion: -delta };
  if (delta < 0) return { trust: delta, suspicion: Math.abs(delta), fear: Math.ceil(Math.abs(delta) / 2) };
  return {};
}

function applyTalkConsequences(world: World, actorId: string, targetId: string, text: string): void {
  const lower = text.toLowerCase();
  const helpful = /help|working|task|promise|thank|sorry|safe|protect|return|found|proof/.test(lower);
  const accusatory = /lie|stole|blame|fault|coward|secret|hide|why did you/.test(lower);
  if (helpful) {
    adjustRelationshipAxes(world, targetId, actorId, { trust: 1, respect: 1, suspicion: -1 });
    nudgeMood(world, targetId, { stress: -2, confidence: 1 });
  }
  if (accusatory) {
    adjustRelationship(world, targetId, actorId, -1, { trust: -1, fear: 1, suspicion: 2 });
    nudgeMood(world, targetId, { stress: 4, suspicion: 3 });
  }
  if (lower.includes("sorry")) {
    adjustRelationshipAxes(world, targetId, actorId, { trust: 1, suspicion: -2 });
    nudgeMood(world, targetId, { stress: -2 });
  }
}

function nudgeMood(world: World, npcId: string, delta: Partial<Record<keyof AgentMood, number>>): void {
  const npc = getNpc(world, npcId);
  if (!npc?.mood) return;
  npc.mood = {
    emotion: npc.mood.emotion,
    stress: clampMood(npc.mood.stress + (delta.stress ?? 0)),
    confidence: clampMood(npc.mood.confidence + (delta.confidence ?? 0)),
    suspicion: clampMood(npc.mood.suspicion + (delta.suspicion ?? 0)),
  };
}

function markAmbitionProgress(world: World, quest: Quest): void {
  const giver = quest.giverId ? getNpc(world, quest.giverId) : undefined;
  if (!giver?.ambitions) return;
  const title = `${quest.title} ${quest.description ?? ""}`.toLowerCase();
  for (const ambition of giver.ambitions) {
    const targetMatch = ambition.targetId && title.includes(String(ambition.targetId).toLowerCase());
    const titleMatch = title.split(/\W+/).some((term) => term.length > 4 && ambition.title.toLowerCase().includes(term));
    if (targetMatch || titleMatch) ambition.status = "satisfied";
  }
}

function clampAxis(value: number): number {
  return Math.max(-10, Math.min(10, value));
}

function clampMood(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function clampPressure(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function summarizeTick(world: World, actions: AppliedAction[], rejected: RejectedAction[]): TickSummary {
  return {
    tick: world.tick,
    actions: actions.map(({ action, text, fromDirector }) => ({ action, text, ...(fromDirector ? { fromDirector } : {}) })),
    rejected: rejected.map(({ action, reason }) => ({ action, reason })),
    checksum: checksum(world),
    clock: { ...world.clock },
  };
}

function checksum(world: World): string {
  const stable = JSON.stringify({
    tick: world.tick,
    npcs: world.npcs.map((npc) => ({
      id: npc.id,
      locationId: npc.locationId,
      currentIntent: npc.plan?.currentIntent?.kind ?? null,
      relationships: Object.fromEntries(Object.entries(npc.relationships).sort()),
      memoryCount: npc.memories.length,
    })),
    player: world.player ?? null,
    items: world.items?.map((item) => ({ id: item.id, holderId: item.holderId ?? null, locationId: item.locationId ?? null })) ?? [],
    storyProgress: world.storyProgress ?? null,
  });
  let hash = 0;
  for (let i = 0; i < stable.length; i += 1) hash = (hash * 31 + stable.charCodeAt(i)) >>> 0;
  return hash.toString(16).padStart(8, "0");
}

export function getNpc(world: World, id: string): Npc | undefined {
  return world.npcs.find((npc) => npc.id === id);
}

export function getProp(world: World, id: string) {
  return (world.interactables ?? []).find((prop) => prop.id === id);
}

function mustProp(world: World, id: string) {
  const prop = getProp(world, id);
  if (!prop) throw new Error(`Unknown prop ${id}`);
  return prop;
}

function mustNpc(world: World, id: string): Npc {
  const npc = getNpc(world, id);
  if (!npc) throw new Error(`Unknown npc ${id}`);
  return npc;
}

export function nameOf(world: World, id: string): string {
  if (id === "player") return world.player?.name ?? "Player";
  return getNpc(world, id)?.name ?? id;
}

export function locationName(world: World, id: string): string {
  return world.locations.find((location) => location.id === id)?.name ?? id;
}
