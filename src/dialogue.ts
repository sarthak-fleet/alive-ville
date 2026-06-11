import { completeText, type CompleteTextResult, isLlmEnabled, streamText } from "./llm/router.ts";
import { questObjectiveBlockText, questObjectiveMet } from "./quest-objectives.ts";
import { applyAction, locationName, retrieveMemories, validateAction } from "./simulation.ts";
import type { Action, Npc, World } from "./types.ts";

const HISTORY_LIMIT = 24;
const MEMORY_LIMIT = Number(process.env["LLM_MEMORY_LIMIT"] ?? 5);
const REPLY_MAX_CHARS = 420;

export interface DialogueTurn {
  speaker: "player" | "npc" | "event";
  text: string;
}

export type DialogueCompleter = (req: {
  tier: "normal" | "quest";
  system: string;
  user: string;
  onToken?: (delta: string) => void;
}) => Promise<CompleteTextResult>;

export interface DialogueOptions {
  complete?: DialogueCompleter;
  /** stream visible reply tokens as they arrive (the @@ control tail is held back) */
  onToken?: (delta: string) => void;
  /** namespace for conversation history (per-session servers pass the session id) */
  historyKey?: string;
}

export interface DialogueRelationship {
  score: number;
  label: string;
}

export interface DialogueResult {
  ok: true;
  reply: string;
  /** stage direction when the NPC decided to act (already applied to the sim) */
  action?: { type: string; text: string };
  relationship: DialogueRelationship;
}

export interface DialogueFailure {
  ok: false;
  reason: string;
}

/** Per-world, per-NPC conversation history — persists across dialogue sessions. */
const histories = new Map<string, DialogueTurn[]>();

function historyFor(worldId: string, npcId: string, historyKey?: string): DialogueTurn[] {
  const key = `${historyKey ?? ""}|${worldId}:${npcId}`;
  let history = histories.get(key);
  if (!history) {
    history = [];
    histories.set(key, history);
  }
  return history;
}

export function clearDialogueHistories(historyKey?: string): void {
  if (historyKey === undefined) {
    histories.clear();
    return;
  }
  for (const key of [...histories.keys()]) {
    if (key.startsWith(`${historyKey}|`)) histories.delete(key);
  }
}

export function dialogueAvailable(): boolean {
  return isLlmEnabled();
}

export function relationshipFor(npc: Npc): DialogueRelationship {
  const score = npc.relationships?.["player"] ?? 0;
  const label =
    score <= -6 ? "hostile" : score <= -3 ? "cold" : score < 2 ? "neutral" : score < 5 ? "friendly" : score < 8 ? "close" : "devoted";
  return { score, label };
}

export function dialogueContext(
  world: World,
  npcId: string,
  historyKey?: string
): { turns: DialogueTurn[]; relationship: DialogueRelationship } | null {
  const npc = world.npcs.find((entry) => entry.id === npcId);
  if (!npc) return null;
  return { turns: historyFor(world.id, npcId, historyKey), relationship: relationshipFor(npc) };
}

/**
 * Free-flowing in-character conversation with real agency: the model returns
 * {reply, action, disposition}. A decided action is validated by the engine
 * rules and applied to the world (this is what separates the game from a
 * character-chat site — the NPC can actually leave, hand items over, offer
 * quests, or attack). Disposition develops the player relationship.
 */
export async function generateDialogueReply(
  world: World,
  npcId: string,
  playerText: string,
  options: DialogueOptions = {}
): Promise<DialogueResult | DialogueFailure> {
  const complete: DialogueCompleter = options.complete ?? (options.onToken ? streamText : completeText);
  const npc = world.npcs.find((entry) => entry.id === npcId);
  if (!npc) return { ok: false, reason: "unknown_npc" };
  if (npc.combat?.defeated) return { ok: false, reason: "npc_defeated" };
  // same location, or exit-adjacent: the sim flips locations instantly while the
  // visual walk catches up, so a face-to-face NPC may already be "elsewhere"
  if (npc.locationId !== world.player.locationId && !isAdjacent(world, npc.locationId, world.player.locationId)) {
    return { ok: false, reason: "npc_not_here" };
  }

  const history = historyFor(world.id, npcId, options.historyKey);
  const system = buildDialogueSystem(world, npc);
  const user = buildDialogueUser(world, npc, history, playerText);

  const onToken = options.onToken ? heldBackTokenizer(options.onToken) : undefined;
  const result = await complete({ tier: npc.tier === "quest" ? "quest" : "normal", system, user, onToken });
  if ("skipped" in result && result.skipped) return { ok: false, reason: result.reason };
  if ("error" in result && result.error) return { ok: false, reason: result.error };
  if (!("text" in result) || !result.text) return { ok: false, reason: "empty_reply" };

  const parsed = parseDialogueJson(result.text, npc.name);
  if (!parsed.reply) return { ok: false, reason: "empty_reply" };

  history.push({ speaker: "player", text: playerText }, { speaker: "npc", text: parsed.reply });

  const playerName = world.player.name ?? "the visitor";
  npc.memories.push(
    { tick: world.tick, text: `${playerName} said to me: ${playerText}`, meta: { sourceActorId: "player", visibility: "private", importance: 2 } },
    { tick: world.tick, text: `I replied to ${playerName}: ${parsed.reply}`, meta: { visibility: "private", importance: 2 } }
  );

  // relationship development from the model's read of the exchange
  if (parsed.disposition !== 0) {
    const current = npc.relationships?.["player"] ?? 0;
    npc.relationships = { ...npc.relationships, player: clamp(current + parsed.disposition, -10, 10) };
    const axes = npc.relationshipAxes?.["player"] ?? {};
    npc.relationshipAxes = {
      ...npc.relationshipAxes,
      player: {
        ...axes,
        trust: clamp((axes.trust ?? 0) + parsed.disposition, -10, 10),
        affection: clamp((axes.affection ?? 0) + (parsed.disposition > 0 ? 1 : -1), -10, 10),
      },
    };
  }

  // decided action: engine-validated, then applied for real
  let appliedAction: DialogueResult["action"];
  if (parsed.action?.type === "spar") {
    const text = `${npc.name} squares up for a friendly spar!`;
    appliedAction = { type: "spar", text };
    history.push({ speaker: "event", text });
    npc.memories.push({ tick: world.tick, text: `I sparred with the player to test their resolve.`, meta: { importance: 2, visibility: "private" } });
  } else if (parsed.action?.type === "follow" || parsed.action?.type === "unfollow") {
    const text =
      parsed.action.type === "follow"
        ? `${npc.name} starts following you.`
        : `${npc.name} stops following you.`;
    appliedAction = { type: parsed.action.type, text };
    history.push({ speaker: "event", text });
    npc.memories.push({ tick: world.tick, text, meta: { importance: 2, visibility: "private" } });
  } else if (parsed.action?.type === "create_quest") {
    const created = createDynamicQuest(world, npc, parsed.action);
    if (created) {
      appliedAction = { type: "create_quest", text: created };
      history.push({ speaker: "event", text: created });
    }
  } else if (parsed.action) {
    const candidate = normalizeAction(parsed.action, npc.id);
    if (candidate) {
      const validation = validateAction(world, candidate);
      if (validation.ok) {
        const outcome = applyAction(world, candidate);
        if (outcome.applied) {
          appliedAction = { type: candidate.type, text: outcome.text };
          history.push({ speaker: "event", text: outcome.text });
        }
      }
    }
  }

  while (history.length > HISTORY_LIMIT) history.shift();

  return { ok: true, reply: parsed.reply, ...(appliedAction ? { action: appliedAction } : {}), relationship: relationshipFor(npc) };
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
    `You are talking face to face with the player INSIDE a living world where you`,
    `can really act. FORMAT: write your spoken line directly (1-3 sentences, in`,
    `character, no name prefix, no quotes, no markdown). Then, on a NEW final line,`,
    `write exactly: @@{"action":null,"disposition":0}`,
    ``,
    `"disposition": how this exchange shifted your feelings about the player,`,
    `an integer from -2 (offended) to 2 (warmed), usually 0.`,
    ``,
    `"action": null for pure talk — or, when the conversation reaches a decision`,
    `point, one of (use exact ids from CAPABILITIES):`,
    `{"type":"move","locationId":"<id>"} — walk off somewhere (ends the chat)`,
    `{"type":"give","itemId":"<id>"} — hand the player an item you hold`,
    `{"type":"offer_quest","questId":"<id>"} — formally ask for the player's help`,
    `{"type":"fight"} — attack the player (only when truly provoked or it fits your nature)`,
    `{"type":"create_quest","title":"<short task name>","description":"<one sentence>"} —`,
    `  entrust the player with a NEW task when the conversation naturally produces one`,
    `{"type":"complete_quest","questId":"<id>"} — declare a quest fulfilled when the player has done it`,
    `{"type":"follow"} — start traveling WITH the player (when you agree to come along)`,
    `{"type":"unfollow"} — stop following the player`,
    `{"type":"spar"} — accept a friendly, non-lethal practice duel (training, testing each other)`,
    ``,
    `Never repeat a line you already said. If the conversation is circling or has`,
    `run its course, make a decision: act, or say goodbye and move. You may`,
    `refuse, lie, bargain, or redirect as the character would.`,
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
  const conversation = history
    .slice(-12)
    .map((turn) => (turn.speaker === "event" ? `[${turn.text}]` : `${turn.speaker === "player" ? "Player" : npc.name}: ${turn.text}`))
    .join("\n");
  const quests = (world.quests ?? [])
    .filter((quest) => quest.giverId === npc.id)
    .filter((quest) => (quest.status ?? "open") === "open" || quest.status === "active")
    .map((quest) => {
      let state = " — offerable";
      if (quest.status === "active") {
        const met = questObjectiveMet(world, quest);
        state =
          met === false
            ? ` — NOT completable: ${questObjectiveBlockText(world, quest)} Do not complete_quest yet; tell the player what is still missing.`
            : met === true
              ? " — the task is verifiably done; complete_quest now and thank them"
              : " — completable if the player has truly done it";
      }
      return `quest ${quest.id}: ${quest.title} [${quest.status ?? "open"}${state}]`;
    })
    .join("\n");
  const held = world.items
    .filter((item) => item.holderId === npc.id)
    .map((item) => `item ${item.id}: ${item.name}`)
    .join("\n");
  const exits = (world.exits ?? [])
    .flatMap((exit) => {
      if (exit.from === npc.locationId) return [exit.to];
      if (exit.bidirectional && exit.to === npc.locationId) return [exit.from];
      return [];
    })
    .map((id) => `location ${id}: ${locationName(world, id)}`)
    .join("\n");
  const relationship = relationshipFor(npc);
  return [
    `Location: ${locationName(world, npc.locationId)}. Time: day ${world.clock.day}, ${Math.floor(world.clock.hour)}:00.`,
    here ? `Also present: ${here}.` : "You are alone with the player.",
    `Your feelings toward the player: ${relationship.label} (${relationship.score}).`,
    `CAPABILITIES you may use in "action":`,
    exits ? `Places you can walk to:\n${exits}` : "",
    held ? `Items you hold:\n${held}` : "",
    quests ? `Quests you can offer:\n${quests}` : "",
    memories ? `Your relevant memories:\n${memories}` : "",
    conversation ? `Conversation so far:\n${conversation}` : "",
    ``,
    `Player says: "${playerText}"`,
    `Your spoken reply (then the @@ control line):`,
  ]
    .filter(Boolean)
    .join("\n");
}

interface ParsedDialogue {
  reply: string;
  action: { type?: string; locationId?: string; itemId?: string; questId?: string; title?: string; description?: string } | null;
  disposition: number;
}

const MAX_DYNAMIC_QUESTS = 10;

function createDynamicQuest(world: World, npc: Npc, action: NonNullable<ParsedDialogue["action"]>): string | null {
  const title = typeof action.title === "string" ? action.title.trim().slice(0, 80) : "";
  if (!title) return null;
  const quests = world.quests ?? [];
  const dynamicCount = quests.filter((quest) => quest.id.startsWith("dyn_")).length;
  if (dynamicCount >= MAX_DYNAMIC_QUESTS) return null;
  if (quests.some((quest) => quest.title.toLowerCase() === title.toLowerCase() && quest.status !== "done" && quest.status !== "failed")) {
    return null;
  }
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "task";
  const quest = {
    id: `dyn_${slug}_${world.tick}`,
    title,
    description: typeof action.description === "string" ? action.description.trim().slice(0, 200) : undefined,
    giverId: npc.id,
    status: "active" as const,
    acceptedBy: "player" as const,
  };
  world.quests = [...quests, quest];
  npc.memories.push({ tick: world.tick, text: `I asked the player to: ${title}`, meta: { importance: 3, visibility: "private" } });
  return `${npc.name} entrusts you with a new task: ${title}.`;
}

function parseDialogueJson(raw: string, npcName: string): ParsedDialogue {
  const text = raw.trim().replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  // streaming format: spoken text, then a final "@@{...}" control line
  const marker = text.lastIndexOf("@@");
  if (marker !== -1) {
    const spoken = sanitizeReply(text.slice(0, marker), npcName);
    const tail = text.slice(marker + 2).trim();
    try {
      const control = JSON.parse(tail) as { action?: ParsedDialogue["action"]; disposition?: unknown };
      return {
        reply: spoken,
        action: control.action && typeof control.action === "object" ? control.action : null,
        disposition: typeof control.disposition === "number" ? Math.max(-2, Math.min(2, Math.round(control.disposition))) : 0,
      };
    } catch {
      if (spoken) return { reply: spoken, action: null, disposition: 0 };
    }
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1)) as Partial<ParsedDialogue> & { reply?: unknown; disposition?: unknown };
      const reply = typeof parsed.reply === "string" ? sanitizeReply(parsed.reply, npcName) : "";
      const disposition = typeof parsed.disposition === "number" ? Math.max(-2, Math.min(2, Math.round(parsed.disposition))) : 0;
      const action = parsed.action && typeof parsed.action === "object" ? (parsed.action as ParsedDialogue["action"]) : null;
      if (reply) return { reply, action, disposition };
    } catch {
      // fall through to plain-text handling
    }
  }
  return { reply: sanitizeReply(text, npcName), action: null, disposition: 0 };
}

function normalizeAction(
  action: NonNullable<ParsedDialogue["action"]>,
  npcId: string
): Action | null {
  switch (action.type) {
    case "move":
      return action.locationId ? { type: "move", actorId: npcId, locationId: action.locationId } : null;
    case "give":
      return action.itemId ? { type: "give", actorId: npcId, itemId: action.itemId, targetId: "player" } : null;
    case "offer_quest":
      return action.questId ? { type: "offer_quest", actorId: npcId, questId: action.questId, targetId: "player" } : null;
    case "fight":
      return { type: "fight", actorId: npcId, targetId: "player" };
    case "complete_quest":
      return action.questId ? { type: "complete_quest", actorId: npcId, questId: action.questId } : null;
    default:
      return null;
  }
}

function sanitizeReply(raw: string, npcName: string): string {
  let text = raw.trim();
  const prefix = new RegExp(`^${npcName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*`, "i");
  text = text.replace(prefix, "").trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("“") && text.endsWith("”"))) {
    text = text.slice(1, -1).trim();
  }
  if (text.length > REPLY_MAX_CHARS) text = `${text.slice(0, REPLY_MAX_CHARS - 1).trimEnd()}…`;
  return text;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isAdjacent(world: World, a: string, b: string): boolean {
  return (world.exits ?? []).some(
    (exit) => (exit.from === a && exit.to === b) || (exit.bidirectional !== false && exit.from === b && exit.to === a)
  );
}

/**
 * Forwards visible reply tokens but withholds anything from "@@" onward (the
 * control tail) plus a small boundary buffer so the JSON never flashes onscreen.
 */
function heldBackTokenizer(emit: (delta: string) => void): (delta: string) => void {
  let pending = "";
  let stopped = false;
  return (delta: string) => {
    if (stopped) return;
    pending += delta;
    const marker = pending.indexOf("@@");
    if (marker !== -1) {
      const safe = pending.slice(0, marker);
      if (safe) emit(safe);
      stopped = true;
      return;
    }
    // keep one trailing "@"-risk char buffered
    const holdFrom = pending.endsWith("@") ? pending.length - 1 : pending.length;
    const safe = pending.slice(0, holdFrom);
    if (safe) {
      emit(safe);
      pending = pending.slice(holdFrom);
    }
  };
}
