import type { CompleteTextResult } from "../llm/router.ts";

/** Shared LLM-judge primitive. Resolves to a parsed result or null on failure. */
export type JudgeFn = (req: {
  tier: "normal" | "quest";
  system: string;
  user: string;
}) => Promise<CompleteTextResult>;

/** Binary judge: returns true = positive verdict, false = negative, null = parse failure. */
export async function judgeBinary(
  judge: JudgeFn,
  prompt: string
): Promise<{ verdict: boolean | null; tokenSpend: number }> {
  const result = await judge({
    tier: "normal",
    system:
      "You are a strict evaluator. Answer ONLY with a single word: YES or NO.",
    user: prompt,
  });

  const spend = extractTokenSpend(result);

  if ("skipped" in result && result.skipped) return { verdict: null, tokenSpend: spend };
  if ("error" in result && result.error) return { verdict: null, tokenSpend: spend };
  if (!("text" in result) || !result.text) return { verdict: null, tokenSpend: spend };

  const upper = result.text.trim().toUpperCase();
  if (upper.startsWith("YES")) return { verdict: true, tokenSpend: spend };
  if (upper.startsWith("NO")) return { verdict: false, tokenSpend: spend };
  return { verdict: null, tokenSpend: spend };
}

/** Numeric judge: returns score 0-10 or null on parse failure. */
export async function judgeScore(
  judge: JudgeFn,
  prompt: string
): Promise<{ score: number | null; tokenSpend: number }> {
  const result = await judge({
    tier: "normal",
    system:
      "You are a strict evaluator. Return ONLY a single integer 0-10. No explanation.",
    user: prompt,
  });

  const spend = extractTokenSpend(result);

  if ("skipped" in result && result.skipped) return { score: null, tokenSpend: spend };
  if ("error" in result && result.error) return { score: null, tokenSpend: spend };
  if (!("text" in result) || !result.text) return { score: null, tokenSpend: spend };

  const match = result.text.trim().match(/\d+/);
  if (!match) return { score: null, tokenSpend: spend };
  const n = parseInt(match[0]!, 10);
  if (n < 0 || n > 10) return { score: null, tokenSpend: spend };
  return { score: n, tokenSpend: spend };
}

function extractTokenSpend(result: CompleteTextResult): number {
  if ("meta" in result && result.meta?.usage) {
    const u = result.meta.usage as { total_tokens?: number };
    return u.total_tokens ?? 0;
  }
  return 0;
}
