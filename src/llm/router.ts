import type { ProposeMeta, ProposeRequest, ProposeResult, Tier } from "../types.ts";
import { cliBackend, cliComplete } from "./cli.ts";
import { localAiComplete, localAiUrl } from "./local-ai.ts";
import { logLlmCall } from "./log.ts";
import { ACTION_SCHEMA_PROMPT, parseActionJson } from "./schema.ts";

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
let llmFetch: FetchLike = (url, init) => fetch(url, init);

/** Workers cannot fetch sibling *.workers.dev directly — inject a service-binding fetch instead. */
export function setLlmFetch(fn: FetchLike): void {
  llmFetch = fn;
}

/** ambient NPC proposals are the call-volume hog — give them their own budget model */
function proposeModelFor(tier: Tier): string | null {
  if (tier === "normal") return process.env["LLM_MODEL_PROPOSE"] ?? TIER_MODEL[tier]?.() ?? null;
  return TIER_MODEL[tier]?.() ?? null;
}

const TIER_MODEL: Record<Tier, () => string | null> = {
  background: () => null,
  normal: () => process.env["LLM_MODEL_NORMAL"] ?? "deepseek-chat",
  quest: () => process.env["LLM_MODEL_QUEST"] ?? "deepseek-reasoner",
};

/** a free local backend (local-ai server or CLI) is driving the brains */
export function isLocalLlmBackend(): boolean {
  return Boolean(localAiUrl() ?? cliBackend());
}

export function isLlmEnabled(): boolean {
  // local-ai server, CLI backend (claude/codex), or any OpenAI-compatible
  // endpoint. Local servers like Ollama/LM Studio need no API key.
  if (localAiUrl() || cliBackend()) return true;
  return Boolean(process.env["LLM_BASE_URL"]);
}

async function localCompleteAs(
  kind: string,
  tier: Tier,
  system: string,
  user: string,
  onToken?: (delta: string) => void
): Promise<CompleteTextResult> {
  const started = Date.now();
  const viaServer = Boolean(localAiUrl());
  // dialogue deserves the better model; the per-tick proposal firehose gets the fast one
  const cliModel = process.env["LLM_LOCAL_AI_MODEL"] ?? (kind === "proposeAction" ? "haiku" : "sonnet");
  const result = viaServer ? await localAiComplete(system, user, onToken, cliModel) : await cliComplete(`${system}\n\n---\n\n${user}`);
  if (!viaServer && result.text) onToken?.(result.text);
  const model = viaServer ? `local-ai:${process.env["LLM_LOCAL_AI_PROVIDER"] ?? "claude"}:${cliModel}` : `cli:${cliBackend()}`;
  const meta: ProposeMeta = { tier, model, latencyMs: Date.now() - started, usage: null, error: result.error ?? null, jsonOk: false };
  logLlmCall({ kind, ...meta, raw: result.text });
  if (result.error || !result.text) return { error: result.error ?? "empty", meta };
  return { text: result.text, raw: result.text, meta };
}

function authHeaders(): Record<string, string> {
  const key = process.env["LLM_API_KEY"];
  return key ? { authorization: `Bearer ${key}` } : {};
}

// --- Rate-limit governor ------------------------------------------------------
// The ambient proposeAction firehose (up to LLM_MAX_NPCS calls every tick) shares
// ONE upstream quota with player-facing dialogue. When the gateway is rate-limited
// the firehose was burning the entire budget on retries, so the player's dialogue
// call got 429 → NPCs went "lost in thought (say that again)".
//
// The fix: shed the ambient load first. On any 429/5xx, proposeAction enters an
// exponential cooldown and short-circuits WITHOUT a network call — freeing the
// quota for dialogue, which is never gated by this breaker. A player who talks
// during a rate-limit storm trips the breaker too, so the firehose backs off
// immediately. Any success clears it.
const AMBIENT_COOLDOWN_BASE_MS = 8_000;
const AMBIENT_COOLDOWN_MAX_MS = 60_000;
let ambientCooldownUntil = 0;
let ambientCooldownMs = 0;

function isTransientHttpError(error: string | null): boolean {
  return error === "timeout" || /^HTTP (429|500|502|503|504)$/.test(error ?? "");
}

function ambientThrottled(): boolean {
  return Date.now() < ambientCooldownUntil;
}

/** Called when ANY call sees a transient upstream failure — backs the firehose off. */
function tripAmbientCooldown(): void {
  ambientCooldownMs = ambientCooldownMs ? Math.min(ambientCooldownMs * 2, AMBIENT_COOLDOWN_MAX_MS) : AMBIENT_COOLDOWN_BASE_MS;
  ambientCooldownUntil = Date.now() + ambientCooldownMs;
}

/** Called on any successful upstream call — clears the backoff. */
function clearAmbientCooldown(): void {
  ambientCooldownMs = 0;
  ambientCooldownUntil = 0;
}

// Force-pinning a single model defeats the gateway's health-aware fallback: when
// that model is rate-limited/exhausted the call returns empty → NPCs go "lost in
// thought". Default to advisory (body.model is a hint; the gateway routes to a
// healthy model). Opt back into strict pinning with LLM_FORCE_MODEL=1.
function forceModelHeader(model: string): Record<string, string> {
  return process.env["LLM_FORCE_MODEL"] === "1" ? { "x-gateway-force-model": model } : {};
}


export interface CompleteTextRequest {
  tier?: Tier;
  system: string;
  user: string;
  signal?: AbortSignal;
  /** override the env timeout (long generations like world imports) */
  timeoutMs?: number;
  /** explicit model id, bypassing tier mapping (world imports need a strong non-reasoning model) */
  model?: string;
}

export type CompleteTextResult =
  | { skipped: true; reason: string }
  | { skipped?: false; text: string; raw: string; meta: ProposeMeta }
  | { skipped?: false; error: string; raw?: string; meta: ProposeMeta };

export async function proposeAction({ tier = "normal", system, user, signal }: ProposeRequest): Promise<ProposeResult> {
  if (tier === "background") return { skipped: true, reason: "background tier" };
  if (!isLlmEnabled()) return { skipped: true, reason: "no LLM_API_KEY" };

  if (localAiUrl() || cliBackend()) {
    const result = await localCompleteAs("proposeAction", tier, `${system}\n\n${ACTION_SCHEMA_PROMPT}`, user);
    if ("error" in result && result.error) return { error: result.error, meta: result.meta };
    if (!("text" in result)) return { skipped: true, reason: "cli_unavailable" };
    const parsedCli = parseActionJson(result.text);
    if (!parsedCli.ok) return { error: parsedCli.reason ?? "Empty response.", raw: result.text, meta: result.meta };
    return { action: parsedCli.action as ProposeResult extends { action: infer A } ? A : never, raw: result.text, meta: result.meta };
  }

  const model = proposeModelFor(tier);
  if (!model) return { skipped: true, reason: `unknown tier ${tier}` };

  // Shed ambient load while the upstream is rate-limited — no network call, so
  // the freed quota goes to player dialogue. Dialogue paths are never gated.
  if (ambientThrottled()) return { skipped: true, reason: "rate_cooldown" };

  const url = `${process.env["LLM_BASE_URL"]!.replace(/\/$/, "")}/chat/completions`;
  const timeoutMs = Number(process.env["LLM_TIMEOUT_MS"] ?? 8000);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  signal?.addEventListener("abort", () => ac.abort(), { once: true });

  const noThink = process.env["LLM_NO_THINK"] === "1";
  const body: {
    model: string;
    project_id?: string;
    response_format?: { type: "json_object" };
    temperature: number;
    messages: Array<{ role: "system" | "user"; content: string }>;
  } = {
    model,
    project_id: process.env["LLM_PROJECT_ID"] ?? "ai-game",
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
    const response = await llmFetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(),        ...forceModelHeader(model),
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
  if (isTransientHttpError(error)) tripAmbientCooldown();
  else clearAmbientCooldown();

  if (error) return { error, meta };
  if (!parsed || !parsed.ok) return { error: parsed?.reason ?? "Empty response.", raw, meta };
  return { action: parsed.action as ProposeResult extends { action: infer A } ? A : never, raw, meta };
}

export interface StreamTextRequest extends CompleteTextRequest {
  onToken?: (delta: string) => void;
}

/** Streaming variant of completeText: emits deltas via onToken, resolves with the full text. */
export async function streamText({ tier = "quest", system, user, signal, onToken, timeoutMs: timeoutOverride, model: modelOverride }: StreamTextRequest): Promise<CompleteTextResult> {
  if (tier === "background") return { skipped: true, reason: "background tier" };
  if (!isLlmEnabled()) return { skipped: true, reason: "no LLM_API_KEY" };

  if (localAiUrl() || cliBackend()) return localCompleteAs("streamText", tier, system, user, onToken);

  const model = modelOverride ?? TIER_MODEL[tier]?.();
  if (!model) return { skipped: true, reason: `unknown tier ${tier}` };

  const url = `${process.env["LLM_BASE_URL"]!.replace(/\/$/, "")}/chat/completions`;
  const timeoutMs = timeoutOverride ?? Number(process.env["LLM_TIMEOUT_MS"] ?? 8000);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs * 2);
  signal?.addEventListener("abort", () => ac.abort(), { once: true });

  const started = Date.now();
  let raw = "";
  let error: string | null = null;

  try {
    const response = await llmFetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(),        ...forceModelHeader(model),
      },
      body: JSON.stringify({
        model,
        project_id: process.env["LLM_PROJECT_ID"] ?? "ai-game",
        temperature: Number(process.env["LLM_TEMPERATURE"] ?? 0.7),
        stream: true,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: ac.signal,
    });
    if (!response.ok || !response.body) {
      error = `HTTP ${response.status}`;
    } else {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
            const delta = parsed.choices?.[0]?.delta?.content ?? "";
            if (delta) {
              raw += delta;
              onToken?.(delta);
            }
          } catch {
            // partial frame; skip
          }
        }
      }
      if (!raw.trim()) error = "empty response";
    }
  } catch (err) {
    error = (err as Error).name === "AbortError" ? "timeout" : (err as Error).message;
  } finally {
    clearTimeout(timer);
  }

  const meta: ProposeMeta = { tier, model, latencyMs: Date.now() - started, error, jsonOk: false };
  logLlmCall({ kind: "streamText", ...meta, raw });
  // A dialogue 429/5xx means the quota is exhausted — back the ambient firehose off
  // hard so this and the next dialogue turn have headroom.
  if (isTransientHttpError(error)) tripAmbientCooldown();
  else if (!error) clearAmbientCooldown();
  if (error) return { error, raw, meta };
  return { text: raw.trim(), raw, meta };
}

export async function completeText({ tier = "quest", system, user, signal, timeoutMs: timeoutOverride, model: modelOverride }: CompleteTextRequest): Promise<CompleteTextResult> {
  if (tier === "background") return { skipped: true, reason: "background tier" };
  if (!isLlmEnabled()) return { skipped: true, reason: "no LLM_API_KEY" };

  if (localAiUrl() || cliBackend()) return localCompleteAs("completeText", tier, system, user);

  const model = modelOverride ?? TIER_MODEL[tier]?.();
  if (!model) return { skipped: true, reason: `unknown tier ${tier}` };

  const url = `${process.env["LLM_BASE_URL"]!.replace(/\/$/, "")}/chat/completions`;
  const timeoutMs = timeoutOverride ?? Number(process.env["LLM_TIMEOUT_MS"] ?? 8000);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  signal?.addEventListener("abort", () => ac.abort(), { once: true });

  const started = Date.now();
  let raw: string | undefined;
  let usage: unknown;
  let error: string | null = null;

  try {
    const response = await llmFetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(),        ...forceModelHeader(model),
      },
      body: JSON.stringify({
        model,
        project_id: process.env["LLM_PROJECT_ID"] ?? "ai-game",
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
  if (isTransientHttpError(error)) tripAmbientCooldown();
  else if (!error) clearAmbientCooldown();

  if (error) return { error, raw, meta };
  return { text: raw!.trim(), raw: raw!, meta };
}
