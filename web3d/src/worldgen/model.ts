import type { ItemVisual, Palette } from '../mapping/visuals.ts';
// type-only circular reference; erased at compile time
import type { InteriorDoor } from './interiors.ts';

export interface BuildingModel {
  id: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  bodyColor: string;
  roofColor: string;
  accentColor: string;
  floors: number;
  windows: boolean;
}

export type PropKind =
  | 'lamp'
  | 'bench'
  | 'planter'
  | 'crate'
  | 'sign'
  | 'dummy'
  | 'stall'
  | 'tree'
  | 'bush'
  | 'grass'
  | 'flower'
  | 'rock'
  | 'mushroom'
  | 'fence';

export interface PropModel {
  id: string;
  kind: PropKind;
  x: number;
  z: number;
  rotationY: number;
  color: string;
  accentColor: string;
}

export interface ItemPlacement {
  itemId: string;
  name: string;
  x: number;
  z: number;
  visual: ItemVisual;
}

export interface InteractablePlacement {
  propId: string;
  name: string;
  x: number;
  z: number;
  inspected: boolean;
  accentColor: string;
}

export interface NpcSpawn {
  npcId: string;
  x: number;
  z: number;
  heading: number;
}

export interface DistrictModel {
  locationId: string;
  name: string;
  /** name + visual role + tags — drives role-keyword styling */
  roleText: string;
  palette: Palette;
  /** World-space rect in meters. origin = min corner. */
  origin: { x: number; z: number };
  width: number;
  depth: number;
  courtyard: { x: number; z: number; radius: number };
  buildings: BuildingModel[];
  props: PropModel[];
  items: ItemPlacement[];
  interactables: InteractablePlacement[];
  npcSpawns: NpcSpawn[];
  playerSpawn: { x: number; z: number };
}

export interface StreetModel {
  id: string;
  fromId: string;
  toId: string;
  label?: string;
  /** polyline in world meters, from gate to gate */
  points: Array<{ x: number; z: number }>;
  width: number;
}

export interface GateModel {
  districtId: string;
  x: number;
  z: number;
  /** 0 when the gate pierces a north/south edge, PI/2 for east/west */
  rotationY: number;
}

export interface NavNode {
  id: string;
  x: number;
  z: number;
  /** district this node belongs to, if any (courtyards and gates) */
  districtId?: string;
}

export interface NavGraph {
  nodes: NavNode[];
  /** adjacency: node id -> neighbor node ids */
  edges: Record<string, string[]>;
  /** district id -> courtyard node id */
  courtyardNode: Record<string, string>;
}

export interface WorldModel {
  worldId: string;
  districts: DistrictModel[];
  streets: StreetModel[];
  gates: GateModel[];
  nav: NavGraph;
  doors: InteriorDoor[];
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
}

export const WORLD_SCALE = 0.25;
export const FLOOR_HEIGHT = 3;
export const SIDEWALK_INSET = 3;
