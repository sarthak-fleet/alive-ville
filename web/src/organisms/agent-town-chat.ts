import { type NpcMemory, summarizeMemoryForPrompt } from "./agent-town-memory.ts";
import type { CastMember, StorySnapshot } from "./agent-town-world.ts";

const ENDPOINT = (import.meta as { env?: { VITE_LOCAL_AI_URL?: string } }).env?.VITE_LOCAL_AI_URL ?? "http://localhost:3456/chat";

export interface DialogueRequest {
  character: CastMember;
  snapshot: StorySnapshot;
  memory: NpcMemory;
  signal: AbortSignal;
  onToken: (text: string) => void;
}

export async function streamNpcDialogue({ character, snapshot, memory, signal, onToken }: DialogueRequest): Promise<{ ok: boolean }> {
  const system = `You voice ${character.name}, ${character.role} in a top-down 2D city sim called Agent Town. Stay in-character. Use any prior interactions the character knows about. Reply with ONE short line (max 22 words), no quotes, no narration tags, no asterisks.`;
  const progress = describeProgress(snapshot);
  const memoryLine = summarizeMemoryForPrompt(character, memory);
  const messages = [
    { role: "user", content: `Memory of ${character.name}: ${character.memory}. ${memoryLine} Quest state: ${progress}. Player has just walked up and pressed E to talk.` },
  ];

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "claude", model: "haiku", messages, systemPrompt: system }),
      signal,
    });
    if (!response.ok || !response.body) return { ok: false };
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const parsed = JSON.parse(payload) as { text?: string };
          if (typeof parsed.text === "string") onToken(parsed.text);
        } catch {
          // ignore malformed event
        }
      }
    }
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

function describeProgress(snapshot: StorySnapshot): string {
  const parts: string[] = [];
  if (snapshot.flags.couponFound && !snapshot.flags.couponReturned) parts.push("carrying Saitama's coupon");
  if (snapshot.flags.couponReturned) parts.push("returned the coupon");
  if (snapshot.flags.alertRaised) parts.push("alert board active");
  if (snapshot.flags.sonicChallenged) parts.push("dueled Sonic");
  return parts.length > 0 ? parts.join(", ") : "just starting the patrol";
}
