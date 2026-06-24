import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AgentLoopCheckpoint } from './agent-loop.ts';

interface CheckpointStoreFile {
  version: 1;
  checkpoints: AgentLoopCheckpoint[];
}

export function readAgentLoopCheckpoints(path: URL): AgentLoopCheckpoint[] {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<CheckpointStoreFile>;
    if (parsed.version !== 1 || !Array.isArray(parsed.checkpoints)) return [];
    return parsed.checkpoints.filter(isCheckpoint).map(cloneCheckpoint);
  } catch {
    return [];
  }
}

export function writeAgentLoopCheckpoints(path: URL, checkpoints: AgentLoopCheckpoint[]): void {
  mkdirSync(dirname(fileURLToPath(path)), { recursive: true });
  const payload: CheckpointStoreFile = {
    version: 1,
    checkpoints: checkpoints.filter(isCheckpoint).map(cloneCheckpoint),
  };
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export function upsertAgentLoopCheckpoint(
  path: URL,
  checkpoint: AgentLoopCheckpoint,
  maxCheckpoints: number
): void {
  const existing = readAgentLoopCheckpoints(path).filter(
    (candidate) => candidate.tick !== checkpoint.tick
  );
  existing.push(cloneCheckpoint(checkpoint));
  writeAgentLoopCheckpoints(path, existing.slice(-Math.max(1, maxCheckpoints)));
}

function isCheckpoint(value: unknown): value is AgentLoopCheckpoint {
  if (!value || typeof value !== 'object') return false;
  const checkpoint = value as Partial<AgentLoopCheckpoint>;
  return (
    typeof checkpoint.tick === 'number' &&
    typeof checkpoint.capturedAt === 'string' &&
    Boolean(
      checkpoint.world &&
        typeof checkpoint.world === 'object' &&
        typeof checkpoint.world.id === 'string'
    )
  );
}

function cloneCheckpoint(checkpoint: AgentLoopCheckpoint): AgentLoopCheckpoint {
  return JSON.parse(JSON.stringify(checkpoint)) as AgentLoopCheckpoint;
}
