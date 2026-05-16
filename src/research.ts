import { completeText } from "./llm/router.ts";
import type { ProposeMeta } from "./types.ts";

export interface ResearchSource {
  url: string;
  title: string | null;
  text: string;
  fetchedAt: string;
}

export interface ResearchSummary {
  source: ResearchSource;
  question: string | null;
  summary: string;
  meta: ProposeMeta;
}

export interface SummarizeUrlOptions {
  question?: string;
  fetcher?: typeof fetch;
  complete?: typeof completeText;
  maxChars?: number;
}

const DEFAULT_MAX_CHARS = 18_000;

export async function fetchResearchSource(
  url: string,
  { fetcher = fetch, maxChars = DEFAULT_MAX_CHARS }: Pick<SummarizeUrlOptions, "fetcher" | "maxChars"> = {}
): Promise<ResearchSource> {
  const parsed = parseHttpUrl(url);
  const response = await fetcher(parsed.href, {
    headers: {
      "accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
      "user-agent": "ai-game-research/0.1",
    },
  });
  if (!response.ok) throw new Error(`Fetch failed: HTTP ${response.status}`);

  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.text();
  const title = contentType.includes("html") ? extractTitle(body) : null;
  const text = contentType.includes("html") ? extractReadableText(body, maxChars) : normalizeText(body).slice(0, maxChars);
  if (!text) throw new Error("Fetched page has no readable text");

  return {
    url: parsed.href,
    title,
    text,
    fetchedAt: new Date().toISOString(),
  };
}

export async function summarizeUrl(url: string, options: SummarizeUrlOptions = {}): Promise<ResearchSummary> {
  const source = await fetchResearchSource(url, options);
  const question = options.question?.trim() || null;
  const complete = options.complete ?? completeText;
  const result = await complete({
    tier: "quest",
    system: [
      "You are a research assistant for building a playable AI RPG world.",
      "Use only the provided source text.",
      "Be concise, concrete, and separate facts from game-design inferences.",
    ].join("\n"),
    user: buildResearchPrompt(source, question),
  });

  if ("skipped" in result && result.skipped) throw new Error(`Research model skipped: ${result.reason}`);
  if ("error" in result && result.error) throw new Error(`Research model failed: ${result.error}`);
  if (!("text" in result)) throw new Error("Research model did not return text");

  return {
    source,
    question,
    summary: result.text,
    meta: result.meta,
  };
}

export function buildResearchPrompt(source: ResearchSource, question: string | null = null): string {
  return [
    `URL: ${source.url}`,
    source.title ? `Title: ${source.title}` : "",
    question ? `Question: ${question}` : "Question: Extract what matters for a future playable world/import pipeline.",
    "",
    "Return:",
    "1. Key facts from the source.",
    "2. Useful characters, locations, factions, items, or conflicts.",
    "3. Game-design inferences clearly labeled as inferences.",
    "4. Anything uncertain or missing.",
    "",
    "Source text:",
    source.text,
  ].filter(Boolean).join("\n");
}

export function extractReadableText(input: string, maxChars = DEFAULT_MAX_CHARS): string {
  const withoutIgnored = input
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, " ")
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ");
  const withBreaks = withoutIgnored
    .replace(/<\/(p|div|section|article|header|footer|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  return decodeBasicEntities(withBreaks.replace(/<[^>]+>/g, " "))
    .split("\n")
    .map(normalizeText)
    .filter(Boolean)
    .join("\n")
    .slice(0, maxChars);
}

export function extractTitle(input: string): string | null {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(input);
  const title = match?.[1] ? normalizeText(decodeBasicEntities(match[1].replace(/<[^>]+>/g, " "))) : "";
  return title || null;
}

function parseHttpUrl(input: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error("URL must be absolute");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("URL must use http or https");
  }
  return parsed;
}

function normalizeText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function decodeBasicEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}
