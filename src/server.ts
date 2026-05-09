import { readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, normalize } from "node:path";

import { createDirector } from "./director.ts";
import { createLlmProposer } from "./llm/proposer.ts";
import { isLlmEnabled, proposeAction } from "./llm/router.ts";
import { createEngine } from "./simulation.ts";
import type { PlayerAction, World } from "./types.ts";

const PORT = Number(process.env["PORT"] ?? 5174);
const CWD = `file://${process.cwd()}/`;
const WEB_ROOT = new URL(process.env["WEB_ROOT"] ?? "./web/", CWD);
const WORLD_PATH = new URL(process.env["WORLD_FILE"] ?? "./worlds/village.json", CWD);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".ts": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const world = JSON.parse(readFileSync(WORLD_PATH, "utf8")) as World;
const propose = isLlmEnabled() ? createLlmProposer({ tier: "normal" }) : undefined;
const director = createDirector({ propose: isLlmEnabled() ? proposeAction : undefined });
const engine = createEngine(world, { propose, director });

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  if (url.pathname === "/api/state" && req.method === "GET") {
    return json(res, 200, engine.state);
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
  console.info(`Ashbend running at http://localhost:${PORT} (${isLlmEnabled() ? "LLM" : "scripted"} mode)`);
});
