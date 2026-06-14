import { memoryMetaFromText } from "./agents.ts";
import { recordChronicle } from "./chronicle.ts";
import { checkCoherence } from "./coherence.ts";
import { completeText, type CompleteTextResult, isLlmEnabled, streamText } from "./llm/router.ts";
import { relationalContext } from "./memory-relational.ts";
import { divergenceNudges, rightNowFor, voiceFingerprint } from "./npc-voice.ts";
import { questObjectiveBlockText, questObjectiveMet } from "./quest-objectives.ts";
import { applyAction, locationName, retrieveMemoriesSemantic, validateAction } from "./simulation.ts";
import type { Action, Npc, World } from "./types.ts";

const HISTORY_LIMIT = 24;
const MEMORY_LIMIT = Number(process.env["LLM_MEMORY_LIMIT"] ?? 5);
/** ticks the NPC stays locked after each dialogue exchange (~24 s at 4 s/tick) */
const LOCK_TICKS = 6;
const REPLY_MAX_CHARS = 420;
const DEFLECTION_LINE = "I'd rather not talk about that right now.";
const PACED_FLUSH_CHUNK_CHARS = 24;
const PACED_FLUSH_DELAY_MS = 14;

async function pacedFlush(emit: (delta: string) => void, text: string, signal?: AbortSignal): Promise<void> {
  for (let i = 0; i < text.length; i += PACED_FLUSH_CHUNK_CHARS) {
    if (signal?.aborted) return;
    emit(text.slice(i, i + PACED_FLUSH_CHUNK_CHARS));
    if (i + PACED_FLUSH_CHUNK_CHARS < text.length) {
      await new Promise((resolve) => setTimeout(resolve, PACED_FLUSH_DELAY_MS));
    }
  }
}

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
  /** when aborted, skips pending LLM retries and stops emitting tokens */
  signal?: AbortSignal;
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
  // story mode: zero-AI public tier — choice dialogue served from sim state
  if (process.env["GAME_MODE"] === "story") return false;
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
  const { signal } = options;
  const complete: DialogueCompleter = options.complete ?? (options.onToken ? streamText : completeText);
  const npc = world.npcs.find((entry) => entry.id === npcId);
  if (!npc) return { ok: false, reason: "unknown_npc" };
  if (npc.combat?.defeated) return { ok: false, reason: "npc_defeated" };
  // same location, or exit-adjacent: the sim flips locations instantly while the
  // visual walk catches up, so a face-to-face NPC may already be "elsewhere"
  if (npc.locationId !== world.player.locationId && !isAdjacent(world, npc.locationId, world.player.locationId)) {
    return { ok: false, reason: "npc_not_here" };
  }

  // lock the NPC in-place for the duration of this exchange; refreshed each turn
  npc.talkingToPlayerUntilTick = world.tick + LOCK_TICKS;

  const history = historyFor(world.id, npcId, options.historyKey);
  const system = buildDialogueSystem(world, npc);
  const user = await buildDialogueUser(world, npc, history, playerText);

  // When streaming, buffer tokens internally so we can coherence-check before
  // the player sees anything.  The heldBackTokenizer strips the @@ control tail
  // as usual; we just accumulate into our own buffer instead of forwarding.
  const userOnToken = options.onToken;
  let streamBuffer = "";
  const bufferingOnToken = userOnToken
    ? heldBackTokenizer((delta: string) => { streamBuffer += delta; })
    : undefined;

  const onToken = bufferingOnToken ?? undefined;
  const result = await complete({ tier: npc.tier === "quest" ? "quest" : "normal", system, user, onToken });
  if ("skipped" in result && result.skipped) return { ok: false, reason: result.reason };
  if ("error" in result && result.error) return { ok: false, reason: result.error };
  if (!("text" in result) || !result.text) return { ok: false, reason: "empty_reply" };

  let parsed = parseDialogueJson(result.text, npc.name, world.player.name ?? "");
  if (!parsed.reply) return { ok: false, reason: "empty_reply" };

  // Coherence pre-flight — runs on both streaming and non-streaming paths.
  // Streaming tokens are buffered above and only flushed after this check.
  const coherence = checkCoherence(world, npc, parsed.reply, { playerText });
  if (!coherence.ok) {
    // Check abort before burning a retry LLM call.
    if (signal?.aborted) return { ok: false, reason: "cancelled" };
    // One retry with the violation hint appended to the system prompt.
    streamBuffer = "";
    const correctedSystem = `${system}\n\n${coherence.hint}`;
    const retryOnToken = bufferingOnToken
      ? heldBackTokenizer((delta: string) => { streamBuffer += delta; })
      : undefined;
    const retry = await complete({ tier: npc.tier === "quest" ? "quest" : "normal", system: correctedSystem, user, onToken: retryOnToken });
    const retryParsed = "text" in retry && retry.text ? parseDialogueJson(retry.text, npc.name, world.player.name ?? "") : null;
    const retryCoherence = retryParsed?.reply
      ? checkCoherence(world, npc, retryParsed.reply, { playerText })
      : null;

    if (retryParsed?.reply && retryCoherence?.ok !== false) {
      // Retry succeeded — use the corrected reply.
      parsed = retryParsed;
    } else {
      // Both attempts failed — fall back to scripted deflection.
      parsed = { reply: DEFLECTION_LINE, action: null, disposition: 0 };
      streamBuffer = DEFLECTION_LINE;
    }
    // Record coherence catch immediately after retry resolves, before any flush,
    // so it survives even if the client disconnects during the paced flush.
    recordChronicle(world, {
      kind: "coherence_caught",
      text: `${npc.name}'s reply was incoherent; retried and corrected.`,
      actorId: npc.id,
      playerCaused: false,
    });
    npc.memories.push({
      tick: world.tick,
      text: `(system) My previous reply was flagged as incoherent and was corrected.`,
      meta: { importance: 1, visibility: "private", tags: ["coherence-caught"] },
    });
  }

  // Flush buffered tokens to the client now that coherence has passed.
  // Paced into ~6-char chunks so the player still sees a typewriter cascade
  // rather than the whole reply popping in at once — costs ~300-500ms of
  // extra wall time but restores the streaming feel that coherence buffering
  // would otherwise destroy.
  if (signal?.aborted) return { ok: false, reason: "cancelled" };
  if (userOnToken && streamBuffer) await pacedFlush(userOnToken, streamBuffer, signal);
  if (signal?.aborted) return { ok: false, reason: "cancelled" };

  history.push({ speaker: "player", text: playerText }, { speaker: "npc", text: parsed.reply });

  const playerName = world.player.name ?? "the visitor";
  // what you tell an NPC is no longer sealed: juicy lines become shareable
  // and travel the rumor network (see src/rumors.ts)
  const playerLineMeta = memoryMetaFromText(playerText);
  // In the showcase, the whole point is that word travels — let substantive
  // lines spread (≥3) instead of only the juiciest (≥5).
  const shareThreshold = world.showcase ? 3 : 5;
  const visibility = (playerLineMeta.importance ?? 0) >= shareThreshold ? "shared" : "private";
  // shared player lines become the root of a causal chain — stamp the
  // chronicle id onto the seed memory so gossip + secret recognition can
  // trace any later beat back to "the player said this"
  let playerChronicleId: string | undefined;
  if (visibility === "shared") {
    const trimmed = playerText.length > 80 ? `${playerText.slice(0, 80)}…` : playerText;
    const event = recordChronicle(world, {
      kind: "player_word",
      text: `You told ${npc.name}: "${trimmed}"`,
      actorId: "player",
      targetId: npc.id,
      playerCaused: true,
    });
    playerChronicleId = event.id;
  }
  npc.memories.push(
    {
      tick: world.tick,
      text: `${playerName} said to me: ${playerText}`,
      meta: {
        ...playerLineMeta,
        sourceActorId: "player",
        visibility,
        ...(visibility === "shared" ? { subject: "player" as const } : {}),
        ...(playerChronicleId ? { chronicleId: playerChronicleId } : {}),
      },
    },
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
    const isFollow = parsed.action.type === "follow";
    npc.followingPlayer = isFollow;
    const text = isFollow ? `${npc.name} starts following you.` : `${npc.name} stops following you.`;
    appliedAction = { type: parsed.action.type, text };
    history.push({ speaker: "event", text });
    npc.memories.push({ tick: world.tick, text, meta: { importance: 2, visibility: "private" } });
  } else if (parsed.action?.type === "lead") {
    const locationId = (parsed.action as { locationId?: unknown }).locationId;
    if (typeof locationId === "string") {
      const candidate = { type: "move", actorId: npcId, locationId } as Action;
      if (validateAction(world, candidate).ok) {
        applyAction(world, candidate);
        const text = `${npc.name} sets off toward ${locationName(world, locationId)} — follow them!`;
        appliedAction = { type: "lead", text };
        history.push({ speaker: "event", text });
        npc.memories.push({ tick: world.tick, text: `I led the player toward ${locationName(world, locationId)}.`, meta: { importance: 2, visibility: "private" } });
      }
    }
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

export function buildDialogueSystem(world: World, npc: Npc): string {
  const traits = [
    ...(npc.traits?.personality ?? []),
    ...(npc.traits?.values ?? []).map((value) => `values ${value}`),
    ...(npc.traits?.flaws ?? []).map((flaw) => `flaw: ${flaw}`),
  ].join(", ");
  const knownSecrets = (npc.secrets ?? [])
    .filter((secret) => (secret.knownBy ?? [npc.id]).includes(npc.id))
    .map((secret) => `- ${secret.text} (risk ${secret.risk}; only reveal if it serves you)`)
    .join("\n");

  // latest reflection memories (private insights synthesised from experience)
  const reflectionInsights = npc.memories
    .filter((m) => m.meta?.tags?.includes("reflection"))
    .slice(-2)
    .map((m) => `- ${m.text}`)
    .join("\n");

  const valuesLine = (npc.traits?.values ?? []).join(", ");
  const flawsLine = (npc.traits?.flaws ?? []).join(", ");
  const standingBeliefs = [
    `STANDING BELIEFS`,
    valuesLine ? `Values: ${valuesLine}.` : "",
    flawsLine ? `Flaws: ${flawsLine}.` : "",
    npc.playerImpression ? `Your standing impression: ${npc.playerImpression}` : "",
    reflectionInsights ? `What you've come to believe:\n${reflectionInsights}` : "",
    `Hold your positions: when the player asserts something that contradicts your beliefs or memories, push back in character — you are not obliged to agree or please.`,
    `Stay in YOUR distinct voice (${npc.traits?.speechStyle ?? "your own style"}); never drift into a generic helpful tone.`,
  ]
    .filter(Boolean)
    .join("\n");

  // rumors about what the player has done — sorted by importance, top 2
  const playerRumors = npc.memories
    .filter((m) => m.meta?.subject === "player")
    .sort((a, b) => (b.meta?.importance ?? 0) - (a.meta?.importance ?? 0))
    .slice(0, 2)
    .map((m) => `- ${m.text}`)
    .join("\n");
  const rumorBlock = playerRumors
    ? [`RUMORS ABOUT YOU`, playerRumors].join("\n")
    : "";

  const voiceBlock = `VOICE:\n${voiceFingerprint(npc)}`;
  const rightNowBlock = rightNowFor(world, npc);
  const nudges = divergenceNudges(npc);
  const divergeBlock = nudges.length > 0 ? `DIVERGE:\n${nudges.join("\n")}` : "";

  const playerName = world.player.name ?? "the visitor";
  // Showcase agents are static talkers: drop the whole act-in-the-world action
  // menu (move/fight/quest/give/lead/follow) — irrelevant here and a wall of
  // noise that pushed weak models off the rails. Keep it a focused chat + gossip.
  const instructions = world.showcase
    ? [
        ``,
        `You are simply chatting with ${playerName} in the plaza — nothing to do but talk.`,
        `Stay fully in character. Reply with ONLY your own spoken words — 1-2 short`,
        `sentences. No name prefix (not "${npc.name}:", not "${playerName}:"), no quotes, no`,
        `narration; never write ${playerName}'s lines or continue past your one reply.`,
        `If something you've heard (see RUMORS / your memories) fits, bring it up —`,
        `gossip is welcome, and it's fine to be wrong or to wonder aloud.`,
        `Then, on a NEW final line, write exactly: @@{"action":null,"disposition":0}`,
        ``,
        `"disposition": how this exchange shifted your feelings about ${playerName}, an`,
        `integer from -2 (offended) to 2 (warmed), usually 0.`,
      ]
    : [
        ``,
        `You are talking face to face with ${playerName} INSIDE a`,
        `living world where you can really act.`,
        `FORMAT: reply with ONLY your own spoken words — 1-3 sentences, in character. Do`,
        `NOT begin with any name prefix (not "${npc.name}:", not "${playerName}:").`,
        `Do NOT write ${playerName}'s lines, do NOT narrate, and do NOT`,
        `continue the conversation past your one reply. No quotes, no markdown. Then, on a`,
        `NEW final line, write exactly: @@{"action":null,"disposition":0}`,
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
        `{"type":"lead","locationId":"<id>"} — guide the player somewhere: you set off, they follow`,
        `  (use this whenever they ask you to take/show/escort them to a place)`,
        `{"type":"follow"} — start traveling WITH the player (when you agree to come along)`,
        `{"type":"unfollow"} — stop following the player`,
        `{"type":"spar"} — accept a friendly, non-lethal practice duel (training, testing each other)`,
        ``,
        `Never repeat a line you already said. If the conversation is circling or has`,
        `run its course, make a decision: act, or say goodbye and move. You may`,
        `refuse, lie, bargain, or redirect as the character would.`,
      ];

  return [
    `You are ${npc.name}, a character in "${world.story?.title ?? world.name}".`,
    `World premise: ${world.story?.premise ?? "(unknown)"}`,
    `Role: ${npc.role ?? "inhabitant"}. ${npc.description ?? ""}`,
    traits ? `Traits: ${traits}.` : "",
    npc.traits?.speechStyle ? `Speech style: ${npc.traits.speechStyle}.` : "",
    npc.mood ? `Current mood: ${npc.mood.emotion} (stress ${npc.mood.stress}, suspicion ${npc.mood.suspicion}).` : "",
    `Goals: ${(npc.goals ?? []).join("; ") || "live your life"}.`,
    knownSecrets ? `Secrets you hold:\n${knownSecrets}` : "",
    ...instructions,
    ``,
    rumorBlock,
    // The voice-fingerprint / standing-beliefs / diverge / right-now blocks stack
    // up and stilt the output into stiff, generic lines. A focused chat prompt
    // (persona + gossip) gives the model room to sound natural — keep those extras
    // for the dynamic game only.
    ...(world.showcase ? [] : [``, standingBeliefs, ``, voiceBlock, rightNowBlock, divergeBlock]),
  ]
    .filter(Boolean)
    .join("\n");
}

async function buildDialogueUser(world: World, npc: Npc, history: DialogueTurn[], playerText: string): Promise<string> {
  const topicMemories = (await retrieveMemoriesSemantic(world, npc.id, playerText, MEMORY_LIMIT))
    .map((memory) => `- (t${memory.tick}) ${memory.text}`)
    .join("\n");
  // relational recall: what this NPC remembers about the player + any NPC named
  const relational = relationalContext(
    npc.memories,
    playerText,
    { id: "player", name: world.player.name ?? "the player" },
    world.npcs.map((other) => ({ id: other.id, name: other.name }))
  );
  const showcase = world.showcase === true;
  const allMemories = [relational, topicMemories].filter(Boolean).join("\n");
  // showcase: keep the prompt from drowning in piled-up "X told me…" rumors
  const memories = showcase ? allMemories.split("\n").slice(0, 4).join("\n") : allMemories;
  const here = world.npcs
    .filter((other) => other.id !== npc.id && other.locationId === npc.locationId)
    .map((other) => other.name)
    .join(", ");
  const conversation = history
    .slice(-12)
    .map((turn) => (turn.speaker === "event" ? `[${turn.text}]` : `${turn.speaker === "player" ? "Player" : npc.name}: ${turn.text}`))
    .join("\n");
  // Don't offer fetch-quests across faction lines. If the player picked
  // Muzan (faction "demons") and walked up to Tanjiro (faction "demon-slayers"),
  // Tanjiro would never proactively ask the demon king to recover his sister's
  // wisteria charm. Active quests stay visible so any already-accepted task
  // can still be progressed.
  const playerCharForQuest = world.player.characterId
    ? world.npcs.find((n) => n.id === world.player.characterId)
    : null;
  const playerFaction = playerCharForQuest?.factionId;
  const npcFaction = npc.factionId;
  const hostileFaction = !!(playerFaction && npcFaction && playerFaction !== npcFaction);
  const quests = (world.quests ?? [])
    .filter((quest) => quest.giverId === npc.id)
    .filter((quest) => {
      const status = quest.status ?? "open";
      if (status === "active") return true;
      if (status !== "open") return false;
      // suppress fresh offers across hostile faction lines
      return !hostileFaction;
    })
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

  // Who the player IS in this world — not just "the player". When the player
  // has picked a canonical character (e.g. Muzan), NPCs must react to that
  // identity. Without this block the LLM treats every player as a polite
  // stranger and Tanjiro greets Muzan as a "kind soul".
  const playerName = world.player.name ?? "Wanderer";
  const playerCharId = world.player.characterId;
  const playerChar = playerCharId ? world.npcs.find((n) => n.id === playerCharId) : null;
  const identityLines: string[] = [`The player's character in this world: ${playerName}`];
  if (playerChar) {
    if (playerChar.role) identityLines.push(`  Role: ${playerChar.role}`);
    if (playerChar.factionId) identityLines.push(`  Faction: ${playerChar.factionId}`);
    if (playerChar.description) identityLines.push(`  About: ${playerChar.description}`);
  } else if (world.player.appearance?.sourceLook) {
    identityLines.push(`  Look: ${world.player.appearance.sourceLook}`);
  }

  // NPC's known stance toward THIS specific character — pulled from the world
  // data the ingest pipeline produced. Generic numeric "relationships toward
  // the player" is the fallback; canonical character relationships from the
  // source material take priority.
  const stanceLines: string[] = [];
  if (playerCharId) {
    const charRel = npc.relationships?.[playerCharId];
    const charAxes = npc.relationshipAxes?.[playerCharId];
    if (typeof charRel === "number") stanceLines.push(`  Disposition toward ${playerName}: ${charRel}`);
    if (charAxes && Object.keys(charAxes).length > 0) {
      const formatted = Object.entries(charAxes)
        .map(([axis, value]) => `${axis}=${value}`)
        .join(", ");
      stanceLines.push(`  Axes: ${formatted}`);
    }
  }
  if (stanceLines.length === 0) {
    stanceLines.push(`  Generic disposition toward player: ${relationship.label} (${relationship.score})`);
  }

  // NPC memories that reference the player character by name — surface them
  // here because retrieveMemories above keys on the player's UTTERANCE, not
  // their identity. Without this, prior canon (e.g. "Muzan killed my family")
  // never enters the prompt.
  const charMemoryHits = playerCharId || playerName
    ? (npc.memories ?? []).filter((m) => {
        const text = m.text ?? "";
        const hitId = playerCharId ? text.toLowerCase().includes(playerCharId.toLowerCase()) : false;
        const hitName = playerName ? text.toLowerCase().includes(playerName.toLowerCase()) : false;
        return hitId || hitName;
      }).slice(0, 4)
    : [];
  const charMemories = charMemoryHits.map((m) => `- (t${m.tick}) ${m.text}`).join("\n");

  return [
    `Location: ${locationName(world, npc.locationId)}. Time: day ${world.clock.day}, ${Math.floor(world.clock.hour)}:00.`,
    here ? `Also present: ${here}.` : `You are alone with ${playerName}.`,
    identityLines.join("\n"),
    `Your stance toward this character:\n${stanceLines.join("\n")}`,
    charMemories ? `What you specifically remember about ${playerName}:\n${charMemories}` : "",
    ...(showcase
      ? []
      : [
          `CAPABILITIES you may use in "action":`,
          exits ? `Places you can walk to:\n${exits}` : "",
          held ? `Items you hold:\n${held}` : "",
          quests ? `Quests you can offer:\n${quests}` : "",
        ]),
    memories ? `${showcase ? "What you've heard around the plaza" : "Your other relevant memories"}:\n${memories}` : "",
    conversation ? `Conversation so far:\n${conversation}` : "",
    ``,
    `${playerName} says: "${playerText}"`,
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

function parseDialogueJson(raw: string, npcName: string, playerName = ""): ParsedDialogue {
  const text = raw.trim().replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  // streaming format: spoken text, then a final "@@{...}" control line
  const marker = text.lastIndexOf("@@");
  if (marker !== -1) {
    const spoken = sanitizeReply(text.slice(0, marker), npcName, playerName);
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
      const reply = typeof parsed.reply === "string" ? sanitizeReply(parsed.reply, npcName, playerName) : "";
      const disposition = typeof parsed.disposition === "number" ? Math.max(-2, Math.min(2, Math.round(parsed.disposition))) : 0;
      const action = parsed.action && typeof parsed.action === "object" ? (parsed.action as ParsedDialogue["action"]) : null;
      if (reply) return { reply, action, disposition };
    } catch {
      // fall through to plain-text handling
    }
  }
  return { reply: sanitizeReply(text, npcName, playerName), action: null, disposition: 0 };
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

export function sanitizeReply(raw: string, npcName: string, playerName = ""): string {
  let text = raw.trim();
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // labels the model wrongly prefixes its reply with, or uses to fake extra turns
  const labels = [npcName, playerName, "Player", "Wanderer", "NPC", "You"].filter((l) => l && l.length <= 40);
  const labelAlt = labels.map(esc).join("|");
  // strip a leading speaker label ("Wanderer:", "Old Doran:", …)
  text = text.replace(new RegExp(`^\\s*(?:${labelAlt})\\s*:\\s*`, "i"), "").trim();
  // stop transcript continuation: drop from the first later "<Speaker>:" line onward,
  // so the model can't ventriloquise both sides of the conversation
  const turnRe = new RegExp(`^\\s*(?:${labelAlt})\\s*:`, "i");
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (i > 0 && turnRe.test(lines[i]!)) break;
    kept.push(lines[i]!);
  }
  text = kept.join(" ").replace(/\s+/g, " ").trim();
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
