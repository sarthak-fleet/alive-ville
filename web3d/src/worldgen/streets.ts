import type { Exit, Location } from '../../../src/types.ts';
import type { GateModel, StreetModel } from './model.ts';
import { WORLD_SCALE } from './model.ts';

const STREET_WIDTH = 5;
const GRID_STEP = 3;
const PLOT_MARGIN = 1.5;

interface Rect {
  id: string;
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface StreetLayout {
  streets: StreetModel[];
  gates: GateModel[];
}

export function generateStreets(
  locations: Location[],
  exits: Exit[],
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number }
): StreetLayout {
  const rects = locations.map(
    (location): Rect => ({
      id: location.id,
      minX: location.x * WORLD_SCALE,
      minZ: location.y * WORLD_SCALE,
      maxX: (location.x + location.w) * WORLD_SCALE,
      maxZ: (location.y + location.h) * WORLD_SCALE,
    })
  );
  const rectById = new Map(rects.map((rect) => [rect.id, rect]));

  const streets: StreetModel[] = [];
  const gates: GateModel[] = [];
  const seenPairs = new Set<string>();
  const seenGates = new Set<string>();

  for (const exit of exits) {
    const pairKey = [exit.from, exit.to].sort().join('--');
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);
    const from = rectById.get(exit.from);
    const to = rectById.get(exit.to);
    if (!from || !to) continue;

    const gateA = gateToward(from, to);
    const gateB = gateToward(to, from);
    const outsideA = stepOutward(from, gateA, PLOT_MARGIN + 0.5);
    const outsideB = stepOutward(to, gateB, PLOT_MARGIN + 0.5);

    const route = routeAvoidingPlots(outsideA, outsideB, rects, bounds);
    const points = simplify([gateA, outsideA, ...route, outsideB, gateB]);
    streets.push({
      id: pairKey,
      fromId: exit.from,
      toId: exit.to,
      label: exit.label,
      points,
      width: STREET_WIDTH,
    });

    for (const gate of [
      {
        districtId: exit.from,
        ...gateA,
        rotationY: gateA.x === from.minX || gateA.x === from.maxX ? Math.PI / 2 : 0,
      },
      {
        districtId: exit.to,
        ...gateB,
        rotationY: gateB.x === to.minX || gateB.x === to.maxX ? Math.PI / 2 : 0,
      },
    ]) {
      const key = `${gate.districtId}:${Math.round(gate.x)}:${Math.round(gate.z)}`;
      if (!seenGates.has(key)) {
        seenGates.add(key);
        gates.push(gate);
      }
    }
  }
  return { streets, gates };
}

/** Gate sits at the midpoint of the plot edge facing the other plot. */
function gateToward(rect: Rect, other: Rect): { x: number; z: number } {
  const cx = (rect.minX + rect.maxX) / 2;
  const cz = (rect.minZ + rect.maxZ) / 2;
  const ox = (other.minX + other.maxX) / 2;
  const oz = (other.minZ + other.maxZ) / 2;
  const dx = ox - cx;
  const dz = oz - cz;
  if (Math.abs(dx) * (rect.maxZ - rect.minZ) > Math.abs(dz) * (rect.maxX - rect.minX)) {
    return { x: dx > 0 ? rect.maxX : rect.minX, z: cz };
  }
  return { x: cx, z: dz > 0 ? rect.maxZ : rect.minZ };
}

function stepOutward(
  rect: Rect,
  gate: { x: number; z: number },
  distance: number
): { x: number; z: number } {
  if (gate.x === rect.minX) return { x: gate.x - distance, z: gate.z };
  if (gate.x === rect.maxX) return { x: gate.x + distance, z: gate.z };
  if (gate.z === rect.minZ) return { x: gate.x, z: gate.z - distance };
  return { x: gate.x, z: gate.z + distance };
}

/**
 * Coarse-grid A* between two points, treating every plot rect (inflated by a
 * margin) as blocked. Keeps streets out of districts so imported worlds with
 * plots between exit pairs still get sensible roads.
 */
function routeAvoidingPlots(
  start: { x: number; z: number },
  goal: { x: number; z: number },
  rects: Rect[],
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number }
): Array<{ x: number; z: number }> {
  const margin = GRID_STEP * 4;
  const minX = bounds.minX - margin;
  const minZ = bounds.minZ - margin;
  const cols = Math.ceil((bounds.maxX + margin - minX) / GRID_STEP) + 1;
  const rows = Math.ceil((bounds.maxZ + margin - minZ) / GRID_STEP) + 1;

  const toCell = (p: { x: number; z: number }) => ({
    col: Math.round((p.x - minX) / GRID_STEP),
    row: Math.round((p.z - minZ) / GRID_STEP),
  });
  const toPoint = (col: number, row: number) => ({
    x: minX + col * GRID_STEP,
    z: minZ + row * GRID_STEP,
  });

  const blocked = (col: number, row: number): boolean => {
    if (col < 0 || row < 0 || col >= cols || row >= rows) return true;
    const p = toPoint(col, row);
    return rects.some(
      (rect) =>
        p.x > rect.minX - PLOT_MARGIN &&
        p.x < rect.maxX + PLOT_MARGIN &&
        p.z > rect.minZ - PLOT_MARGIN &&
        p.z < rect.maxZ + PLOT_MARGIN
    );
  };

  const startCell = toCell(start);
  const goalCell = toCell(goal);
  const key = (col: number, row: number) => row * cols + col;

  // A* (4-connected, deterministic tie-breaking via binary heap on [f, key])
  const open: Array<{ col: number; row: number; g: number; f: number }> = [
    { ...startCell, g: 0, f: heuristic(startCell, goalCell) },
  ];
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>([[key(startCell.col, startCell.row), 0]]);
  const closed = new Set<number>();

  while (open.length > 0) {
    let bestIndex = 0;
    for (let i = 1; i < open.length; i += 1) {
      const a = open[i]!;
      const b = open[bestIndex]!;
      if (a.f < b.f || (a.f === b.f && key(a.col, a.row) < key(b.col, b.row))) bestIndex = i;
    }
    const current = open.splice(bestIndex, 1)[0]!;
    const currentKey = key(current.col, current.row);
    if (closed.has(currentKey)) continue;
    closed.add(currentKey);

    if (current.col === goalCell.col && current.row === goalCell.row) {
      const path: Array<{ x: number; z: number }> = [];
      let cursor: number | undefined = currentKey;
      while (cursor !== undefined) {
        const col = cursor % cols;
        const row = Math.floor(cursor / cols);
        path.push(toPoint(col, row));
        cursor = cameFrom.get(cursor);
      }
      path.reverse();
      return path;
    }

    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const col = current.col + dc;
      const row = current.row + dr;
      const neighborKey = key(col, row);
      if (closed.has(neighborKey)) continue;
      const isGoal = col === goalCell.col && row === goalCell.row;
      if (!isGoal && blocked(col, row)) continue;
      const tentative = current.g + 1;
      if (tentative < (gScore.get(neighborKey) ?? Infinity)) {
        gScore.set(neighborKey, tentative);
        cameFrom.set(neighborKey, currentKey);
        open.push({ col, row, g: tentative, f: tentative + heuristic({ col, row }, goalCell) });
      }
    }
  }
  // unreachable on the grid (heavily overlapping plots): fall back to a straight line
  return [start, goal];
}

function heuristic(a: { col: number; row: number }, b: { col: number; row: number }): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

/** Drop collinear points so street ribbons render as few long quads. */
function simplify(points: Array<{ x: number; z: number }>): Array<{ x: number; z: number }> {
  const result: Array<{ x: number; z: number }> = [];
  for (const point of points) {
    const last = result[result.length - 1];
    if (last && Math.hypot(point.x - last.x, point.z - last.z) < 0.05) continue;
    const prev = result[result.length - 2];
    if (last && prev) {
      const cross = (last.x - prev.x) * (point.z - prev.z) - (last.z - prev.z) * (point.x - prev.x);
      if (Math.abs(cross) < 0.01) result.pop();
    }
    result.push(point);
  }
  return result;
}
