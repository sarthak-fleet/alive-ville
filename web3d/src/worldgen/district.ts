import type { Location, World } from "../../../src/types.ts";
import { locationPalette } from "../mapping/visuals.ts";
import {
  type BuildingModel,
  type DistrictModel,
  FLOOR_HEIGHT,
  type NpcSpawn,
  type PropKind,
  type PropModel,
  SIDEWALK_INSET,
  WORLD_SCALE,
} from "./model.ts";
import { interactablePlacementsFor, itemPlacementsFor, npcSpawnFor } from "./placements.ts";
import { pick, range, rngFor } from "./rng.ts";

interface RoleProfile {
  minFloors: number;
  maxFloors: number;
  density: number;
  props: PropKind[];
  trees: number;
}

const DEFAULT_PROFILE: RoleProfile = { minFloors: 1, maxFloors: 3, density: 0.8, props: ["lamp", "bench", "crate"], trees: 3 };

const ROLE_PROFILES: Array<{ pattern: RegExp; profile: RoleProfile }> = [
  { pattern: /urban|plaza|hub|city|square/i, profile: { minFloors: 2, maxFloors: 6, density: 0.9, props: ["lamp", "bench", "sign", "planter"], trees: 2 } },
  { pattern: /forge|training|engine|industrial|concrete/i, profile: { minFloors: 1, maxFloors: 2, density: 0.7, props: ["crate", "dummy", "lamp"], trees: 1 } },
  { pattern: /garden|home|apartment|wood|balcony/i, profile: { minFloors: 1, maxFloors: 3, density: 0.6, props: ["planter", "bench", "lamp"], trees: 7 } },
  { pattern: /inn|kiosk|counter|report|station|market/i, profile: { minFloors: 1, maxFloors: 2, density: 0.85, props: ["stall", "sign", "lamp", "crate"], trees: 2 } },
  { pattern: /bridge|overpass|ruin|threat|alley|monster/i, profile: { minFloors: 1, maxFloors: 4, density: 0.5, props: ["crate", "sign"], trees: 1 } },
];

const FOLIAGE_COLORS = ["#4e8f4a", "#5da55a", "#3f7e44", "#6fae5c"];

export function roleTextFor(location: Location): string {
  return `${location.name} ${location.visual?.role ?? ""} ${(location.visual?.visualTags ?? []).join(" ")}`;
}

function profileFor(location: Location): RoleProfile {
  return ROLE_PROFILES.find((entry) => entry.pattern.test(roleTextFor(location)))?.profile ?? DEFAULT_PROFILE;
}

export function generateDistrict(world: World, location: Location): DistrictModel {
  const palette = locationPalette(location);
  const profile = profileFor(location);
  const origin = { x: location.x * WORLD_SCALE, z: location.y * WORLD_SCALE };
  const width = location.w * WORLD_SCALE;
  const depth = location.h * WORLD_SCALE;
  const center = { x: origin.x + width / 2, z: origin.z + depth / 2 };
  const courtyardRadius = Math.min(width, depth) * 0.28;

  const buildings = generateBuildings(world.id, location.id, origin, width, depth, palette, profile);
  const plotHalfMin = Math.min(width, depth) / 2;
  const isNatureBiome = /garden|home|wood|forest|park|nature|grove/i.test(roleTextFor(location));
  const props = [
    ...generateProps(world.id, location.id, center, courtyardRadius, palette, profile),
    ...generateTrees(world.id, location.id, center, courtyardRadius, plotHalfMin, profile.trees),
    ...generateScatter(world.id, location.id, center, courtyardRadius, plotHalfMin, palette, isNatureBiome),
    // Fences disabled: they run along plot edges with no gate/road cutout and
    // were blocking district gateways. Re-enable once we respect the street
    // graph + building entrance corridors.
    // ...generateFences(world.id, location.id, origin, width, depth, palette),
    // Entrance planters disabled: they're placed at building entries with no
    // door-clearance margin and were blocking interior entry. Re-enable once
    // we respect each building's interactable interior entry point.
    // ...generateEntrancePlanters(world.id, location.id, buildings, center, palette),
  ];
  const courtyard = { x: center.x, z: center.z, radius: courtyardRadius };

  const items = itemPlacementsFor(world, courtyard, location.id);
  const interactables = interactablePlacementsFor(world, courtyard, location.id, palette.accent);
  const npcSpawns: NpcSpawn[] = world.npcs
    .filter((npc) => npc.locationId === location.id && npc.id !== world.player.characterId)
    .map((npc) => npcSpawnFor(npc.id, courtyard));

  return {
    locationId: location.id,
    name: location.name,
    roleText: roleTextFor(location),
    palette,
    origin,
    width,
    depth,
    courtyard: { x: center.x, z: center.z, radius: courtyardRadius },
    buildings,
    props,
    items,
    interactables,
    npcSpawns,
    playerSpawn: { x: center.x, z: center.z + courtyardRadius * 0.5 },
  };
}

function generateBuildings(
  worldId: string,
  locationId: string,
  origin: { x: number; z: number },
  width: number,
  depth: number,
  palette: { structure: string; accent: string },
  profile: RoleProfile
): BuildingModel[] {
  const buildings: BuildingModel[] = [];
  const beltDepth = Math.min(7, Math.min(width, depth) * 0.22);
  const inner = {
    minX: origin.x + SIDEWALK_INSET,
    minZ: origin.z + SIDEWALK_INSET,
    maxX: origin.x + width - SIDEWALK_INSET,
    maxZ: origin.z + depth - SIDEWALK_INSET,
  };

  const edges: Array<{ name: string; length: number; horizontal: boolean; fixed: number; start: number }> = [
    { name: "north", length: inner.maxX - inner.minX, horizontal: true, fixed: inner.minZ + beltDepth / 2, start: inner.minX },
    { name: "south", length: inner.maxX - inner.minX, horizontal: true, fixed: inner.maxZ - beltDepth / 2, start: inner.minX },
    { name: "west", length: inner.maxZ - inner.minZ - beltDepth * 2, horizontal: false, fixed: inner.minX + beltDepth / 2, start: inner.minZ + beltDepth },
    { name: "east", length: inner.maxZ - inner.minZ - beltDepth * 2, horizontal: false, fixed: inner.maxX - beltDepth / 2, start: inner.minZ + beltDepth },
  ];

  for (const edge of edges) {
    const rng = rngFor(worldId, locationId, "edge", edge.name);
    const gateCenter = edge.length / 2;
    const gateHalfWidth = 4;
    let cursor = 0;
    let lot = 0;
    while (cursor < edge.length) {
      const lotWidth = Math.min(range(rng, 5.5, 9.5), edge.length - cursor);
      if (lotWidth < 4) break;
      const lotCenter = cursor + lotWidth / 2;
      const overlapsGate = Math.abs(lotCenter - gateCenter) < gateHalfWidth + lotWidth / 2 - 1;
      const skip = overlapsGate || rng() > profile.density;
      if (!skip) {
        const floors = Math.round(range(rng, profile.minFloors, profile.maxFloors));
        const buildingDepth = Math.min(beltDepth, range(rng, beltDepth * 0.7, beltDepth));
        const shade = range(rng, -0.18, 0.22);
        // per-building hue rotation + saturation so a street reads as varied
        // buildings, not one tinted block (the old monochrome look).
        const body = hueShift(shiftColor(palette.structure, shade), range(rng, -18, 18), range(rng, 1.05, 1.3));
        buildings.push({
          id: `${locationId}:${edge.name}:${lot}`,
          x: edge.horizontal ? edge.start + lotCenter : edge.fixed,
          z: edge.horizontal ? edge.fixed : edge.start + lotCenter,
          width: edge.horizontal ? lotWidth - 0.8 : buildingDepth,
          depth: edge.horizontal ? buildingDepth : lotWidth - 0.8,
          height: Math.max(1, floors) * FLOOR_HEIGHT + range(rng, 0, 1.2),
          bodyColor: body,
          roofColor: shiftColor(body, -0.34),
          accentColor: palette.accent,
          floors,
          windows: floors >= 2,
        });
      }
      cursor += lotWidth;
      lot += 1;
    }
  }
  return buildings;
}

function generateProps(
  worldId: string,
  locationId: string,
  center: { x: number; z: number },
  courtyardRadius: number,
  palette: { structure: string; accent: string },
  profile: RoleProfile
): PropModel[] {
  const rng = rngFor(worldId, locationId, "props");
  const props: PropModel[] = [];
  const lampCount = 4;
  for (let index = 0; index < lampCount; index += 1) {
    const angle = (index / lampCount) * Math.PI * 2 + Math.PI / 4;
    props.push({
      id: `${locationId}:lamp:${index}`,
      kind: "lamp",
      x: center.x + Math.cos(angle) * courtyardRadius,
      z: center.z + Math.sin(angle) * courtyardRadius,
      rotationY: 0,
      color: shiftColor(palette.structure, -0.25),
      accentColor: "#ffe9b0",
    });
  }
  const extraCount = 5;
  for (let index = 0; index < extraCount; index += 1) {
    const kind = pick(rng, profile.props);
    const angle = rng() * Math.PI * 2;
    const distance = courtyardRadius * range(rng, 0.45, 1.25);
    props.push({
      id: `${locationId}:extra:${kind}:${index}`,
      kind,
      x: center.x + Math.cos(angle) * distance,
      z: center.z + Math.sin(angle) * distance,
      rotationY: rng() * Math.PI * 2,
      color: shiftColor(palette.structure, range(rng, -0.1, 0.25)),
      accentColor: palette.accent,
    });
  }
  return props;
}

function generateTrees(
  worldId: string,
  locationId: string,
  center: { x: number; z: number },
  courtyardRadius: number,
  plotHalfMin: number,
  count: number
): PropModel[] {
  const rng = rngFor(worldId, locationId, "trees");
  const trees: PropModel[] = [];
  const maxRadius = plotHalfMin - 8.5;
  if (maxRadius <= courtyardRadius + 1) return trees;
  for (let index = 0; index < count; index += 1) {
    const angle = rng() * Math.PI * 2;
    const distance = range(rng, courtyardRadius + 1, maxRadius);
    trees.push({
      id: `${locationId}:tree:${index}`,
      kind: "tree",
      x: center.x + Math.cos(angle) * distance,
      z: center.z + Math.sin(angle) * distance,
      rotationY: rng() * Math.PI * 2,
      color: pick(rng, FOLIAGE_COLORS),
      accentColor: "#6b4a32",
    });
  }
  return trees;
}

const FLOWER_COLORS = ["#e25d68", "#f0c64a", "#a070d6", "#ff9a3d", "#7ec2ff"];
const ROCK_COLOR = "#8d8a82";

/**
 * Scatter Kenney nature props (bushes, grass, flowers, rocks, mushroom) across
 * the plot ring outside the courtyard. Density tuned per spec; nature biomes
 * get extra rocks.
 */
function generateScatter(
  worldId: string,
  locationId: string,
  center: { x: number; z: number },
  courtyardRadius: number,
  plotHalfMin: number,
  palette: { structure: string; accent: string },
  isNatureBiome: boolean
): PropModel[] {
  const rng = rngFor(worldId, locationId, "scatter");
  const out: PropModel[] = [];
  const innerR = courtyardRadius + 0.6;
  const outerR = Math.max(innerR + 0.5, plotHalfMin - 5);
  if (outerR <= innerR) return out;

  const place = (kind: PropModel["kind"], i: number, color: string, accent: string) => {
    const angle = rng() * Math.PI * 2;
    const distance = range(rng, innerR, outerR);
    out.push({
      id: `${locationId}:${kind}:${i}`,
      kind,
      x: center.x + Math.cos(angle) * distance,
      z: center.z + Math.sin(angle) * distance,
      rotationY: rng() * Math.PI * 2,
      color,
      accentColor: accent,
    });
  };

  // Denser ground cover — the plots read as bare otherwise (FPS is headroom).
  const bushCount = 6 + Math.floor(rng() * 5); // 6-10
  for (let i = 0; i < bushCount; i += 1) place("bush", i, shiftColor("#4e8f4a", range(rng, -0.1, 0.15)), palette.accent);

  const grassCount = 7 + Math.floor(rng() * 6); // 7-12
  for (let i = 0; i < grassCount; i += 1) place("grass", i, shiftColor("#6fae5c", range(rng, -0.1, 0.15)), palette.accent);

  const flowerCount = 8 + Math.floor(rng() * 7); // 8-14
  for (let i = 0; i < flowerCount; i += 1) place("flower", i, pick(rng, FLOWER_COLORS), "#3f7e44");

  const rockCount = isNatureBiome ? 3 + Math.floor(rng() * 4) : 2 + Math.floor(rng() * 3); // 2-4 (3-6 nature)
  for (let i = 0; i < rockCount; i += 1) place("rock", i, shiftColor(ROCK_COLOR, range(rng, -0.12, 0.1)), palette.accent);

  if (rng() > 0.35) place("mushroom", 0, "#cc3a3a", "#f7f1d3");

  return out;
}

/**
 * Place 1-2 fence runs along plot edges. Each run is a short line of fence
 * segments rotated to align with its edge.
 */
// @ts-expect-error -- preserved for rollback once gate/road clearance is wired
function generateFences(
  worldId: string,
  locationId: string,
  origin: { x: number; z: number },
  width: number,
  depth: number,
  palette: { structure: string; accent: string }
): PropModel[] {
  const rng = rngFor(worldId, locationId, "fences");
  const runs = 1 + Math.floor(rng() * 2); // 1-2 runs
  const out: PropModel[] = [];
  const inset = SIDEWALK_INSET + 0.4;
  const segLen = 1.6;
  const segCount = 4 + Math.floor(rng() * 4); // 4-7 segments per run
  const usedEdges = new Set<number>();
  for (let r = 0; r < runs; r += 1) {
    let edge = Math.floor(rng() * 4);
    let guard = 0;
    while (usedEdges.has(edge) && guard < 4) {
      edge = (edge + 1) % 4;
      guard += 1;
    }
    usedEdges.add(edge);
    const horizontal = edge === 0 || edge === 2;
    const fixed =
      edge === 0
        ? origin.z + inset
        : edge === 2
          ? origin.z + depth - inset
          : edge === 1
            ? origin.x + width - inset
            : origin.x + inset;
    const runLength = segLen * segCount;
    const along = horizontal
      ? range(rng, origin.x + inset + 1, origin.x + width - inset - runLength - 1)
      : range(rng, origin.z + inset + 1, origin.z + depth - inset - runLength - 1);
    const rotationY = horizontal ? 0 : Math.PI / 2;
    for (let s = 0; s < segCount; s += 1) {
      const offset = along + s * segLen + segLen / 2;
      out.push({
        id: `${locationId}:fence:${r}:${s}`,
        kind: "fence",
        x: horizontal ? offset : fixed,
        z: horizontal ? fixed : offset,
        rotationY,
        color: shiftColor(palette.structure, -0.1),
        accentColor: palette.accent,
      });
    }
  }
  return out;
}

/**
 * Add a planter at 1-2 building entrances per district (entrance ~ side
 * facing the courtyard).
 */
// @ts-expect-error -- preserved for rollback once door clearance is wired
function generateEntrancePlanters(
  worldId: string,
  locationId: string,
  buildings: BuildingModel[],
  center: { x: number; z: number },
  palette: { structure: string; accent: string }
): PropModel[] {
  if (buildings.length === 0) return [];
  const rng = rngFor(worldId, locationId, "entrancePlanters");
  const count = Math.min(buildings.length, 1 + Math.floor(rng() * 2));
  const out: PropModel[] = [];
  // Pick distinct building indices deterministically.
  const order = buildings.map((_, i) => i).sort((a, b) => {
    const ha = (a + 1) * rng();
    const hb = (b + 1) * rng();
    return ha - hb;
  });
  for (let i = 0; i < count; i += 1) {
    const building = buildings[order[i]!]!;
    const dx = center.x - building.x;
    const dz = center.z - building.z;
    let offsetX = 0;
    let offsetZ = 0;
    if (Math.abs(dx) > Math.abs(dz)) {
      offsetX = Math.sign(dx) * (building.width / 2 + 0.7);
    } else {
      offsetZ = Math.sign(dz) * (building.depth / 2 + 0.7);
    }
    out.push({
      id: `${locationId}:entryPlanter:${i}`,
      kind: "planter",
      x: building.x + offsetX,
      z: building.z + offsetZ,
      rotationY: 0,
      color: shiftColor(palette.structure, -0.18),
      accentColor: palette.accent,
    });
  }
  return out;
}

export function shiftColor(hex: string, amount: number): string {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  const channels = [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff].map((channel) => {
    const next = amount >= 0 ? channel + (255 - channel) * amount : channel * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(next)));
  });
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** Rotate hue (degrees) and scale saturation in HSL — pure, for per-building variety. */
export function hueShift(hex: string, degrees: number, satMul = 1): string {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  const r = ((value >> 16) & 0xff) / 255;
  const g = ((value >> 8) & 0xff) / 255;
  const b = (value & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  h = (h + degrees + 360) % 360;
  s = Math.max(0, Math.min(1, s * satMul));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [rr, gg, bb] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (n: number): string =>
    Math.max(0, Math.min(255, Math.round((n + m) * 255)))
      .toString(16)
      .padStart(2, "0");
  return `#${to(rr)}${to(gg)}${to(bb)}`;
}
