import { completeText, type CompleteTextResult, isLlmEnabled } from "./llm/router.ts";
import { locationName, retrieveMemories } from "./simulation.ts";
import type { Npc, World } from "./types.ts";

const HISTORY_LIMIT = 10;
const MEMORY_LIMIT = 5;
const REPLY_MAX_CHARS = 420;

export interface DialogueTurn {
  speaker: "player" | "npc";
  text: string;
}

export type DialogueCompleter = (req: { tier: "normal" | "quest"; system: string; user: string }) => Promise<CompleteTextResult>;

export interface DialogueResult {
  ok: true;
  reply: string;
}

export interface DialogueFailure {
  ok: false;
  reason: string;
}

/** Per-world, per-NPC short conversation history (presentation context only). */
const histories = new Map<string, DialogueTurn[]>();

function historyFor(worldId: string, npcId: string): DialogueTurn[] {
  const key = `${worldId}:${npcId}`;
  let history = histories.get(key);
  if (!history) {
    history = [];
    histories.set(key, history);
  }
  return history;
}

export function clearDialogueHistories(): void {
  histories.clear();
}

export function dialogueAvailable(): boolean {
  return isLlmEnabled();
}

/**
 * Free-flowing in-character conversation: does NOT consume a sim tick. Both
 * turns are written into the NPC's memories so the agent loop and future
 * dialogue stay consistent with what was said.
 */
export async function generateDialogueReply(
  world: World,
  npcId: string,
  playerText: string,
  complete: DialogueCompleter = completeText
): Promise<DialogueResult | DialogueFailure> {
  const npc = world.npcs.find((entry) => entry.id === npcId);
  if (!npc) return { ok: false, reason: "unknown_npc" };
  if (npc.combat?.defeated) return { ok: false, reason: "npc_defeated" };
  if (npc.locationId !== world.player.locationId) return { ok: false, reason: "npc_not_here" };

  const history = historyFor(world.id, npcId);
  const system = buildDialogueSystem(world, npc);
  const user = buildDialogueUser(world, npc, history, playerText);

  const result = await complete({ tier: npc.tier === "quest" ? "quest" : "normal", system, user });
  if ("skipped" in result && result.skipped) return { ok: false, reason: result.reason };
  if ("error" in result && result.error) return { ok: false, reason: result.error };
  if (!("text" in result) || !result.text) return { ok: false, reason: "empty_reply" };

  const reply = sanitizeReply(result.text, npc.name);
  if (!reply) return { ok: false, reason: "empty_reply" };

  history.push({ speaker: "player", text: playerText }, { speaker: "npc", text: reply });
  while (history.length > HISTORY_LIMIT) history.shift();

  const playerName = world.player.name ?? "the visitor";
  npc.memories.push(
    { tick: world.tick, text: `${playerName} said to me: ${playerText}`, meta: { sourceActorId: "player", visibility: "private", importance: 2 } },
    { tick: world.tick, text: `I replied to ${playerName}: ${reply}`, meta: { visibility: "private", importance: 2 } }
  );

  return { ok: true, reply };
}

function buildDialogueSystem(world: World, npc: Npc): string {
  const traits = [
    ...(npc.traits?.personality ?? []),
    ...(npc.traits?.values ?? []).map((value) => `values ${value}`),
    ...(npc.traits?.flaws ?? []).map((flaw) => `flaw: ${flaw}`),
  ].join(", ");
  const knownSecrets = (npc.secrets ?? [])
    .filter((secret) => (secret.knownBy ?? [npc.id]).includes(npc.id))
    .map((secret) => `- ${secret.text} (risk ${secret.risk}; only reveal if it serves you)`)
    .join("\n");
  return [
    `You are ${npc.name}, a character in "${world.story?.title ?? world.name}".`,
    `World premise: ${world.story?.premise ?? "(unknown)"}`,
    `Role: ${npc.role ?? "inhabitant"}. ${npc.description ?? ""}`,
    traits ? `Traits: ${traits}.` : "",
    npc.traits?.speechStyle ? `Speech style: ${npc.traits.speechStyle}.` : "",
    npc.mood ? `Current mood: ${npc.mood.emotion} (stress ${npc.mood.stress}, suspicion ${npc.mood.suspicion}).` : "",
    `Goals: ${(npc.goals ?? []).join("; ") || "live your life"}.`,
    knownSecrets ? `Secrets you hold:\n${knownSecrets}` : "",
    ``,
    `You are talking face to face with the player. Reply with ONLY your spoken line —`,
    `no quotes, no name prefix, no stage directions, no markdown. 1-3 sentences,`,
    `in character, grounded in your memories and the world. You may refuse, lie,`,
    `bargain, or redirect as the character would.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildDialogueUser(world: World, npc: Npc, history: DialogueTurn[], playerText: string): string {
  const memories = retrieveMemories(world, npc.id, playerText, MEMORY_LIMIT)
    .map((memory) => `- (t${memory.tick}) ${memory.text}`)
    .join("\n");
  const here = world.npcs
    .filter((other) => other.id !== npc.id && other.locationId === npc.locationId)
    .map((other) => other.name)
    .join(", ");
  const conversation = history.map((turn) => `${turn.speaker === "player" ? "Player" : npc.name}: ${turn.text}`).join("\n");
  const quests = (world.quests ?? [])
    .filter((quest) => quest.giverId === npc.id)
    .map((quest) => `- ${quest.title} [${quest.status ?? "open"}]`)
    .join("\n");
  return [
    `Location: ${locationName(world, npc.locationId)}. Time: day ${world.clock.day}, ${world.clock.hour}:00.`,
    here ? `Also present: ${here}.` : "You are alone with the player.",
    quests ? `Quests you are involved in:\n${quests}` : "",
    memories ? `Your relevant memories:\n${memories}` : "",
    conversation ? `Conversation so far:\n${conversation}` : "",
    ``,
    `Player says: "${playerText}"`,
    `Your spoken reply:`,
  ]
    .filter(Boolean)
    .join("\n");
}

function sanitizeReply(raw: string, npcName: string): string {
  let text = raw.trim();
  text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  // strip a leading "Name:" prefix and surrounding quotes
  const prefix = new RegExp(`^${npcName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*`, "i");
  text = text.replace(prefix, "").trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("“") && text.endsWith("”"))) {
    text = text.slice(1, -1).trim();
  }
  if (text.length > REPLY_MAX_CHARS) text = `${text.slice(0, REPLY_MAX_CHARS - 1).trimEnd()}…`;
  return text;
}
