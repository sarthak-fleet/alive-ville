/**
 * npc-prompt.ts — build an in-character prompt for the in-browser NPC brain.
 *
 * Mirrors a trimmed version of the server persona (src/dialogue.ts
 * buildDialogueSystem). The local model is small, so we ask for a plain spoken
 * line only — no action/JSON protocol; anything that needs a real sim action
 * still flows through the server path.
 */

import { relationalContext } from "../../../src/memory-relational.ts";
import { rankMemories } from "../../../src/memory-score.ts";
import type { Npc, World } from "../../../src/types.ts";

export interface DialogueLineLite {
  speaker: string;
  speakerName?: string;
  text: string;
}

/** Top relevant memories injected per local-dialogue turn. */
const LOCAL_MEMORY_LIMIT = 4;

export function buildNpcSystemPrompt(npc: Npc, world: World): string {
  const traits = npc.traits?.personality?.join(", ");
  return [
    `You are ${npc.name}, a character in "${world.story?.title ?? world.name}".`,
    world.story?.premise ? `World premise: ${world.story.premise}` : "",
    `Role: ${npc.role ?? "inhabitant"}.${npc.description ? ` ${npc.description}` : ""}`,
    traits ? `Traits: ${traits}.` : "",
    npc.traits?.speechStyle ? `Speech style: ${npc.traits.speechStyle}.` : "",
    npc.mood ? `Current mood: ${npc.mood.emotion}.` : "",
    npc.goals?.length ? `Goals: ${npc.goals.join("; ")}.` : "",
    npc.playerImpression ? `Your standing impression of the player: ${npc.playerImpression}` : "",
    "",
    "You are talking face to face with the player. Reply with ONLY your spoken line,",
    "1-2 short sentences, in character. No name prefix, no quotes, no narration.",
    "Never break character or admit to being an AI, a model, or a program — you ARE this character.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildNpcUserPrompt(npc: Npc, world: World, lines: DialogueLineLite[], playerText: string, playerName: string): string {
  // Structured memory recall, fully client-side (pure rankMemories — no server,
  // no embeddings): surface the memories most relevant to what the player said.
  const memories = rankMemories(npc.memories ?? [], world.tick, playerText, LOCAL_MEMORY_LIMIT)
    .map((memory) => `- ${memory.text}`)
    .join("\n");
  // relational recall: what this NPC remembers about the player + any NPC named
  const relational = relationalContext(
    npc.memories ?? [],
    playerText,
    { id: "player", name: playerName },
    world.npcs.map((other) => ({ id: other.id, name: other.name }))
  );
  const transcript = lines
    .filter((line) => line.speaker === "player" || line.speaker === "npc")
    .slice(-6)
    .map((line) => `${line.speaker === "player" ? playerName : line.speakerName || "You"}: ${line.text}`)
    .join("\n");
  return [
    relational,
    memories ? `What you remember that's relevant:\n${memories}` : "",
    transcript,
    `${playerName}: ${playerText}`,
    // clear "your turn" cue so the model replies as the NPC instead of
    // continuing the transcript / writing the player's next line
    `${npc.name} (reply with ONLY your own spoken line):`,
  ]
    .filter(Boolean)
    .join("\n");
}
