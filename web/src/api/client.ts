import type { StoryPackage } from "../../../src/story-package.ts";
import type { PlayerAction, TickSummary, World } from "../../../src/types.ts";
import type { WorldIngestSource } from "../../../src/world-ingest.ts";

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

export async function fetchStoryPackage(): Promise<{ package: StoryPackage; issues: unknown[] }> {
  const res = await fetch("/api/story-package");
  if (!res.ok) throw new Error(`fetchStoryPackage failed: ${res.status}`);
  return (await res.json()) as { package: StoryPackage; issues: unknown[] };
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

export async function importStoryPackage(pkg: StoryPackage): Promise<World> {
  const res = await fetch("/api/import-story-package", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(pkg),
  });
  const data = (await res.json()) as { ok: true; state: World } | { error: string; issues?: unknown[] };
  if ("error" in data) {
    const suffix = data.issues ? ` ${JSON.stringify(data.issues)}` : "";
    throw new Error(`${data.error}${suffix}`);
  }
  return data.state;
}

export async function importWorldSource(source: WorldIngestSource): Promise<World> {
  const res = await fetch("/api/import-world-source", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source }),
  });
  const data = (await res.json()) as { ok: true; state: World } | { error: string; issues?: unknown[] };
  if ("error" in data) {
    const suffix = data.issues ? ` ${JSON.stringify(data.issues)}` : "";
    throw new Error(`${data.error}${suffix}`);
  }
  return data.state;
}
