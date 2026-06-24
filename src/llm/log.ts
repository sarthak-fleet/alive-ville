import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DEFAULT_PATH = process.env['LLM_LOG_PATH'] ?? `${process.env['LOG_DIR'] ?? 'logs'}/llm.jsonl`;

export interface LlmLogEntry {
  kind?: string;
  tier?: string;
  model?: string | null;
  latencyMs?: number;
  usage?: unknown;
  error?: string | null;
  jsonOk?: boolean;
  raw?: string;
  actorId?: string;
  reason?: string;
  action?: unknown;
}

export function logLlmCall(entry: LlmLogEntry, path: string = DEFAULT_PATH): void {
  // telemetry must never break gameplay — and there is no filesystem on Workers
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n';
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, line, 'utf8');
  } catch {
    // best-effort log
  }
}
