import type { ProposeRequest, ProposeResult, Tier } from "../types.ts";
import { logLlmCall } from "./log.ts";
import { ACTION_SCHEMA_PROMPT, parseActionJson } from "./schema.ts";

const TIER_MODEL: Record<Tier, () => string | null> = {
  background: () => null,
  normal: () => process.env.LLM_MODEL_NORMAL ?? "deepseek-chat",
  quest: () => process.env.LLM_MODEL_QUEST ?? "deepseek-reasoner",
};

export function isLlmEnabled(): boolean {
  return Boolean(process.env.LLM_API_KEY) && Boolean(process.env.LLM_BASE_URL);
}

export async function proposeAction({ tier = "normal", system, user, signal }: ProposeRequest): Promise<ProposeResult> {
  if (tier === "background") return { skipped: true, reason: "background tier" };
  if (!isLlmEnabled()) return { skipped: true, reason: "no LLM_API_KEY" };

  const model = TIER_MODEL[tier]?.();
  if (!model) return { skipped: true, reason: `unknown tier ${tier}` };

  const url = `${process.env.LLM_BASE_URL!.replace(/\/$/, "")}/chat/completions`;
  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS ?? 8000);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  signal?.addEventListener("abort", () => ac.abort(), { once: true });

  const body = {
    model,
    response_format: { type: "json_object" },
    temperature: 0.7,
    messages: [
      { role: "system", content: `${system}\n\n${ACTION_SCHEMA_PROMPT}` },
      { role: "user", content: user },
    ],
  };

  const started = Date.now();
  let raw: string | undefined;
  let parsed: ReturnType<typeof parseActionJson> | undefined;
  let usage: unknown;
  let error: string | null = null;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.LLM_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    if (!response.ok) {
      error = `HTTP ${response.status}`;
    } else {
      const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: unknown };
      raw = data.choices?.[0]?.message?.content ?? "";
      parsed = parseActionJson(raw);
      usage = data.usage;
    }
  } catch (err) {
    error = (err as Error).name === "AbortError" ? "timeout" : (err as Error).message;
  } finally {
    clearTimeout(timer);
  }

  const latencyMs = Date.now() - started;
  const meta = { tier, model, latencyMs, usage, error, jsonOk: parsed?.ok ?? false };
  logLlmCall({ kind: "proposeAction", ...meta, raw });

  if (error) return { error, meta };
  if (!parsed || !parsed.ok) return { error: parsed?.reason ?? "Empty response.", raw, meta };
  return { action: parsed.action as ProposeResult extends { action: infer A } ? A : never, raw, meta };
}
