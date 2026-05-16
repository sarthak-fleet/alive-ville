import type { ProposeMeta, ProposeRequest, ProposeResult, Tier } from "../types.ts";
import { logLlmCall } from "./log.ts";
import { ACTION_SCHEMA_PROMPT, parseActionJson } from "./schema.ts";

const TIER_MODEL: Record<Tier, () => string | null> = {
  background: () => null,
  normal: () => process.env["LLM_MODEL_NORMAL"] ?? "deepseek-chat",
  quest: () => process.env["LLM_MODEL_QUEST"] ?? "deepseek-reasoner",
};

export function isLlmEnabled(): boolean {
  return Boolean(process.env["LLM_API_KEY"]) && Boolean(process.env["LLM_BASE_URL"]);
}

export interface CompleteTextRequest {
  tier?: Tier;
  system: string;
  user: string;
  signal?: AbortSignal;
}

export type CompleteTextResult =
  | { skipped: true; reason: string }
  | { skipped?: false; text: string; raw: string; meta: ProposeMeta }
  | { skipped?: false; error: string; raw?: string; meta: ProposeMeta };

export async function proposeAction({ tier = "normal", system, user, signal }: ProposeRequest): Promise<ProposeResult> {
  if (tier === "background") return { skipped: true, reason: "background tier" };
  if (!isLlmEnabled()) return { skipped: true, reason: "no LLM_API_KEY" };

  const model = TIER_MODEL[tier]?.();
  if (!model) return { skipped: true, reason: `unknown tier ${tier}` };

  const url = `${process.env["LLM_BASE_URL"]!.replace(/\/$/, "")}/chat/completions`;
  const timeoutMs = Number(process.env["LLM_TIMEOUT_MS"] ?? 8000);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  signal?.addEventListener("abort", () => ac.abort(), { once: true });

  const noThink = process.env["LLM_NO_THINK"] === "1";
  const body: {
    model: string;
    response_format?: { type: "json_object" };
    temperature: number;
    messages: Array<{ role: "system" | "user"; content: string }>;
  } = {
    model,
    temperature: Number(process.env["LLM_TEMPERATURE"] ?? 0.7),
    messages: [
      {
        role: "system",
        content: `${system}\n\n${ACTION_SCHEMA_PROMPT}${noThink ? "\nDo not include chain-of-thought, markdown, or <think> tags. Return only the JSON object." : ""}`,
      },
      { role: "user", content: noThink ? `${user}\n\n/no_think` : user },
    ],
  };
  if (process.env["LLM_RESPONSE_FORMAT"] !== "0") {
    body.response_format = { type: "json_object" };
  }

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
        authorization: `Bearer ${process.env["LLM_API_KEY"]}`,
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

export async function completeText({ tier = "quest", system, user, signal }: CompleteTextRequest): Promise<CompleteTextResult> {
  if (tier === "background") return { skipped: true, reason: "background tier" };
  if (!isLlmEnabled()) return { skipped: true, reason: "no LLM_API_KEY" };

  const model = TIER_MODEL[tier]?.();
  if (!model) return { skipped: true, reason: `unknown tier ${tier}` };

  const url = `${process.env["LLM_BASE_URL"]!.replace(/\/$/, "")}/chat/completions`;
  const timeoutMs = Number(process.env["LLM_TIMEOUT_MS"] ?? 8000);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  signal?.addEventListener("abort", () => ac.abort(), { once: true });

  const started = Date.now();
  let raw: string | undefined;
  let usage: unknown;
  let error: string | null = null;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env["LLM_API_KEY"]}`,
      },
      body: JSON.stringify({
        model,
        temperature: Number(process.env["LLM_TEMPERATURE"] ?? 0.2),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: ac.signal,
    });
    if (!response.ok) {
      error = `HTTP ${response.status}`;
    } else {
      const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: unknown };
      raw = data.choices?.[0]?.message?.content ?? "";
      usage = data.usage;
      if (!raw.trim()) error = "empty response";
    }
  } catch (err) {
    error = (err as Error).name === "AbortError" ? "timeout" : (err as Error).message;
  } finally {
    clearTimeout(timer);
  }

  const meta: ProposeMeta = {
    tier,
    model,
    latencyMs: Date.now() - started,
    usage,
    error,
    jsonOk: false,
  };
  logLlmCall({ kind: "completeText", ...meta, raw });

  if (error) return { error, raw, meta };
  return { text: raw!.trim(), raw: raw!, meta };
}
