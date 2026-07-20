import type { AgentLoopStatus } from '../../../src/agent-loop.ts';
import type { PlayerAction, TickSummary, World } from '../../../src/types.ts';
import type { WorldIngestSource } from '../../../src/world-ingest.ts';

export interface TickResponse {
  summary: TickSummary;
  state: World;
}

const SESSION_KEY = 'aliveville_session';
let cachedSessionId: string | null = null;

/** stable per-browser session id — the server keeps an isolated world per session */
function sessionId(): string {
  if (cachedSessionId) return cachedSessionId;
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID().replace(/-/g, '').slice(0, 24);
      localStorage.setItem(SESSION_KEY, id);
    }
    cachedSessionId = id;
  } catch {
    cachedSessionId = 'main';
  }
  return cachedSessionId;
}

// honor vite's base path ("/game/" in production) for same-origin API calls
const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** append base path + session to an API path (EventSource cannot send headers) */
export function api(path: string): string {
  return `${API_BASE}${path}${path.includes('?') ? '&' : '?'}session=${sessionId()}`;
}

export async function fetchState(): Promise<World> {
  const res = await fetch(api('/api/state'));
  return readApiJson<World>(res, 'fetchState');
}

export async function postTick(action: PlayerAction | null): Promise<TickResponse> {
  const res = await fetch(api('/api/tick'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  const data = await readApiJson<TickResponse | { error: string }>(res, 'postTick');
  if ('error' in data) throw new Error(data.error);
  return data;
}

interface DialogueRelationship {
  score: number;
  label: string;
}

export interface DialogueResponse {
  llm: boolean;
  reply?: string;
  error?: string;
  action?: { type: string; text: string } | null;
  relationship?: DialogueRelationship;
}

export interface StoryOption {
  id: string;
  label: string;
}

export interface DialogueHistoryResponse {
  llm: boolean;
  story?: boolean;
  options?: StoryOption[];
  turns?: Array<{ speaker: 'player' | 'npc' | 'event'; text: string }>;
  relationship?: DialogueRelationship;
}

export interface StoryChooseResponse {
  reply: string;
  action?: { type: string; text: string } | null;
  options: StoryOption[];
}

export async function postDialogueChoose(
  npcId: string,
  optionId: string
): Promise<StoryChooseResponse> {
  const res = await fetch(api('/api/dialogue/choose'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ npcId, optionId }),
  });
  return readApiJson<StoryChooseResponse>(res, 'postDialogueChoose');
}

export async function postDialogue(npcId: string, text: string): Promise<DialogueResponse> {
  const res = await fetch(api('/api/dialogue'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ npcId, text }),
  });
  return readApiJson<DialogueResponse>(res, 'postDialogue');
}

/** Streaming dialogue: onToken receives visible reply deltas; resolves with the final payload. */
export async function postDialogueStream(
  npcId: string,
  text: string,
  onToken: (delta: string) => void
): Promise<DialogueResponse> {
  const res = await fetch(api('/api/dialogue'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ npcId, text, stream: true }),
  });
  if (!res.ok || !res.body) throw new Error(`postDialogueStream failed: ${res.status}`);
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('text/event-stream')) {
    // server answered non-streaming (e.g. llm:false)
    return JSON.parse(await res.text()) as DialogueResponse;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName = '';
  let done: DialogueResponse | null = null;
  for (;;) {
    const { done: finished, value } = await reader.read();
    if (finished) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('data:')) {
        const payload = line.slice(5).trim();
        try {
          if (eventName === 'token') onToken((JSON.parse(payload) as { t: string }).t);
          else if (eventName === 'done') done = JSON.parse(payload) as DialogueResponse;
        } catch {
          // partial frame
        }
      }
    }
  }
  if (!done) throw new Error('postDialogueStream: stream ended without done event');
  return done;
}

export async function fetchDialogueHistory(npcId: string): Promise<DialogueHistoryResponse> {
  const res = await fetch(api(`/api/dialogue/history?npcId=${encodeURIComponent(npcId)}`));
  return readApiJson<DialogueHistoryResponse>(res, 'fetchDialogueHistory');
}

export async function fetchAgentLoopStatus(): Promise<AgentLoopStatus> {
  const res = await fetch(api('/api/agent-loop/status'));
  return readApiJson<AgentLoopStatus>(res, 'fetchAgentLoopStatus');
}

export async function setAgentLoopRunning(running: boolean): Promise<AgentLoopStatus> {
  const res = await fetch(api(`/api/agent-loop/${running ? 'start' : 'stop'}`), { method: 'POST' });
  return readApiJson<AgentLoopStatus>(res, 'setAgentLoopRunning');
}

export interface AgentLoopStepResponse {
  summary: TickSummary;
  status: AgentLoopStatus;
  state: World;
}

export async function stepAgentLoop(): Promise<AgentLoopStepResponse> {
  const res = await fetch(api('/api/agent-loop/step'), { method: 'POST' });
  const data = await readApiJson<
    AgentLoopStepResponse | { error: string; status: AgentLoopStatus }
  >(res, 'stepAgentLoop');
  if ('error' in data) throw new Error(data.error);
  return data;
}

export interface WorldMutationResponse {
  ok: true;
  state: World;
}

export async function importWorldSource(source: WorldIngestSource): Promise<WorldMutationResponse> {
  const res = await fetch(api('/api/import-world-source'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source }),
  });
  const data = await readApiJson<WorldMutationResponse | { error: string; issues?: unknown[] }>(
    res,
    'importWorldSource'
  );
  if ('error' in data) {
    const suffix = data.issues?.length ? ` ${JSON.stringify(data.issues)}` : '';
    throw new Error(`${data.error}${suffix}`);
  }
  return data;
}

/** Push a saved world snapshot back into the live session (OPFS save → load). */
export async function loadSnapshot(world: World): Promise<World> {
  const res = await fetch(api('/api/load'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ world }),
  });
  const data = await readApiJson<WorldMutationResponse | { error: string }>(res, 'loadSnapshot');
  if ('error' in data) throw new Error(data.error);
  return data.state;
}

export interface LiveEventHandlers {
  onTick: (summary: TickSummary) => void;
  onWorldReplaced: () => void;
}

export function subscribeEvents(handlers: LiveEventHandlers): () => void {
  const source = new EventSource(api('/api/events'));
  source.addEventListener('tick', (event) => {
    try {
      const payload = JSON.parse((event as MessageEvent).data) as { summary: TickSummary };
      handlers.onTick(payload.summary);
    } catch {
      // malformed frame; the next state refetch reconciles
    }
  });
  source.addEventListener('world', () => handlers.onWorldReplaced());
  return () => source.close();
}

async function readApiJson<T>(res: Response, label: string): Promise<T> {
  const text = await res.text();
  let data: unknown = null;
  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(res.ok ? `${label} returned invalid JSON` : `${label} failed: ${res.status}`);
    }
  }
  if (!res.ok) {
    const error = isErrorPayload(data) ? data.error : `${label} failed: ${res.status}`;
    throw new Error(error);
  }
  return data as T;
}

function isErrorPayload(value: unknown): value is { error: string } {
  return Boolean(
    value && typeof value === 'object' && typeof (value as { error?: unknown }).error === 'string'
  );
}
