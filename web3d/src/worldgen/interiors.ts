import type { World } from '../../../src/types.ts';
import type { BuildingModel, DistrictModel, WorldModel } from './model.ts';
import { pick, range, rngFor } from './rng.ts';

export type FurnitureKind =
  | 'bed'
  | 'table'
  | 'chair'
  | 'counter'
  | 'shelf'
  | 'rug'
  | 'hearth'
  | 'anvil'
  | 'barrel'
  | 'crate'
  | 'plant';

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
  /** building this door belongs to */
  buildingId: string;
  districtId: string;
  /** world-space position of the exterior door (interaction point) */
  x: number;
  z: number;
  label: string;
  /** player exits toward this point (just outside the door) */
  outsideX: number;
  outsideZ: number;
}

type RoomRole = 'tavern' | 'forge' | 'home' | 'abandoned' | 'default';

interface RoomPreset {
  role: RoomRole;
  ceilingHeight: number;
  wallTexture: 'plaster' | 'wood' | 'brick' | 'broken';
  floorTexture: 'plank' | 'stone' | 'tile';
  ambientIntensity: number;
  hearthBoost: number;
  wallDressing: 'standard' | 'many-frames' | 'banners' | 'boarded';
}

export interface InteriorModel {
  buildingId: string;
  districtId: string;
  label: string;
  origin: { x: number; z: number };
  width: number;
  depth: number;
  wallHeight: number;
  floorColor: string;
  wallColor: string;
  accentColor: string;
  spawn: { x: number; z: number };
  exit: { x: number; z: number };
  furniture: FurnitureModel[];
  preset: RoomPreset;
  /** npc id that inhabits this room, null if empty */
  inhabitantId: string | null;
  /** world-space anchor for the inhabitant, tied to the role-relevant furniture */
  inhabitantAnchor: { x: number; z: number; rotationY: number } | null;
}

const ROOM_MARGIN_FROM_CITY = 120;

interface FurniturePlan {
  kinds: FurnitureKind[];
  extra: FurnitureKind[];
  wallTint: string;
  names: string[];
  role: RoomRole;
}

const ROLE_FURNITURE: Array<{ pattern: RegExp; plan: FurniturePlan }> = [
  {
    pattern: /inn|kiosk|counter|report|station|market/i,
    plan: {
      kinds: ['counter', 'table', 'chair', 'chair', 'hearth', 'shelf', 'rug', 'table', 'barrel'],
      extra: ['barrel', 'plant', 'chair'],
      wallTint: '#8a6a4a',
      names: ['Common Hall', 'Tavern Rooms', 'Guest House', 'Trading Post', 'Counter Room'],
      role: 'tavern',
    },
  },
  {
    pattern: /forge|training|engine|industrial|concrete/i,
    plan: {
      kinds: ['anvil', 'hearth', 'table', 'crate', 'crate', 'barrel', 'shelf'],
      extra: ['crate', 'barrel'],
      wallTint: '#4a4440',
      names: ['Workshop', 'Tool Shed', 'Smelting Room', 'Storage Bay', 'Machine Shop'],
      role: 'forge',
    },
  },
  {
    pattern: /garden|home|apartment|wood|balcony/i,
    plan: {
      kinds: ['bed', 'table', 'chair', 'rug', 'shelf', 'plant'],
      extra: ['plant', 'chair'],
      wallTint: '#9a8468',
      names: ['Cottage', 'Apartment', 'Family Home', 'Garden House', 'Loft'],
      role: 'home',
    },
  },
  {
    pattern: /bridge|overpass|ruin|threat|alley|monster/i,
    plan: {
      kinds: ['crate', 'crate', 'barrel', 'table'],
      extra: ['crate'],
      wallTint: '#52565e',
      names: ['Abandoned Room', 'Squatter Den', 'Storage Ruin', 'Boarded House'],
      role: 'abandoned',
    },
  },
];

const DEFAULT_PLAN: FurniturePlan = {
  kinds: ['table', 'chair', 'shelf', 'rug', 'plant'],
  extra: ['chair', 'crate'],
  wallTint: '#7a7468',
  names: ['House', 'Office', 'Workroom', 'Quarters', 'Den'],
  role: 'default',
};

function planFor(district: DistrictModel): FurniturePlan {
  return (
    ROLE_FURNITURE.find((entry) => entry.pattern.test(district.roleText))?.plan ?? DEFAULT_PLAN
  );
}

/** Per-role visual preset. The preset drives ceiling height, textures, lighting, and wall dressing. */
function roomVisualFor(role: RoomRole): RoomPreset {
  switch (role) {
    case 'forge':
      return {
        role,
        ceilingHeight: 3.6,
        wallTexture: 'brick',
        floorTexture: 'stone',
        ambientIntensity: 18,
        hearthBoost: 2.4,
        wallDressing: 'standard',
      };
    case 'tavern':
      return {
        role,
        ceilingHeight: 4.2,
        wallTexture: 'wood',
        floorTexture: 'plank',
        ambientIntensity: 40,
        hearthBoost: 1.0,
        wallDressing: 'banners',
      };
    case 'home':
      return {
        role,
        ceilingHeight: 3.8,
        wallTexture: 'plaster',
        floorTexture: 'tile',
        ambientIntensity: 32,
        hearthBoost: 1.2,
        wallDressing: 'many-frames',
      };
    case 'abandoned':
      return {
        role,
        ceilingHeight: 3.8,
        wallTexture: 'broken',
        floorTexture: 'stone',
        ambientIntensity: 7,
        hearthBoost: 0,
        wallDressing: 'boarded',
      };
    default:
      return {
        role,
        ceilingHeight: 4.0,
        wallTexture: 'plaster',
        floorTexture: 'plank',
        ambientIntensity: 38,
        hearthBoost: 1.0,
        wallDressing: 'standard',
      };
  }
}

/** Regex patterns mapping npc role/description text to a RoomRole for inhabitant matching. */
const NPC_ROLE_PATTERNS: Array<{ pattern: RegExp; role: RoomRole }> = [
  { pattern: /merchant|shop|keeper|vendor|clerk|innkeep|trader|bartend|counter/i, role: 'tavern' },
  { pattern: /forge|smith|blacksmith|craft|engineer|mechanic|tinker/i, role: 'forge' },
  { pattern: /elder|parent|mother|father|farmer|gardener|child|family|home/i, role: 'home' },
];

function npcRoleFor(npc: { role?: string; description?: string }): RoomRole | null {
  const text = `${npc.role ?? ''} ${npc.description ?? ''}`;
  for (const { pattern, role } of NPC_ROLE_PATTERNS) {
    if (pattern.test(text)) return role;
  }
  return null;
}

/** Choose one inhabitant NPC for a building, deterministically. Returns null if no suitable NPC exists. */
function inhabitantFor(
  world: World,
  district: DistrictModel,
  building: BuildingModel,
  planRole: RoomRole
): string | null {
  if (planRole === 'abandoned') return null;
  const candidates = world.npcs.filter((npc) => {
    if (npc.id === world.player.characterId) return false;
    if (npc.locationId !== district.locationId) return false;
    if (npc.combat?.defeated) return false;
    const npcRole = npcRoleFor(npc);
    // role matches, or for default/home we accept any non-combat NPC
    if (planRole === 'default' || planRole === 'home')
      return npcRole !== 'forge' && npcRole !== 'tavern';
    return npcRole === planRole;
  });
  if (candidates.length === 0) return null;
  const buildingIndex = district.buildings.findIndex((b) => b.id === building.id);
  return candidates[buildingIndex % candidates.length]!.id;
}

/** World-space anchor for the inhabitant, positioned near the role-relevant furniture piece. */
function anchorFor(
  furniture: FurnitureModel[],
  role: RoomRole,
  origin: { x: number; z: number },
  width: number,
  depth: number
): { x: number; z: number; rotationY: number } {
  const priorityKinds: FurnitureKind[] =
    role === 'forge'
      ? ['anvil', 'hearth']
      : role === 'tavern'
        ? ['counter', 'shelf']
        : role === 'home'
          ? ['bed', 'hearth']
          : ['table', 'shelf'];

  for (const kind of priorityKinds) {
    const piece = furniture.find((f) => f.kind === kind);
    if (piece) {
      // stand slightly in front of the furniture, facing inward
      return { x: piece.x, z: piece.z + 0.9, rotationY: Math.PI };
    }
  }
  // fallback: center of the room
  return { x: origin.x + width / 2, z: origin.z + depth / 2, rotationY: 0 };
}

function doorFaceFor(
  district: DistrictModel,
  building: BuildingModel
): { x: number; z: number; outsideX: number; outsideZ: number } {
  const dx = district.courtyard.x - building.x;
  const dz = district.courtyard.z - building.z;
  if (Math.abs(dx) > Math.abs(dz)) {
    const x = building.x + (Math.sign(dx) * building.width) / 2;
    return { x, z: building.z, outsideX: x + Math.sign(dx) * 1.4, outsideZ: building.z };
  }
  const z = building.z + (Math.sign(dz) * building.depth) / 2;
  return { x: building.x, z, outsideX: building.x, outsideZ: z + Math.sign(dz) * 1.4 };
}

/** Every building in every district is enterable. */
export function generateDoors(model: Pick<WorldModel, 'districts'>): InteriorDoor[] {
  const doors: InteriorDoor[] = [];
  for (const district of model.districts) {
    const plan = planFor(district);
    district.buildings.forEach((building, index) => {
      const face = doorFaceFor(district, building);
      const name = plan.names[index % plan.names.length]!;
      const suffix =
        index >= plan.names.length ? ` ${Math.floor(index / plan.names.length) + 1}` : '';
      doors.push({
        buildingId: building.id,
        districtId: district.locationId,
        label: `the ${name}${suffix}`,
        ...face,
      });
    });
  }
  return doors;
}

const interiorCache = new Map<string, InteriorModel>();

/**
 * On-demand interior generation: only the active room is ever mounted, so the
 * whole city can be enterable without paying for hundreds of live rooms. The
 * room is deterministic per building and always materializes at the same
 * staging spot south of the city.
 */
export function interiorForBuilding(
  world: World,
  model: WorldModel,
  buildingId: string
): InteriorModel | null {
  const cacheKey = `${world.id}:${buildingId}`;
  const cached = interiorCache.get(cacheKey);
  if (cached) return cached;

  const district = model.districts.find((entry) =>
    entry.buildings.some((building) => building.id === buildingId)
  );
  const building = district?.buildings.find((entry) => entry.id === buildingId);
  const door = model.doors.find((entry) => entry.buildingId === buildingId);
  if (!district || !building || !door) return null;

  const plan = planFor(district);
  const preset = roomVisualFor(plan.role);
  const rng = rngFor(world.id, buildingId, 'interior');

  // room scales with the building footprint — generous so it doesn't feel like
  // a closet once you're inside with furniture + an inhabitant
  const width = clamp(building.width * 2.0, 14, 28);
  const depth = clamp(building.depth * 2.1, 13, 22);
  const origin = { x: model.bounds.minX, z: model.bounds.maxZ + ROOM_MARGIN_FROM_CITY };
  const exit = { x: origin.x + width / 2, z: origin.z + depth - 0.6 };
  const spawn = { x: exit.x, z: exit.z - 1.6 };

  const furniture: FurnitureModel[] = [];
  const slots = shuffledSlots(rng, origin, width, depth);
  const kindCount = Math.max(3, Math.round((width * depth) / 22));
  const kinds = [...plan.kinds].slice(0, kindCount);
  if (rng() > 0.5) kinds.push(pick(rng, plan.extra));
  kinds.forEach((kind, kindIndex) => {
    const slot = slots[kindIndex];
    if (!slot) return;
    furniture.push({
      id: `${buildingId}:furniture:${kindIndex}`,
      kind,
      x: slot.x,
      z: slot.z,
      rotationY: slot.rotationY + range(rng, -0.15, 0.15),
      color: district.palette.structure,
      accentColor: district.palette.accent,
    });
  });

  const inhabitantId = inhabitantFor(world, district, building, plan.role);
  const inhabitantAnchor = inhabitantId
    ? anchorFor(furniture, plan.role, origin, width, depth)
    : null;

  const interior: InteriorModel = {
    buildingId,
    districtId: district.locationId,
    label: door.label,
    origin,
    width,
    depth,
    wallHeight: preset.ceilingHeight,
    floorColor: shiftHex(district.palette.ground, 0.32),
    wallColor: blendHex(shiftHex(district.palette.structure, 0.18), plan.wallTint, 0.45),
    accentColor: district.palette.accent,
    spawn,
    exit,
    furniture,
    preset,
    inhabitantId,
    inhabitantAnchor,
  };
  interiorCache.set(cacheKey, interior);
  if (interiorCache.size > 24) {
    const oldest = interiorCache.keys().next().value;
    if (oldest) interiorCache.delete(oldest);
  }
  return interior;
}

function shuffledSlots(
  rng: () => number,
  origin: { x: number; z: number },
  width: number,
  depth: number
): Array<{ x: number; z: number; rotationY: number }> {
  const slots = [
    { x: origin.x + 2.2, z: origin.z + 2.2, rotationY: Math.PI / 4 },
    { x: origin.x + width - 2.2, z: origin.z + 2.2, rotationY: -Math.PI / 4 },
    { x: origin.x + 2, z: origin.z + depth / 2, rotationY: Math.PI / 2 },
    { x: origin.x + width - 2, z: origin.z + depth / 2, rotationY: -Math.PI / 2 },
    { x: origin.x + width / 2, z: origin.z + 1.8, rotationY: 0 },
    { x: origin.x + width / 2 - width * 0.22, z: origin.z + depth / 2 + 1, rotationY: 0.3 },
    { x: origin.x + width / 2 + width * 0.22, z: origin.z + depth / 2 + 1, rotationY: -0.3 },
    { x: origin.x + 2.4, z: origin.z + depth - 2.6, rotationY: Math.PI * 0.75 },
    { x: origin.x + width - 2.4, z: origin.z + depth - 2.6, rotationY: -Math.PI * 0.75 },
    ...(width >= 16
      ? [
          { x: origin.x + width * 0.3, z: origin.z + depth * 0.62, rotationY: 0.6 },
          { x: origin.x + width * 0.7, z: origin.z + depth * 0.62, rotationY: -0.6 },
        ]
      : []),
  ];
  for (let index = slots.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [slots[index], slots[swap]] = [slots[swap]!, slots[index]!];
  }
  return slots;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function shiftHex(hex: string, amount: number): string {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  const channels = [16, 8, 0].map((shift) => {
    const channel = (value >> shift) & 0xff;
    const next = amount >= 0 ? channel + (255 - channel) * amount : channel * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(next)));
  });
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function blendHex(from: string, to: string, t: number): string {
  const a = Number.parseInt(from.replace('#', ''), 16);
  const b = Number.parseInt(to.replace('#', ''), 16);
  const channels = [16, 8, 0].map((shift) => {
    const ca = (a >> shift) & 0xff;
    const cb = (b >> shift) & 0xff;
    return Math.round(ca + (cb - ca) * t);
  });
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}
