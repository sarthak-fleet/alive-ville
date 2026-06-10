import type { AgentLoopStatus } from "../../../src/agent-loop.ts";
import type { PlayerAction, TickSummary, World } from "../../../src/types.ts";
import type { WorldIngestSource } from "../../../src/world-ingest.ts";

export interface TickResponse {
  summary: TickSummary;
  state: World;
}

export async function fetchState(): Promise<World> {
  const res = await fetch("/api/state");
  return readApiJson<World>(res, "fetchState");
}

export async function postTick(action: PlayerAction | null): Promise<TickResponse> {
  const res = await fetch("/api/tick", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
  });
  const data = await readApiJson<TickResponse | { error: string }>(res, "postTick");
  if ("error" in data) throw new Error(data.error);
  return data;
}

export interface DialogueResponse {
  llm: boolean;
  reply?: string;
  error?: string;
}

export async function postDialogue(npcId: string, text: string): Promise<DialogueResponse> {
  const res = await fetch("/api/dialogue", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ npcId, text }),
  });
  return readApiJson<DialogueResponse>(res, "postDialogue");
}

export async function fetchAgentLoopStatus(): Promise<AgentLoopStatus> {
  const res = await fetch("/api/agent-loop/status");
  return readApiJson<AgentLoopStatus>(res, "fetchAgentLoopStatus");
}

export async function setAgentLoopRunning(running: boolean): Promise<AgentLoopStatus> {
  const res = await fetch(`/api/agent-loop/${running ? "start" : "stop"}`, { method: "POST" });
  return readApiJson<AgentLoopStatus>(res, "setAgentLoopRunning");
}

export interface WorldMutationResponse {
  ok: true;
  state: World;
}

export async function importWorldSource(source: WorldIngestSource): Promise<WorldMutationResponse> {
  const res = await fetch("/api/import-world-source", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source }),
  });
  const data = await readApiJson<WorldMutationResponse | { error: string; issues?: unknown[] }>(res, "importWorldSource");
  if ("error" in data) {
    const suffix = data.issues?.length ? ` ${JSON.stringify(data.issues)}` : "";
    throw new Error(`${data.error}${suffix}`);
  }
  return data;
}

export interface LiveEventHandlers {
  onTick: (summary: TickSummary) => void;
  onWorldReplaced: () => void;
}

export function subscribeEvents(handlers: LiveEventHandlers): () => void {
  const source = new EventSource("/api/events");
  source.addEventListener("tick", (event) => {
    try {
      const payload = JSON.parse((event as MessageEvent).data) as { summary: TickSummary };
      handlers.onTick(payload.summary);
    } catch {
      // malformed frame; the next state refetch reconciles
    }
  });
  source.addEventListener("world", () => handlers.onWorldReplaced());
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
  return Boolean(value && typeof value === "object" && typeof (value as { error?: unknown }).error === "string");
}
