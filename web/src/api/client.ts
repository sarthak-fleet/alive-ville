import type { PlayerAction, TickSummary, World } from "../../../src/types.ts";

export async function fetchState(): Promise<World> {
  const res = await fetch("/api/state");
  if (!res.ok) throw new Error(`fetchState failed: ${res.status}`);
  return (await res.json()) as World;
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
  const data = (await res.json()) as TickResponse | { error: string };
  if ("error" in data) throw new Error(data.error);
  return data;
}

export interface Snapshot {
  capturedAt: string;
  world: World;
}

export async function fetchSnapshot(): Promise<Snapshot> {
  const res = await fetch("/api/save");
  if (!res.ok) throw new Error(`fetchSnapshot failed: ${res.status}`);
  return (await res.json()) as Snapshot;
}

export async function restoreSnapshot(snapshot: Snapshot | World): Promise<World> {
  const res = await fetch("/api/restore", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(snapshot),
  });
  const data = (await res.json()) as { ok: true; state: World } | { error: string };
  if ("error" in data) throw new Error(data.error);
  return data.state;
}
