import type { Item, Location, Npc, World } from "../../../src/types.ts";

export interface Palette {
  ground: string;
  structure: string;
  accent: string;
}

export function locationPalette(location: Location): Palette {
  const fallback = paletteForText(`${location.id} ${location.name}`);
  return {
    ground: location.visual?.palette?.ground ?? fallback.ground,
    structure: location.visual?.palette?.structure ?? fallback.structure,
    accent: location.visual?.palette?.accent ?? fallback.accent,
  };
}

export function paletteForText(text: string): Palette {
  // Warmer, lighter, more saturated than before — the old grounds were near-black
  // slate which read as flat/dead flooring. Buildings add per-building hue on top.
  if (/forge|training|engine|repair/i.test(text)) return { ground: "#4a3c2c", structure: "#9c5a34", accent: "#ffa24a" };
  if (/garden|wood|rookery|home/i.test(text)) return { ground: "#33513a", structure: "#58955d", accent: "#c4ee9a" };
  if (/bridge|overpass|alley|threat/i.test(text)) return { ground: "#3a4654", structure: "#75839c", accent: "#8fd6ff" };
  if (/inn|kiosk|counter|report/i.test(text)) return { ground: "#3e4356", structure: "#6c7994", accent: "#ffdf6a" };
  return { ground: "#414a5e", structure: "#7184a4", accent: "#f7dc8a" };
}

export type BodyShape = "average" | "broad" | "caped" | "mechanical" | "small" | "slim";

export interface ActorVisual {
  color: string;
  accentColor: string;
  skinColor: string;
  bodyShape: BodyShape;
}

type Appearance = Npc["appearance"] | World["player"]["appearance"];

export function actorVisualFor(appearance: Appearance, fallbackColor: string): ActorVisual {
  const palette = appearance?.palette ?? [];
  return {
    color: palette[0] ?? fallbackColor,
    accentColor: palette[2] ?? palette[1] ?? palette[0] ?? fallbackColor,
    skinColor: palette[1] ?? "#e8c39e",
    bodyShape: actorBodyShapeFor(appearance),
  };
}

export function actorBodyShapeFor(appearance: Appearance): BodyShape {
  const text = `${appearance?.sourceLook ?? ""} ${appearance?.bodyType ?? ""} ${appearance?.silhouette ?? ""} ${appearance?.outfit ?? ""} ${(appearance?.visualTags ?? []).join(" ")}`.toLowerCase();
  if (/cyborg|mechanical|robot|armor|armored/.test(text)) return "mechanical";
  if (/cape|caped|cloak/.test(text)) return "caped";
  if (/child|small|short|quick/.test(text)) return "small";
  if (/broad|strong|heavy|blacksmith|large|shoulder/.test(text)) return "broad";
  if (/lean|slim|ninja|floating|psychic|athletic/.test(text)) return "slim";
  return "average";
}

export interface ItemVisual {
  color: string;
  emissiveColor: string;
  material: NonNullable<Item["visual"]>["material"];
  shape: NonNullable<Item["visual"]>["shape"];
}

export function itemVisualFor(item: Item): ItemVisual {
  const fallback = itemVisualFallback(`${item.id} ${item.name} ${item.description ?? ""}`);
  return {
    color: item.visual?.palette?.primary ?? fallback.color,
    emissiveColor: item.visual?.palette?.emissive ?? fallback.emissiveColor,
    material: item.visual?.material ?? fallback.material,
    shape: item.visual?.shape ?? fallback.shape,
  };
}

function itemVisualFallback(text: string): ItemVisual {
  if (/gear|core|crystal|prism|glass|ember/i.test(text)) {
    return { color: "#9fc3ff", emissiveColor: "#12304a", material: "crystal", shape: /gear/i.test(text) ? "gear" : "core" };
  }
  if (/flag|scrap|cloth|paint/i.test(text)) return { color: "#e05f7a", emissiveColor: "#3a1420", material: "cloth", shape: "scrap" };
  if (/coupon|note|paper|map|letter/i.test(text)) return { color: "#f7e8a5", emissiveColor: "#3d331a", material: "paper", shape: "note" };
  if (/radio|signal/i.test(text)) return { color: "#596477", emissiveColor: "#7fd0ff", material: "radio", shape: "radio" };
  if (/scale|bone|shell|fang/i.test(text)) return { color: "#7fd0ff", emissiveColor: "#17324a", material: "organic", shape: "scale" };
  if (/token|coin|brass|badge|key/i.test(text)) return { color: "#d8a441", emissiveColor: "#3d2a05", material: "metal", shape: "token" };
  return { color: "#f8d44e", emissiveColor: "#4a3300", material: "metal", shape: "trinket" };
}

const CLOTHING_COLORS = ["#3c5a78", "#4a7a6a", "#7a4a52", "#56648a", "#6a5a3c", "#5d4a73", "#3f6e5a", "#8a5a3c"];
const CLOTHING_ACCENTS = ["#e8c95a", "#7fd0ff", "#ff9a6a", "#b5e48c", "#e88aa8", "#9fe8dd", "#f2e2b0", "#c9b8ff"];

/** deterministic clothing colors for characters without an explicit palette — never skin tones */
export function clothingColorsFor(seedId: string): { color: string; accent: string } {
  const hash = stableHash(seedId);
  return {
    color: CLOTHING_COLORS[hash % CLOTHING_COLORS.length]!,
    accent: CLOTHING_ACCENTS[(hash >> 4) % CLOTHING_ACCENTS.length]!,
  };
}

export function stableHash(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

export function stableOffset(id: string, radius: number): { x: number; z: number } {
  const hash = stableHash(id);
  const angle = ((hash % 360) * Math.PI) / 180;
  const scale = 0.45 + ((hash >> 8) % 40) / 100;
  return { x: Math.cos(angle) * radius * scale, z: Math.sin(angle) * radius * scale };
}
