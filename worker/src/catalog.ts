import opmIngestSource from "../../fixtures/anime/opm-ingest-source.json";
import type { World } from "../../src/types.ts";
import { worldSourceToWorld } from "../../src/world-ingest.ts";
import demonSlayerSource from "../../worlds/demon-slayer-source.json";
import onePunchMan from "../../worlds/one-punch-man.json";
import showcase from "../../worlds/showcase.json";
import village from "../../worlds/village.json";

export interface BundledWorld {
  id: string;
  name: string;
  blurb: string;
  kind: "world" | "source";
  beta: boolean;
  showcase: boolean;
  raw: Record<string, unknown>;
}

function entryFor(raw: Record<string, unknown>): BundledWorld {
  const isSource = typeof raw["title"] === "string" && Array.isArray(raw["characters"]);
  return {
    id: String(raw["worldId"] ?? raw["id"]),
    name: String(raw["title"] ?? raw["name"]),
    blurb: String(raw["synopsis"] ?? (raw["story"] as { premise?: string } | undefined)?.premise ?? "").slice(0, 160),
    kind: isSource ? "source" : "world",
    beta: Boolean(raw["beta"]),
    showcase: Boolean(raw["showcase"]),
    raw,
  };
}

export const BUNDLED_WORLDS: BundledWorld[] = [
  entryFor(village as Record<string, unknown>),
  entryFor(showcase as Record<string, unknown>),
  entryFor(demonSlayerSource as Record<string, unknown>),
  entryFor(onePunchMan as Record<string, unknown>),
  entryFor(opmIngestSource as Record<string, unknown>),
];

export function worldForEntry(entry: BundledWorld): World {
  return entry.kind === "source" ? worldSourceToWorld(entry.raw as never) : (structuredClone(entry.raw) as unknown as World);
}

export function defaultWorld(): World {
  return worldForEntry(BUNDLED_WORLDS[0]!);
}
