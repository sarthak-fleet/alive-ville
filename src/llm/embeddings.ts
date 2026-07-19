/**
 * embeddings.ts — text embeddings for semantic memory recall.
 *
 * Pattern from AI Town (`convex/agent/embeddingsCache.ts`, MIT): embed memories
 * once, cache the vector, score recall by cosine similarity. Uses the same
 * OpenAI-compatible gateway as the chat router (`LLM_BASE_URL` + `/embeddings`).
 * Degrades gracefully: if no base URL / no embeddings endpoint / any error, it
 * returns null and callers fall back to keyword relevance — zero regression.
 */

let llmFetch: (url: string, init: RequestInit) => Promise<Response> = (url, init) =>
  fetch(url, init);

// After one failure (e.g. the gateway has no /embeddings route) stop retrying
// so we don't add a doomed network call to every dialogue turn.
let embeddingsDisabled = false;

function embeddingsAvailable(): boolean {
  return !embeddingsDisabled && Boolean(process.env['LLM_BASE_URL']);
}

/** Embed one string. Returns null when embeddings are unavailable (caller falls back to keywords). */
export async function embed(text: string): Promise<number[] | null> {
  if (!embeddingsAvailable() || !text.trim()) return null;
  const url = `${process.env['LLM_BASE_URL']!.replace(/\/$/, '')}/embeddings`;
  try {
    const response = await llmFetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(process.env['LLM_API_KEY']
          ? { authorization: `Bearer ${process.env['LLM_API_KEY']}` }
          : {}),
      },
      // free-ai gateway embedding ids: @cf/baai/bge-* (Workers AI, free), voyage-*,
      // or text-embedding-004 (Gemini). bge-base is the free default; project_id is required.
      body: JSON.stringify({
        model: process.env['LLM_MODEL_EMBED'] ?? '@cf/baai/bge-base-en-v1.5',
        input: text,
        project_id: process.env['LLM_PROJECT_ID'] ?? 'ai-game',
      }),
    });
    if (!response.ok) {
      embeddingsDisabled = true;
      return null;
    }
    const json = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
    const vector = json.data?.[0]?.embedding;
    return Array.isArray(vector) && vector.length > 0 ? vector : null;
  } catch {
    embeddingsDisabled = true;
    return null;
  }
}
