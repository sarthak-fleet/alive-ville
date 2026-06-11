import { relationshipFor } from "./dialogue.ts";
import { questObjectiveMet } from "./quest-objectives.ts";
import { applyAction, locationName, validateAction } from "./simulation.ts";
import type { Action, Npc, Quest, World } from "./types.ts";

/**
 * Story mode: zero-AI conversations. Choices and replies are DERIVED from the
 * live sim — an NPC's freshest rumor, their actual goals, real quest state —
 * so dialogue stays current because the world underneath keeps moving.
 * Chosen options execute the same engine actions alive mode uses.
 */

export interface StoryOption {
  id: string;
  label: string;
}

export interface StoryReply {
  reply: string;
  /** stage direction already applied to the sim (same shape as alive mode) */
  action?: { type: string; text: string };
  options: StoryOption[];
}

export function storyDialogueOptions(world: World, npcId: string): StoryOption[] | null {
  const npc = world.npcs.find((entry) => entry.id === npcId);
  if (!npc || npc.combat?.defeated) return null;
  const options: StoryOption[] = [
    { id: "news", label: "Any news?" },
    { id: "trouble", label: "What's troubling you?" },
  ];

  for (const quest of questsFrom(world, npc)) {
    const status = quest.status ?? "open";
    if (status === "open") options.push({ id: `accept:${quest.id}`, label: `I'll help: ${quest.title}` });
    if (status === "active" && quest.acceptedBy === "player" && questObjectiveMet(world, quest) !== false) {
      options.push({ id: `complete:${quest.id}`, label: `It's done: ${quest.title}` });
    }
  }

  const aboutMe = relationshipFor(npc);
  if (npc.combat && !npc.combat.defeated && aboutMe.score >= 0) options.push({ id: "spar", label: "Spar with me?" });
  if (aboutMe.score >= 2) options.push({ id: "follow", label: "Come with me." });

  // an escort option toward wherever their own goal points
  const exit = (world.exits ?? []).find((entry) => entry.from === npc.locationId || (entry.bidirectional !== false && entry.to === npc.locationId));
  if (exit) {
    const target = exit.from === npc.locationId ? exit.to : exit.from;
    options.push({ id: `lead:${target}`, label: `Take me to ${locationName(world, target)}.` });
  }

  options.push({ id: "bye", label: "Goodbye." });
  return options.slice(0, 7);
}

export function storyDialogueRespond(world: World, npcId: string, optionId: string): StoryReply | null {
  const npc = world.npcs.find((entry) => entry.id === npcId);
  if (!npc) return null;
  let reply = "";
  let action: StoryReply["action"];

  if (optionId === "news") {
    const rumor = freshestSharedMemory(npc);
    reply = rumor
      ? `${rumor} ${moodTail(npc)}`
      : `Quiet enough around here, for now. ${moodTail(npc)}`;
    rememberExchange(world, npc, "asked me for news");
  } else if (optionId === "trouble") {
    const quest = questsFrom(world, npc).find((entry) => (entry.status ?? "open") !== "done");
    const goal = quest?.description ?? quest?.title ?? activeGoal(npc);
    reply = goal ? `${goal} That is what keeps me up at night.` : `Nothing I would burden a stranger with. Yet.`;
    rememberExchange(world, npc, "asked what troubles me");
  } else if (optionId.startsWith("accept:")) {
    const questId = optionId.slice("accept:".length);
    action = applyEngine(world, { type: "accept_quest", actorId: "player", questId } as Action);
    reply = action ? `Then it is in your hands. Do not make me regret asking.` : `That matter is already settled.`;
  } else if (optionId.startsWith("complete:")) {
    const questId = optionId.slice("complete:".length);
    action = applyEngine(world, { type: "complete_quest", actorId: "player", questId } as Action);
    reply = action ? `You actually did it. I will not forget this.` : `It is not done yet — I can tell.`;
  } else if (optionId === "spar") {
    action = { type: "spar", text: `${npc.name} squares up for a friendly spar!` };
    npc.memories.push({ tick: world.tick, text: `I sparred with the player to test their resolve.`, meta: { importance: 2, visibility: "private" } });
    reply = `Very well — show me what you carry. No blades to the bone.`;
  } else if (optionId === "follow") {
    action = { type: "follow", text: `${npc.name} starts following you.` };
    npc.memories.push({ tick: world.tick, text: `I agreed to walk with the player for a while.`, meta: { importance: 2, visibility: "private" } });
    reply = `Lead on, then. I could use the change of air.`;
  } else if (optionId.startsWith("lead:")) {
    const locationId = optionId.slice("lead:".length);
    const moved = applyEngine(world, { type: "move", actorId: npc.id, locationId } as Action);
    if (moved) {
      action = { type: "lead", text: `${npc.name} sets off toward ${locationName(world, locationId)} — follow them!` };
      reply = `Keep up, then.`;
    } else {
      reply = `Not now — the way is closed to me.`;
    }
  } else if (optionId === "bye") {
    reply = `Walk safe.`;
  } else {
    return null;
  }

  return { reply, action, options: storyDialogueOptions(world, npcId) ?? [] };
}

// ---------------------------------------------------------------------------

function questsFrom(world: World, npc: Npc): Quest[] {
  return (world.quests ?? []).filter((quest) => quest.giverId === npc.id);
}

function freshestSharedMemory(npc: Npc): string | null {
  for (let index = npc.memories.length - 1; index >= 0; index -= 1) {
    const memory = npc.memories[index]!;
    if ((memory.meta?.visibility ?? "private") === "private") continue;
    if ((memory.meta?.importance ?? 0) < 2) continue;
    return memory.text;
  }
  return null;
}

function activeGoal(npc: Npc): string | null {
  const ambition = (npc.ambitions ?? []).find((goal) => (goal.status ?? "active") === "active");
  return ambition?.title ?? npc.goals?.[0] ?? null;
}

function moodTail(npc: Npc): string {
  const mood = npc.mood;
  if (!mood) return "";
  if (mood.stress > 70) return "Forgive me — my nerves are worn thin.";
  if (mood.suspicion > 70) return "And keep your voice down. Ears everywhere.";
  if (mood.emotion === "calm") return "A rare calm day, all told.";
  return "";
}

function rememberExchange(world: World, npc: Npc, what: string): void {
  npc.memories.push({
    tick: world.tick,
    text: `A visitor ${what}.`,
    meta: { importance: 1, visibility: "private", sourceActorId: "player" },
  });
}

function applyEngine(world: World, action: Action): { type: string; text: string } | undefined {
  if (!validateAction(world, action).ok) return undefined;
  const outcome = applyAction(world, action);
  return outcome.applied ? { type: action.type, text: outcome.text } : undefined;
}
