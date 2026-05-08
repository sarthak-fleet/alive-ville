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
