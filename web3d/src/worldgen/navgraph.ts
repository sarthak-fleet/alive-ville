import type { DistrictModel, NavGraph, NavNode, StreetModel } from './model.ts';

/**
 * Waypoint graph over courtyards, gates, and street polylines. Small and exact:
 * NPCs travel courtyard -> gate -> street -> gate -> courtyard. (Approved
 * fallback to a recast navmesh; the belt layout keeps these paths clear.)
 */
export function buildNavGraph(districts: DistrictModel[], streets: StreetModel[]): NavGraph {
  const nodes: NavNode[] = [];
  const edges: Record<string, string[]> = {};
  const courtyardNode: Record<string, string> = {};

  const addNode = (node: NavNode): string => {
    const existing = nodes.find((entry) => Math.hypot(entry.x - node.x, entry.z - node.z) < 0.5);
    if (existing) return existing.id;
    nodes.push(node);
    edges[node.id] = [];
    return node.id;
  };

  const connect = (a: string, b: string): void => {
    if (a === b) return;
    if (!edges[a]!.includes(b)) edges[a]!.push(b);
    if (!edges[b]!.includes(a)) edges[b]!.push(a);
  };

  for (const district of districts) {
    const id = addNode({
      id: `courtyard:${district.locationId}`,
      x: district.courtyard.x,
      z: district.courtyard.z,
      districtId: district.locationId,
    });
    courtyardNode[district.locationId] = id;
  }

  for (const street of streets) {
    let previous: string | null = null;
    for (let index = 0; index < street.points.length; index += 1) {
      const point = street.points[index]!;
      const isGate = index === 0 || index === street.points.length - 1;
      const districtId = isGate ? (index === 0 ? street.fromId : street.toId) : undefined;
      const nodeId = addNode({
        id: `street:${street.id}:${index}`,
        x: point.x,
        z: point.z,
        districtId,
      });
      if (previous) connect(previous, nodeId);
      if (isGate && districtId && courtyardNode[districtId])
        connect(nodeId, courtyardNode[districtId]!);
      previous = nodeId;
    }
  }

  return { nodes, edges, courtyardNode };
}

/**
 * Dijkstra over the waypoint graph from one district's courtyard to another's.
 * Returns world-space waypoints (courtyard centers included), or null if the
 * districts are not street-connected.
 */
export function findDistrictPath(
  nav: NavGraph,
  fromDistrictId: string,
  toDistrictId: string
): Array<{ x: number; z: number }> | null {
  const startId = nav.courtyardNode[fromDistrictId];
  const goalId = nav.courtyardNode[toDistrictId];
  if (!startId || !goalId) return null;
  if (startId === goalId) return [];

  const byId = new Map(nav.nodes.map((node) => [node.id, node]));
  const distance = new Map<string, number>([[startId, 0]]);
  const previous = new Map<string, string>();
  const visited = new Set<string>();

  while (true) {
    let current: string | null = null;
    let best = Infinity;
    for (const [id, d] of distance) {
      if (!visited.has(id) && (d < best || (d === best && (current === null || id < current)))) {
        best = d;
        current = id;
      }
    }
    if (current === null) return null;
    if (current === goalId) break;
    visited.add(current);
    const node = byId.get(current)!;
    for (const neighborId of nav.edges[current] ?? []) {
      if (visited.has(neighborId)) continue;
      const neighbor = byId.get(neighborId)!;
      const cost = best + Math.hypot(neighbor.x - node.x, neighbor.z - node.z);
      if (cost < (distance.get(neighborId) ?? Infinity)) {
        distance.set(neighborId, cost);
        previous.set(neighborId, current);
      }
    }
  }

  const path: Array<{ x: number; z: number }> = [];
  let cursor: string | undefined = goalId;
  while (cursor) {
    const node = byId.get(cursor)!;
    path.push({ x: node.x, z: node.z });
    cursor = previous.get(cursor);
  }
  path.reverse();
  return path;
}
