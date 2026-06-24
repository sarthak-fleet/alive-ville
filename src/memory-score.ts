/**
 * memory-score.ts — pure, browser-safe memory retrieval.
 *
 * Generative Agents / AI Town scorer (Apache-2.0 / MIT): combine normalized
 * recency (exp-decay) × importance × relevance. Relevance is keyword/structured
 * by default and cosine when an embedding is supplied. NO server/env/fetch deps,
 * so the in-browser local-LLM path can rank an NPC's memories client-side with
 * zero network — embeddings are an optional argument, never required.
 */

import { cosineSimilarity } from './llm/cosine.ts';
import type { Memory } from './types.ts';

export interface ScoredMemory extends Memory {
  score: number;
}

const MEMORY_RECENCY_DECAY = 0.97; // per tick; lower = forgets faster
const MEMORY_W_RELEVANCE = 1.0;
const MEMORY_W_IMPORTANCE = 1.0;
const MEMORY_W_RECENCY = 1.0;
const MEMORY_W_EMOTION = 0.3;

export function tokenize(text: string): string[] {
  return text.toLowerCase().split(/\W+/).filter(Boolean);
}

function scoreMemory(
  currentTick: number,
  memory: Memory,
  terms: string[],
  queryEmbedding?: number[]
): number {
  const text = memory.text.toLowerCase();
  const tags = (memory.meta?.tags ?? []).map((tag) => tag.toLowerCase());
  // relevance: semantic cosine when both vectors exist, else keyword/tag overlap.
  let relevance: number;
  if (queryEmbedding && memory.meta?.embedding) {
    relevance = (cosineSimilarity(queryEmbedding, memory.meta.embedding) + 1) / 2;
  } else {
    const hits =
      terms.length === 0
        ? 0
        : terms.filter((term) => text.includes(term) || tags.includes(term)).length;
    relevance = terms.length === 0 ? 0 : hits / terms.length;
  }
  const importance = Math.min(1, Math.max(0, (memory.meta?.importance ?? 1) / 10));
  const recency = MEMORY_RECENCY_DECAY ** Math.max(0, currentTick - memory.tick);
  const emotion = Math.min(1, Math.abs(memory.meta?.emotionalWeight ?? 0) / 10);
  return (
    MEMORY_W_RELEVANCE * relevance +
    MEMORY_W_IMPORTANCE * importance +
    MEMORY_W_RECENCY * recency +
    MEMORY_W_EMOTION * emotion
  );
}

/** Rank memories by combined score, top-k. Pure — safe in node, worker, or browser. */
export function rankMemories(
  memories: Memory[],
  currentTick: number,
  query: string,
  limit = 5,
  queryEmbedding?: number[]
): ScoredMemory[] {
  const terms = tokenize(query);
  return memories
    .map((memory) => ({
      ...memory,
      score: scoreMemory(currentTick, memory, terms, queryEmbedding),
    }))
    .filter((memory) => memory.score > 0)
    .sort((a, b) => b.score - a.score || b.tick - a.tick)
    .slice(0, limit);
}
