import type { TickSummary, World } from './types.ts';

interface ReplayFrame {
  tick: number;
  checksum: string;
  clock: string;
  applied: number;
  rejected: number;
  directorActions: number;
  changedActors: string[];
  relationshipDeltas: { actorId: string; targetId: string; delta: number }[];
  memoryWrites: { actorId: string; count: number }[];
}

export interface ReplayInspectorReport {
  frames: ReplayFrame[];
  warnings: string[];
  checksumTrail: string[];
}

export function inspectReplay(world: World): ReplayInspectorReport {
  const warnings: string[] = [];
  const frames = (world.eventLog ?? []).map((summary, index, all) =>
    inspectFrame(summary, all[index - 1])
  );
  const checksumTrail = frames.map((frame) => frame.checksum);
  const duplicateChecksums = checksumTrail.filter(
    (checksum, index) => checksumTrail.indexOf(checksum) !== index
  );

  for (const checksum of new Set(duplicateChecksums)) {
    warnings.push(`Checksum ${checksum} repeated; state may be stuck or looped.`);
  }

  const emptyFrames = frames.filter((frame) => frame.applied === 0 && frame.rejected === 0);
  if (emptyFrames.length > 0) {
    warnings.push(`${emptyFrames.length} tick(s) had no applied or rejected actions.`);
  }

  return { frames, warnings, checksumTrail };
}

function inspectFrame(summary: TickSummary, _previous?: TickSummary): ReplayFrame {
  const changedActors = new Set<string>();
  const relationshipDeltas: ReplayFrame['relationshipDeltas'] = [];
  const memoryCounts = new Map<string, number>();

  for (const entry of summary.actions) {
    changedActors.add(entry.action.actorId);
    if ('targetId' in entry.action && typeof entry.action.targetId === 'string')
      changedActors.add(entry.action.targetId);
    if (entry.action.type === 'gossip') changedActors.add(entry.action.aboutId);
    if (entry.action.type === 'talk' || entry.action.type === 'confront') {
      addMemory(memoryCounts, entry.action.actorId);
      addMemory(memoryCounts, entry.action.targetId);
    }
    if (entry.action.type === 'remember') addMemory(memoryCounts, entry.action.actorId);
    if (entry.action.type === 'gossip') {
      relationshipDeltas.push(
        { actorId: entry.action.actorId, targetId: entry.action.aboutId, delta: -1 },
        { actorId: entry.action.targetId, targetId: entry.action.aboutId, delta: -1 }
      );
    }
    if (entry.action.type === 'confront') {
      relationshipDeltas.push(
        { actorId: entry.action.actorId, targetId: entry.action.targetId, delta: -2 },
        { actorId: entry.action.targetId, targetId: entry.action.actorId, delta: -1 }
      );
    }
  }

  for (const entry of summary.rejected) {
    changedActors.add(entry.action.actorId);
  }

  return {
    tick: summary.tick,
    checksum: summary.checksum,
    clock: `Day ${summary.clock.day}, ${summary.clock.hour}:00`,
    applied: summary.actions.length,
    rejected: summary.rejected.length,
    directorActions: summary.actions.filter((entry) => entry.fromDirector).length,
    changedActors: [...changedActors].sort(),
    relationshipDeltas,
    memoryWrites: [...memoryCounts.entries()].map(([actorId, count]) => ({ actorId, count })),
  };
}

function addMemory(counts: Map<string, number>, actorId: string): void {
  counts.set(actorId, (counts.get(actorId) ?? 0) + 1);
}
