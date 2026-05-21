import { readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, normalize } from "node:path";

import { readAgentLoopCheckpoints, upsertAgentLoopCheckpoint, writeAgentLoopCheckpoints } from "./agent-checkpoint-store.ts";
import { createAgentLoop } from "./agent-loop.ts";
import { createDirector } from "./director.ts";
import { createLlmProposer } from "./llm/proposer.ts";
import { isLlmEnabled, proposeAction } from "./llm/router.ts";
import { createEngine } from "./simulation.ts";
import type { CutsceneManifestEntry } from "./story-package.ts";
import { storyPackageFromWorld, validateStoryPackage, worldFromStoryPackage } from "./story-package.ts";
import type { PlayerAction, World } from "./types.ts";
import { validateWorldIngestSource, worldSourceToWorld } from "./world-ingest.ts";

const PORT = Number(process.env["PORT"] ?? 5174);
const CWD = `file://${process.cwd()}/`;
const WEB_ROOT = new URL(process.env["WEB_ROOT"] ?? "./web/", CWD);
const WORLD_PATH = new URL(process.env["WORLD_FILE"] ?? "./worlds/village.json", CWD);
const CUTSCENE_MANIFEST_PATH = new URL("./web/assets/cutscenes/manifest.json", CWD);
const LLM_MAX_NPCS = Number(process.env["LLM_MAX_NPCS"] ?? 5);
const AGENT_LOOP_INTERVAL_MS = Number(process.env["AGENT_LOOP_INTERVAL_MS"] ?? 4_000);
const AGENT_LOOP_MAX_TICKS = process.env["AGENT_LOOP_MAX_TICKS"] ? Number(process.env["AGENT_LOOP_MAX_TICKS"]) : null;
const AGENT_LOOP_MAX_CHECKPOINTS = Number(process.env["AGENT_LOOP_MAX_CHECKPOINTS"] ?? 24);
const AGENT_LOOP_CHECKPOINT_PATH = new URL(process.env["AGENT_LOOP_CHECKPOINT_FILE"] ?? "./tmp/agent-loop-checkpoints.json", CWD);
const AGENT_LOOP_AUTOSTART = process.env["AGENT_LOOP_AUTOSTART"] === "1";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".ts": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const world = JSON.parse(readFileSync(WORLD_PATH, "utf8")) as World;
const initialAgentLoopCheckpoints = readAgentLoopCheckpoints(AGENT_LOOP_CHECKPOINT_PATH)
  .filter((checkpoint) => checkpoint.world.id === world.id);
const propose = isLlmEnabled() ? createLlmProposer({ tier: "normal", maxNpcs: LLM_MAX_NPCS }) : undefined;
const director = createDirector({ propose: isLlmEnabled() ? proposeAction : undefined });
const engine = createEngine(world, { propose, director });
const agentLoop = createAgentLoop(engine, {
  intervalMs: AGENT_LOOP_INTERVAL_MS,
  maxTicks: AGENT_LOOP_MAX_TICKS,
  maxCheckpoints: AGENT_LOOP_MAX_CHECKPOINTS,
  initialCheckpoints: initialAgentLoopCheckpoints,
  onCheckpoint: (checkpoint) => upsertAgentLoopCheckpoint(AGENT_LOOP_CHECKPOINT_PATH, checkpoint, AGENT_LOOP_MAX_CHECKPOINTS),
});
if (AGENT_LOOP_AUTOSTART) agentLoop.start();

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  if (url.pathname === "/api/state" && req.method === "GET") {
    return json(res, 200, engine.state);
  }
  if (url.pathname === "/api/story-package" && req.method === "GET") {
    const pkg = storyPackageFromWorld(engine.state, readCutsceneManifest());
    return json(res, 200, { package: pkg, issues: validateStoryPackage(pkg) });
  }
  if (url.pathname === "/api/import-story-package" && req.method === "POST") {
    const body = await readJson(req).catch(() => null);
    try {
      const pkg = body && typeof body === "object" && "package" in body ? (body as { package?: unknown }).package : body;
      if (!pkg || typeof pkg !== "object" || !("packageVersion" in pkg)) {
        return json(res, 400, { error: "invalid_story_package", issues: [{ path: "packageVersion", message: "Story package is required." }] });
      }
      const issues = validateStoryPackage(pkg as never);
      if (issues.length > 0) return json(res, 400, { error: "invalid_story_package", issues });
      const agentLoopStatus = await replaceEngineState(worldFromStoryPackage(pkg as never));
      return json(res, 200, { ok: true, state: engine.state, agentLoopStatus });
    } catch (error) {
      return json(res, 400, { error: (error as Error).message });
    }
  }
  if ((url.pathname === "/api/import-world-source" || url.pathname === "/api/import-anime") && req.method === "POST") {
    const body = await readJson(req).catch(() => null);
    try {
      const source = body && typeof body === "object" && "source" in body ? (body as { source?: unknown }).source : body;
      if (!source || typeof source !== "object") {
        return json(res, 400, { error: "invalid_world_source", issues: [{ path: "source", message: "World ingest source is required." }] });
      }
      const issues = validateWorldIngestSource(source as never);
      if (issues.length > 0) return json(res, 400, { error: "invalid_world_source", issues });
      const agentLoopStatus = await replaceEngineState(worldSourceToWorld(source as never));
      return json(res, 200, { ok: true, state: engine.state, issues: [], agentLoopStatus });
    } catch (error) {
      return json(res, 400, { error: (error as Error).message });
    }
  }
  if (url.pathname === "/api/save" && req.method === "GET") {
    // Snapshot — same shape as /api/state, distinct route so future
    // metadata (saveName, capturedAt) can attach without breaking clients.
    return json(res, 200, {
      capturedAt: new Date().toISOString(),
      world: engine.state,
    });
  }
  if (url.pathname === "/api/agent-loop/status" && req.method === "GET") {
    return json(res, 200, agentLoop.status());
  }
  if (url.pathname === "/api/agent-loop/start" && req.method === "POST") {
    return json(res, 200, agentLoop.start());
  }
  if (url.pathname === "/api/agent-loop/stop" && req.method === "POST") {
    return json(res, 200, agentLoop.stop());
  }
  if (url.pathname === "/api/agent-loop/step" && req.method === "POST") {
    try {
      const summary = await agentLoop.step();
      return json(res, 200, { summary, status: agentLoop.status(), state: engine.state });
    } catch (error) {
      return json(res, 409, { error: (error as Error).message, status: agentLoop.status() });
    }
  }
  if (url.pathname === "/api/agent-loop/restore-checkpoint" && req.method === "POST") {
    const body = await readJson(req).catch(() => null);
    try {
      const tick = body && typeof body === "object" && typeof (body as { tick?: unknown }).tick === "number"
        ? (body as { tick: number }).tick
        : undefined;
      const checkpoint = agentLoop.restoreCheckpoint(tick);
      return json(res, 200, { checkpoint: { tick: checkpoint.tick, capturedAt: checkpoint.capturedAt, worldId: checkpoint.world.id }, status: agentLoop.status(), state: engine.state });
    } catch (error) {
      return json(res, 404, { error: (error as Error).message, status: agentLoop.status() });
    }
  }
  if (url.pathname === "/api/restore" && req.method === "POST") {
    const body = await readJson(req).catch(() => null);
    try {
      const snapshot = body && typeof body === "object" ? body as { world?: World } : null;
      const incoming = snapshot?.world ?? (body as World | null);
      if (!incoming || typeof incoming !== "object" || !("npcs" in incoming)) {
        return json(res, 400, { error: "invalid_snapshot" });
      }
      const agentLoopStatus = await replaceEngineState(incoming);
      return json(res, 200, { ok: true, state: engine.state, agentLoopStatus });
    } catch (error) {
      return json(res, 400, { error: (error as Error).message });
    }
  }
  if (url.pathname === "/api/tick" && req.method === "POST") {
    const body = await readJson(req).catch(() => null);
    try {
      const action = (body && typeof body === "object" ? (body as { action?: PlayerAction }).action : undefined) ?? undefined;
      const summary = await engine.tick(action);
      return json(res, 200, { summary, state: engine.state });
    } catch (error) {
      return json(res, 400, { error: (error as Error).message });
    }
  }

  return serveStatic(url.pathname, res);
});

function serveStatic(pathname: string, res: ServerResponse): void {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const safe = normalize(requested).replace(/^\//, "");
  if (safe.startsWith("..")) return notFound(res);
  const target = new URL(safe, WEB_ROOT);
  try {
    const stat = statSync(target);
    if (!stat.isFile()) return notFound(res);
    res.writeHead(200, { "content-type": MIME[extname(safe)] ?? "application/octet-stream" });
    res.end(readFileSync(target));
  } catch {
    notFound(res);
  }
}

function notFound(res: ServerResponse): void {
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("Not found");
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function replaceEngineState(nextWorld: World) {
  if (agentLoop.status().state === "running") agentLoop.stop("world_replaced");
  await agentLoop.waitForIdle();
  engine.setState(nextWorld);
  const status = agentLoop.clearCheckpoints();
  writeAgentLoopCheckpoints(AGENT_LOOP_CHECKPOINT_PATH, []);
  return status;
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      if (chunks.length === 0) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch (error) { reject(error); }
    });
    req.on("error", reject);
  });
}

server.listen(PORT, () => {
  console.info(`${engine.state.name} running at http://localhost:${PORT} (${isLlmEnabled() ? "LLM" : "scripted"} mode)`);
});

function readCutsceneManifest(): CutsceneManifestEntry[] {
  try {
    return JSON.parse(readFileSync(CUTSCENE_MANIFEST_PATH, "utf8")) as CutsceneManifestEntry[];
  } catch {
    return [];
  }
}
