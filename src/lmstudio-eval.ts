import { spawnSync } from "node:child_process";
import { homedir } from "node:os";

interface LmsModel {
  type?: string;
  modelKey?: string;
  path?: string;
  id?: string;
  object?: string;
}

interface OpenAiModels {
  data?: Array<{ id: string; object?: string }>;
}

const PORT = Number(process.env["LMSTUDIO_PORT"] ?? 1234);
const HOST = process.env["LMSTUDIO_HOST"] ?? "127.0.0.1";
const BASE_URL = `http://${HOST}:${PORT}/v1`;
const DEFAULT_MODEL = "qwen/qwen3-30b-a3b";
const PATH = `${homedir()}/.lmstudio/bin:${process.env["PATH"] ?? ""}`;
const KEEP_SERVER = process.env["LMSTUDIO_KEEP_SERVER"] === "1";
const KEEP_MODEL = process.env["LMSTUDIO_KEEP_MODEL"] === "1";

async function main(): Promise<void> {
  const serverWasRunning = isServerRunning();
  if (!serverWasRunning) run("lms", ["server", "start", "--port", String(PORT), "--bind", HOST]);

  try {
    await waitForServer();
    const model = await resolveModel();
    await ensureModelServable(model);

    const result = run("pnpm", ["eval:llm"], {
      LLM_BASE_URL: BASE_URL,
      LLM_API_KEY: process.env["LLM_API_KEY"] || "lm-studio",
      LLM_MODEL_NORMAL: model,
      LLM_MODEL_QUEST: process.env["LLM_MODEL_QUEST"] || model,
      LLM_TIMEOUT_MS: process.env["LLM_TIMEOUT_MS"] || "180000",
      LLM_RESPONSE_FORMAT: process.env["LLM_RESPONSE_FORMAT"] || "0",
      LLM_NO_THINK: process.env["LLM_NO_THINK"] || "1",
      LLM_TEMPERATURE: process.env["LLM_TEMPERATURE"] || "0.2",
      LLM_MAX_NPCS: process.env["LLM_MAX_NPCS"] || "1",
      EVAL_TICKS: process.env["EVAL_TICKS"] || "3",
    }, false);
    process.exitCode = result.status ?? 1;
  } finally {
    if (!KEEP_MODEL) run("lms", ["unload", "--all"], undefined, true);
    if (!KEEP_SERVER && !serverWasRunning) run("lms", ["server", "stop"], undefined, true);
  }
}

async function resolveModel(): Promise<string> {
  if (process.env["LLM_MODEL_NORMAL"]) return process.env["LLM_MODEL_NORMAL"];

  const openAiModels = await listOpenAiModels().catch(() => []);
  const openAiCandidate = openAiModels.find((model) => isPreferredModel(model.id)) ?? openAiModels.find((model) => !/embed/i.test(model.id));
  if (openAiCandidate) return openAiCandidate.id;

  const lmsModels = listLmsModels();
  const lmsCandidate =
    lmsModels.find((model) => model.type === "llm" && isPreferredModel(model.modelKey ?? model.path ?? "")) ??
    lmsModels.find((model) => model.type === "llm");
  if (lmsCandidate?.modelKey) return lmsCandidate.modelKey;
  if (lmsCandidate?.path) return lmsCandidate.path;

  return DEFAULT_MODEL;
}

async function ensureModelServable(model: string): Promise<void> {
  const models = await listOpenAiModels().catch(() => []);
  if (models.some((candidate) => candidate.id === model)) return;
  run("lms", ["load", model, "--identifier", model, "--ttl", process.env["LMSTUDIO_TTL_SECONDS"] ?? "300", "--yes"]);
  await waitForModel(model);
}

async function listOpenAiModels(): Promise<Array<{ id: string }>> {
  const response = await fetch(`${BASE_URL}/models`);
  if (!response.ok) throw new Error(`LM Studio /v1/models returned HTTP ${response.status}`);
  const data = (await response.json()) as OpenAiModels;
  return data.data?.map((model) => ({ id: model.id })) ?? [];
}

function listLmsModels(): LmsModel[] {
  const result = run("lms", ["ls", "--json"], undefined, false);
  if (result.status !== 0 || !result.stdout) return [];
  try {
    return JSON.parse(result.stdout.toString()) as LmsModel[];
  } catch {
    return [];
  }
}

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if ((await listOpenAiModels().then(() => true).catch(() => false))) return;
    await sleep(500);
  }
  throw new Error(`LM Studio server did not start at ${BASE_URL}`);
}

async function waitForModel(model: string): Promise<void> {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const models = await listOpenAiModels().catch(() => []);
    if (models.some((candidate) => candidate.id === model)) return;
    await sleep(1000);
  }
  throw new Error(`LM Studio did not expose model ${model}`);
}

function isServerRunning(): boolean {
  return run("lms", ["server", "status"], undefined, true).stdout?.toString().includes("running") ?? false;
}

function run(command: string, args: string[], env?: Record<string, string>, quiet = false) {
  const result = spawnSync(command, args, {
    env: { ...process.env, PATH, ...(env ?? {}) },
    encoding: "utf8",
    stdio: quiet ? "pipe" : "inherit",
  });
  if (!quiet && result.error) throw result.error;
  return result;
}

function isPreferredModel(id: string): boolean {
  return /qwen3.*30b.*a3b/i.test(id) || /qwen3.*35b.*a3b/i.test(id);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
