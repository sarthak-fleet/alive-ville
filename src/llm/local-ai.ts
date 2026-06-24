/**
 * Backend for the sibling local-ai server (../local-ai): a tiny HTTP server
 * that spawns authenticated CLI tools (claude/codex/gemini) and streams
 * replies as SSE `data: {text}` frames terminated by `data: [DONE]`.
 */

export function localAiUrl(): string | null {
  return process.env['LLM_LOCAL_AI_URL'] ?? null;
}

export async function localAiComplete(
  system: string,
  user: string,
  onToken?: (delta: string) => void,
  model?: string
): Promise<{ text?: string; error?: string }> {
  const base = localAiUrl();
  if (!base) return { error: 'LLM_LOCAL_AI_URL not configured' };
  const timeoutMs = Number(process.env['LLM_TIMEOUT_MS'] ?? 120_000);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const response = await fetch(`${base.replace(/\/$/, '')}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: process.env['LLM_LOCAL_AI_PROVIDER'] ?? 'claude',
        ...((model ?? process.env['LLM_LOCAL_AI_MODEL'])
          ? { model: model ?? process.env['LLM_LOCAL_AI_MODEL'] }
          : {}),
        systemPrompt: system,
        messages: [{ role: 'user', content: user }],
      }),
      signal: ac.signal,
    });
    if (!response.ok || !response.body) return { error: `local-ai HTTP ${response.status}` };

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload) as { text?: string; error?: string };
          if (parsed.error) return { error: parsed.error };
          if (parsed.text) {
            text += parsed.text;
            onToken?.(parsed.text);
          }
        } catch {
          // partial frame
        }
      }
    }
    const final = text.trim();
    return final ? { text: final } : { error: 'local-ai returned no output' };
  } catch (error) {
    return { error: (error as Error).name === 'AbortError' ? 'timeout' : (error as Error).message };
  } finally {
    clearTimeout(timer);
  }
}
