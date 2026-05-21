import type { AgentLoopStatus } from "../../../src/agent-loop.ts";
import type { StoryPackage } from "../../../src/story-package.ts";
import type { PlayerAction, TickSummary, World } from "../../../src/types.ts";
import type { WorldIngestSource } from "../../../src/world-ingest.ts";

export async function fetchState(): Promise<World> {
  const res = await fetch("/api/state");
  return readApiJson<World>(res, "fetchState");
}

export interface TickResponse {
  summary: TickSummary;
  state: World;
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

export interface Snapshot {
  capturedAt: string;
  world: World;
}

export interface WorldMutationResponse {
  ok: true;
  state: World;
  agentLoopStatus?: AgentLoopStatus;
}

export async function fetchSnapshot(): Promise<Snapshot> {
  const res = await fetch("/api/save");
  return readApiJson<Snapshot>(res, "fetchSnapshot");
}

export async function fetchStoryPackage(): Promise<{ package: StoryPackage; issues: unknown[] }> {
  const res = await fetch("/api/story-package");
  return readApiJson<{ package: StoryPackage; issues: unknown[] }>(res, "fetchStoryPackage");
}

export async function restoreSnapshot(snapshot: Snapshot | World): Promise<WorldMutationResponse> {
  const res = await fetch("/api/restore", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(snapshot),
  });
  const data = await readApiJson<WorldMutationResponse | { error: string }>(res, "restoreSnapshot");
  if ("error" in data) throw new Error(data.error);
  return data;
}

export async function importStoryPackage(pkg: StoryPackage): Promise<WorldMutationResponse> {
  const res = await fetch("/api/import-story-package", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(pkg),
  });
  const data = await readApiJson<WorldMutationResponse | { error: string; issues?: unknown[] }>(res, "importStoryPackage");
  if ("error" in data) {
    const suffix = data.issues ? ` ${JSON.stringify(data.issues)}` : "";
    throw new Error(`${data.error}${suffix}`);
  }
  return data;
}

export async function importWorldSource(source: WorldIngestSource): Promise<WorldMutationResponse> {
  const res = await fetch("/api/import-world-source", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source }),
  });
  const data = await readApiJson<WorldMutationResponse | { error: string; issues?: unknown[] }>(res, "importWorldSource");
  if ("error" in data) {
    const suffix = data.issues ? ` ${JSON.stringify(data.issues)}` : "";
    throw new Error(`${data.error}${suffix}`);
  }
  return data;
}

export async function fetchAgentLoopStatus(): Promise<AgentLoopStatus> {
  const res = await fetch("/api/agent-loop/status");
  return readApiJson<AgentLoopStatus>(res, "fetchAgentLoopStatus");
}

export async function startAgentLoop(): Promise<AgentLoopStatus> {
  return postAgentLoopCommand("/api/agent-loop/start");
}

export async function stopAgentLoop(): Promise<AgentLoopStatus> {
  return postAgentLoopCommand("/api/agent-loop/stop");
}

export async function stepAgentLoop(): Promise<{ status: AgentLoopStatus; state: World; summary: TickSummary }> {
  const res = await fetch("/api/agent-loop/step", { method: "POST" });
  const data = await readApiJson<{ status: AgentLoopStatus; state: World; summary: TickSummary } | { error: string; status: AgentLoopStatus }>(res, "stepAgentLoop");
  if ("error" in data) throw new Error(data.error);
  return data;
}

export async function restoreAgentLoopCheckpoint(tick?: number): Promise<{ status: AgentLoopStatus; state: World; checkpoint: { tick: number; capturedAt: string; worldId: string } }> {
  const res = await fetch("/api/agent-loop/restore-checkpoint", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(tick === undefined ? {} : { tick }),
  });
  const data = await readApiJson<
    { status: AgentLoopStatus; state: World; checkpoint: { tick: number; capturedAt: string; worldId: string } } | { error: string; status: AgentLoopStatus }
  >(res, "restoreAgentLoopCheckpoint");
  if ("error" in data) throw new Error(data.error);
  return data;
}

async function postAgentLoopCommand(path: string): Promise<AgentLoopStatus> {
  const res = await fetch(path, { method: "POST" });
  return readApiJson<AgentLoopStatus>(res, path);
}

async function readApiJson<T>(res: Response, label: string): Promise<T> {
  const text = await res.text();
  let data: unknown = null;
  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      if (!res.ok) throw new Error(`${label} failed: ${res.status}`);
      throw new Error(`${label} returned invalid JSON`);
    }
  }
  if (!res.ok) {
    const error = isErrorPayload(data) ? data.error : `${label} failed: ${res.status}`;
    const suffix = isErrorPayload(data) && data.issues ? ` ${JSON.stringify(data.issues)}` : "";
    throw new Error(`${error}${suffix}`);
  }
  return data as T;
}

function isErrorPayload(value: unknown): value is { error: string; issues?: unknown[] } {
  return Boolean(value && typeof value === "object" && typeof (value as { error?: unknown }).error === "string");
}
