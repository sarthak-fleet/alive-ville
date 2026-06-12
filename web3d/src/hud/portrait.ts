import { api } from "../api/client.ts";

// honor vite's base path ("/game/" in production) for static asset paths
const ASSET_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/**
 * URL resolution order for a portrait image:
 *   1. Static asset: /game/assets/portraits/<worldId>-<npcId>.png
 *      (pre-generated, ships via vite publicDir — works in prod without the server endpoint)
 *   2. Dev API: /game/api/portrait/<npcId> (served by src/server.ts, triggers generation if missing)
 *   3. Terminal: onError caller falls back to letter avatar
 */
export function portraitStaticUrl(npcId: string, worldId: string): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${ASSET_BASE}/assets/portraits/${slug(worldId)}-${slug(npcId)}.png`;
}

export function portraitApiUrl(npcId: string): string {
  return api(`/api/portrait/${encodeURIComponent(npcId)}`);
}
