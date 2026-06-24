export const ACTION_SCHEMA_PROMPT = `Reply with strict JSON only. No prose. No code fences.

Schema:
{
  "type": "move" | "talk" | "gossip" | "confront" | "remember" | "skip",
  "actorId": string,
  "targetId"?: string,
  "aboutId"?: string,
  "locationId"?: string,
  "text"?: string,
  "reason": string
}

Rules:
- Pick exactly one action.
- "skip" means do nothing this tick.
- Use only ids that exist in the world snapshot you were given.
- For "move", choose a different location id from the reachable move list.
- Keep "text" under 140 chars and in your voice.
- Output JSON. Nothing else.`;

export type ParseResult =
  | { ok: true; action: Record<string, unknown> }
  | { ok: false; reason: string };

export function parseActionJson(raw: unknown): ParseResult {
  if (typeof raw !== 'string') return { ok: false, reason: 'Empty response.' };
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'Not an object.' };
    return { ok: true, action: parsed as Record<string, unknown> };
  } catch (error) {
    return { ok: false, reason: `JSON parse failed: ${(error as Error).message}` };
  }
}
