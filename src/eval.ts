import { readFileSync } from "node:fs";

import { createLlmProposer, type ProposeFn } from "./llm/proposer.ts";
import { isLlmEnabled, proposeAction } from "./llm/router.ts";
import { createEngine } from "./simulation.ts";
import type { ActionType, ProposeResult, Tier, World } from "./types.ts";

interface EvalCall {
  tier: Tier;
  model: string | null;
  latencyMs: number;
  jsonOk: boolean;
  error: string | null;
  actionType: ActionType | "skip" | "none";
}

interface EvalSummary {
  world: string;
  model: string | null;
  ticks: number;
  maxNpcs: number;
  calls: number;
  jsonOk: number;
  errors: number;
  skips: number;
  applied: number;
  rejected: number;
  proposedActionTypes: Record<string, number>;
  appliedActionTypes: Record<string, number>;
  rejectedActionTypes: Record<string, number>;
  rejectionReasons: Record<string, number>;
  latencyMs: {
    min: number;
    max: number;
    avg: number;
  };
}

const CWD = `file://${process.cwd()}/`;
const WORLD_PATH = new URL(process.env["WORLD_FILE"] ?? "./worlds/village.json", CWD);
const TICKS = positiveInt(process.env["EVAL_TICKS"], 3);
const MAX_NPCS = positiveInt(process.env["LLM_MAX_NPCS"], 1);
const ROTATE_NPCS = process.env["EVAL_ROTATE_NPCS"] !== "0";

async function main(): Promise<void> {
  if (!isLlmEnabled()) {
    throw new Error("LLM eval requires LLM_BASE_URL and LLM_API_KEY.");
  }

  const world = JSON.parse(readFileSync(WORLD_PATH, "utf8")) as World;
  const calls: EvalCall[] = [];
  const trackedPropose: ProposeFn = async (request) => {
    const result = await proposeAction(request);
    calls.push(callFromResult(request.tier ?? "normal", result));
    return result;
  };
  const engine = createEngine(world, {
    propose: createLlmProposer({ tier: "normal", maxNpcs: MAX_NPCS, propose: trackedPropose }),
  });
  const npcOrder = [...engine.state.npcs];

  const rejectionReasons: Record<string, number> = {};
  const appliedActionTypes: Record<string, number> = {};
  const rejectedActionTypes: Record<string, number> = {};
  let applied = 0;
  let rejected = 0;

  for (let i = 0; i < TICKS; i += 1) {
    if (ROTATE_NPCS) rotateNpcs(engine.state, npcOrder, i);
    const tick = await engine.tick();
    applied += tick.actions.length;
    rejected += tick.rejected.length;

    for (const entry of tick.actions) {
      increment(appliedActionTypes, entry.action.type);
    }
    for (const entry of tick.rejected) {
      increment(rejectedActionTypes, entry.action.type);
      increment(rejectionReasons, entry.reason);
    }
  }

  const proposedActionTypes: Record<string, number> = {};
  for (const call of calls) {
    increment(proposedActionTypes, call.actionType);
  }

  const summary = summarize(world, calls, applied, rejected, proposedActionTypes, appliedActionTypes, rejectedActionTypes, rejectionReasons);
  console.info(JSON.stringify(summary, null, 2));
}

function callFromResult(tier: Tier, result: ProposeResult): EvalCall {
  const meta = "meta" in result ? result.meta : undefined;
  const actionType = "action" in result && result.action ? result.action.type : "none";
  return {
    tier,
    model: meta?.model ?? null,
    latencyMs: meta?.latencyMs ?? 0,
    jsonOk: meta?.jsonOk ?? false,
    error: "error" in result ? result.error : null,
    actionType,
  };
}

function summarize(
  world: World,
  calls: EvalCall[],
  applied: number,
  rejected: number,
  proposedActionTypes: Record<string, number>,
  appliedActionTypes: Record<string, number>,
  rejectedActionTypes: Record<string, number>,
  rejectionReasons: Record<string, number>
): EvalSummary {
  const latencies = calls.map((call) => call.latencyMs).filter((latency) => latency > 0);
  const latencyTotal = latencies.reduce((sum, latency) => sum + latency, 0);
  return {
    world: world.id,
    model: calls.find((call) => call.model)?.model ?? process.env["LLM_MODEL_NORMAL"] ?? null,
    ticks: TICKS,
    maxNpcs: MAX_NPCS,
    calls: calls.length,
    jsonOk: calls.filter((call) => call.jsonOk).length,
    errors: calls.filter((call) => call.error).length,
    skips: calls.filter((call) => call.actionType === "skip").length,
    applied,
    rejected,
    proposedActionTypes,
    appliedActionTypes,
    rejectedActionTypes,
    rejectionReasons,
    latencyMs: {
      min: latencies.length ? Math.min(...latencies) : 0,
      max: latencies.length ? Math.max(...latencies) : 0,
      avg: latencies.length ? Math.round(latencyTotal / latencies.length) : 0,
    },
  };
}

function increment(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

function rotateNpcs(world: World, npcOrder: World["npcs"], offset: number): void {
  if (npcOrder.length === 0) return;
  const shift = offset % npcOrder.length;
  world.npcs = [...npcOrder.slice(shift), ...npcOrder.slice(0, shift)];
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
