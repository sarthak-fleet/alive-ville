import type { World } from "../../../src/types.ts";
import type { BuildingModel, DistrictModel, WorldModel } from "./model.ts";
import { pick, range, rngFor } from "./rng.ts";

export type FurnitureKind =
  | "bed"
  | "table"
  | "chair"
  | "counter"
  | "shelf"
  | "rug"
  | "hearth"
  | "anvil"
  | "barrel"
  | "crate"
  | "plant";

export interface FurnitureModel {
  id: string;
  kind: FurnitureKind;
  x: number;
  z: number;
  rotationY: number;
  color: string;
  accentColor: string;
}

export interface InteriorDoor {
  districtId: string;
  /** world-space position of the exterior door (interaction point) */
  x: number;
  z: number;
  /** label, e.g. "the Lantern Inn" */
  label: string;
  /** facing the courtyard: player exits toward this point */
  outsideX: number;
  outsideZ: number;
}

export interface InteriorModel {
  districtId: string;
  label: string;
  /** world-space rect of the room (placed far from the city) */
  origin: { x: number; z: number };
  width: number;
  depth: number;
  wallHeight: number;
  floorColor: string;
  wallColor: string;
  accentColor: string;
  /** player spawn just inside the exit door */
  spawn: { x: number; z: number };
  /** interior exit-door interaction point */
  exit: { x: number; z: number };
  furniture: FurnitureModel[];
}

const ROOM_WIDTH = 15;
const ROOM_DEPTH = 12;
const WALL_HEIGHT = 3.2;
const ROOM_SPACING = 40;
const ROOM_MARGIN_FROM_CITY = 120;

interface FurniturePlan {
  kinds: FurnitureKind[];
  extra: FurnitureKind[];
}

const ROLE_FURNITURE: Array<{ pattern: RegExp; plan: FurniturePlan }> = [
  { pattern: /inn|kiosk|counter|report|station|market/i, plan: { kinds: ["counter", "table", "chair", "chair", "hearth", "shelf", "rug"], extra: ["barrel", "plant", "table"] } },
  { pattern: /forge|training|engine|industrial|concrete/i, plan: { kinds: ["anvil", "hearth", "table", "crate", "crate", "barrel"], extra: ["crate", "shelf"] } },
  { pattern: /garden|home|apartment|wood|balcony/i, plan: { kinds: ["bed", "table", "chair", "rug", "shelf", "plant"], extra: ["plant", "chair"] } },
  { pattern: /bridge|overpass|ruin|threat|alley|monster/i, plan: { kinds: ["crate", "crate", "barrel", "table"], extra: ["crate"] } },
];

const DEFAULT_PLAN: FurniturePlan = { kinds: ["table", "chair", "shelf", "rug", "plant"], extra: ["chair", "crate"] };

function planFor(district: DistrictModel): FurniturePlan {
  const text = `${district.name}`;
  return ROLE_FURNITURE.find((entry) => entry.pattern.test(text))?.plan ?? DEFAULT_PLAN;
}

export function anchorBuilding(district: DistrictModel): BuildingModel | null {
  let best: BuildingModel | null = null;
  for (const building of district.buildings) {
    if (!best || building.width * building.depth > best.width * best.depth) best = building;
  }
  return best;
}

export function interiorDoorFor(district: DistrictModel): InteriorDoor | null {
  const building = anchorBuilding(district);
  if (!building) return null;
  const dx = district.courtyard.x - building.x;
  const dz = district.courtyard.z - building.z;
  let x = building.x;
  let z = building.z;
  let outsideX = x;
  let outsideZ = z;
  if (Math.abs(dx) > Math.abs(dz)) {
    x += (Math.sign(dx) * building.width) / 2;
    outsideX = x + Math.sign(dx) * 1.4;
    outsideZ = z;
  } else {
    z += (Math.sign(dz) * building.depth) / 2;
    outsideZ = z + Math.sign(dz) * 1.4;
    outsideX = x;
  }
  return { districtId: district.locationId, x, z, label: `the ${district.name}`, outsideX, outsideZ };
}

export function generateInteriors(world: World, model: WorldModel): { interiors: InteriorModel[]; doors: InteriorDoor[] } {
  const interiors: InteriorModel[] = [];
  const doors: InteriorDoor[] = [];
  model.districts.forEach((district, index) => {
    const door = interiorDoorFor(district);
    if (!door) return;
    doors.push(door);

    const rng = rngFor(world.id, district.locationId, "interior");
    const origin = {
      x: model.bounds.minX + index * ROOM_SPACING,
      z: model.bounds.maxZ + ROOM_MARGIN_FROM_CITY,
    };
    const exit = { x: origin.x + ROOM_WIDTH / 2, z: origin.z + ROOM_DEPTH - 0.6 };
    const spawn = { x: exit.x, z: exit.z - 1.6 };
    const plan = planFor(district);

    const furniture: FurnitureModel[] = [];
    const slots = shuffledSlots(rng, origin);
    const kinds = [...plan.kinds];
    if (rng() > 0.5) kinds.push(pick(rng, plan.extra));
    kinds.forEach((kind, kindIndex) => {
      const slot = slots[kindIndex];
      if (!slot) return;
      furniture.push({
        id: `${district.locationId}:furniture:${kindIndex}`,
        kind,
        x: slot.x,
        z: slot.z,
        rotationY: slot.rotationY + range(rng, -0.15, 0.15),
        color: district.palette.structure,
        accentColor: district.palette.accent,
      });
    });

    interiors.push({
      districtId: district.locationId,
      label: `the ${district.name}`,
      origin,
      width: ROOM_WIDTH,
      depth: ROOM_DEPTH,
      wallHeight: WALL_HEIGHT,
      floorColor: shiftHex(district.palette.ground, 0.32),
      wallColor: shiftHex(district.palette.structure, 0.18),
      accentColor: district.palette.accent,
      spawn,
      exit,
      furniture,
    });
  });
  return { interiors, doors };
}

/** Fixed perimeter/feature slots keep furniture off the spawn lane and inside walls. */
function shuffledSlots(rng: () => number, origin: { x: number; z: number }): Array<{ x: number; z: number; rotationY: number }> {
  const slots = [
    { x: origin.x + 2.2, z: origin.z + 2.2, rotationY: Math.PI / 4 },
    { x: origin.x + ROOM_WIDTH - 2.2, z: origin.z + 2.2, rotationY: -Math.PI / 4 },
    { x: origin.x + 2, z: origin.z + ROOM_DEPTH / 2, rotationY: Math.PI / 2 },
    { x: origin.x + ROOM_WIDTH - 2, z: origin.z + ROOM_DEPTH / 2, rotationY: -Math.PI / 2 },
    { x: origin.x + ROOM_WIDTH / 2, z: origin.z + 1.8, rotationY: 0 },
    { x: origin.x + ROOM_WIDTH / 2 - 3.4, z: origin.z + ROOM_DEPTH / 2 + 1, rotationY: 0.3 },
    { x: origin.x + ROOM_WIDTH / 2 + 3.4, z: origin.z + ROOM_DEPTH / 2 + 1, rotationY: -0.3 },
    { x: origin.x + 2.4, z: origin.z + ROOM_DEPTH - 2.6, rotationY: Math.PI * 0.75 },
    { x: origin.x + ROOM_WIDTH - 2.4, z: origin.z + ROOM_DEPTH - 2.6, rotationY: -Math.PI * 0.75 },
  ];
  for (let index = slots.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [slots[index], slots[swap]] = [slots[swap]!, slots[index]!];
  }
  return slots;
}

function shiftHex(hex: string, amount: number): string {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  const channels = [16, 8, 0].map((shift) => {
    const channel = (value >> shift) & 0xff;
    const next = amount >= 0 ? channel + (255 - channel) * amount : channel * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(next)));
  });
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}
