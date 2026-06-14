import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { readAgentLoopCheckpoints, upsertAgentLoopCheckpoint, writeAgentLoopCheckpoints } from "./agent-checkpoint-store.ts";
import { createAgentLoop } from "./agent-loop.ts";
import { createArcForWorld, evaluateArc, markSparWon } from "./arcs.ts";
import { authorBeat, shouldAuthorBeat } from "./author.ts";
import { catchUpWorld } from "./catch-up.ts";
import { clearDialogueHistories, dialogueAvailable, dialogueContext, generateDialogueReply } from "./dialogue.ts";
import { createDirector } from "./director.ts";
import { fandomToWorldSource } from "./fandom-import.ts";
import { createLlmProposer } from "./llm/proposer.ts";
import { isLlmEnabled, isLocalLlmBackend, proposeAction } from "./llm/router.ts";
import { portraitPath, queueHeroPortrait, queueNpcPortrait } from "./portraits.ts";
import { reflectionDue, reflectNpc } from "./reflection.ts";
import { applyWorldPacing, createEngine } from "./simulation.ts";
import { storyDialogueOptions, storyDialogueRespond } from "./story-dialogue.ts";
import type { CutsceneManifestEntry } from "./story-package.ts";
import { storyPackageFromWorld, validateStoryPackage, worldFromStoryPackage } from "./story-package.ts";
import type { PlayerAction, World } from "./types.ts";
import { validateWorldIngestSource, worldSourceToWorld } from "./world-ingest.ts";

const PORT = Number(process.env["PORT"] ?? 5174);
const CWD = `file://${process.cwd()}/`;
// trailing slash matters: URL resolution drops the last path segment without it
const WEB_ROOT = new URL(`${(process.env["WEB_ROOT"] ?? "./dist/site/").replace(/\/$/, "")}/`, CWD);
const WORLD_PATH = new URL(process.env["WORLD_FILE"] ?? "./worlds/village.json", CWD);
const CUTSCENE_MANIFEST_PATH = new URL("./fixtures/cutscenes-manifest.json", CWD);
// free local backends can afford much broader ambient intelligence
const LLM_MAX_NPCS = Number(process.env["LLM_MAX_NPCS"] ?? (isLocalLlmBackend() ? 10 : 5));
const AGENT_LOOP_INTERVAL_MS = Number(process.env["AGENT_LOOP_INTERVAL_MS"] ?? 4_000);
const AGENT_LOOP_MAX_TICKS = process.env["AGENT_LOOP_MAX_TICKS"] ? Number(process.env["AGENT_LOOP_MAX_TICKS"]) : null;
const AGENT_LOOP_MAX_CHECKPOINTS = Number(process.env["AGENT_LOOP_MAX_CHECKPOINTS"] ?? 24);
const AGENT_LOOP_CHECKPOINT_PATH = new URL(process.env["AGENT_LOOP_CHECKPOINT_FILE"] ?? "./tmp/agent-loop-checkpoints.json", CWD);
const AGENT_LOOP_AUTOSTART = process.env["AGENT_LOOP_AUTOSTART"] === "1";

const PORTRAITS_ENABLED = process.env["PORTRAITS_ENABLED"] === "1";

const AUTOSAVE_PATH = new URL(process.env["AUTOSAVE_FILE"] ?? "./tmp/autosave-world.json", CWD);
const SESSION_SAVE_DIR = new URL(process.env["SESSION_SAVE_DIR"] ?? "./tmp/sessions/", CWD);
const AUTOSAVE_ENABLED = process.env["AUTOSAVE"] !== "0";
const AUTOSAVE_INTERVAL_MS = 10_000;

const MAX_SESSIONS = Number(process.env["MAX_SESSIONS"] ?? 30);
const SESSION_IDLE_EVICT_MS = 30 * 60_000;
const LOOP_IDLE_STOP_MS = 2 * 60_000;
/** admin-only endpoints require this token when set (always set it in production) */
const ADMIN_TOKEN = process.env["ADMIN_TOKEN"] ?? "";
const MAX_BODY_BYTES = 1_500_000;

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
  ".glb": "model/gltf-binary",
};

const INITIAL_WORLD_JSON = readFileSync(WORLD_PATH, "utf8");

// ---------------------------------------------------------------------------
// Sessions: every visitor gets an isolated world. "main" is the default for
// clients that send no session id (tests, scripts, the local single-player).

interface GameSession {
  id: string;
  engine: ReturnType<typeof createEngine>;
  agentLoop: ReturnType<typeof createAgentLoop>;
  sseClients: Set<ServerResponse>;
  dirty: boolean;
  authoring: boolean;
  reflecting: boolean;
  lastActiveAt: number;
  /** when this session's autosave was written (catch-up baseline on restore) */
  restoredSavedAt: number | null;
  /** rate-limit buckets: key -> timestamps of recent hits */
  hits: Map<string, number[]>;
}

const sessions = new Map<string, GameSession>();

function sessionIdFrom(req: IncomingMessage, url: URL): string {
  const raw = url.searchParams.get("session") ?? (req.headers["x-session-id"] as string | undefined) ?? "main";
  return /^[a-zA-Z0-9_-]{1,48}$/.test(raw) ? raw : "main";
}

function savePathFor(sessionId: string): string {
  if (sessionId === "main") return fileURLToPath(AUTOSAVE_PATH);
  return fileURLToPath(new URL(`./${sessionId}.json`, SESSION_SAVE_DIR));
}

function loadAutosave(sessionId: string): { world: World; savedAt: number } | null {
  if (!AUTOSAVE_ENABLED) return null;
  try {
    const path = savePathFor(sessionId);
    if (!existsSync(path)) return null;
    const raw = JSON.parse(readFileSync(path, "utf8")) as { savedAt?: number; world?: World } | World;
    const world = raw && typeof raw === "object" && "world" in raw && raw.world ? raw.world : (raw as World);
    const savedAt = raw && typeof raw === "object" && "savedAt" in raw && typeof raw.savedAt === "number" ? raw.savedAt : Date.now();
    if (!world || typeof world !== "object" || !("npcs" in world)) return null;
    console.info(`[autosave] session "${sessionId}" resuming "${world.name}" at tick ${world.tick}`);
    return { world, savedAt };
  } catch (error) {
    console.error("[autosave] failed to load, starting fresh:", (error as Error).message);
    return null;
  }
}

function flushSession(session: GameSession): void {
  if (!AUTOSAVE_ENABLED || !session.dirty) return;
  session.dirty = false;
  try {
    const path = savePathFor(session.id);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(`${path}.tmp`, JSON.stringify({ savedAt: Date.now(), world: session.engine.state }));
    renameSync(`${path}.tmp`, path);
  } catch (error) {
    session.dirty = true;
    console.error(`[autosave] write failed for "${session.id}":`, (error as Error).message);
  }
}

function createSession(id: string): GameSession {
  const restored = loadAutosave(id);
  const world = restored?.world ?? parseInitialWorld();
  const propose = isLlmEnabled() ? createLlmProposer({ tier: "normal", maxNpcs: LLM_MAX_NPCS }) : undefined;
  const director = createDirector({ propose: isLlmEnabled() ? proposeAction : undefined });
  const engine = createEngine(world, { propose, director });
  createArcForWorld(engine.state);
  applyWorldPacing(engine.state);
  if (PORTRAITS_ENABLED) enqueueWorldPortraits(engine.state);
  // checkpoints persist to disk only for the main session — visitors keep theirs in memory
  const initialCheckpoints =
    id === "main" ? readAgentLoopCheckpoints(AGENT_LOOP_CHECKPOINT_PATH).filter((checkpoint) => checkpoint.world.id === world.id) : [];
  const session: GameSession = {
    id,
    engine,
    agentLoop: null as never,
    sseClients: new Set(),
    dirty: false,
    authoring: false,
    reflecting: false,
    lastActiveAt: Date.now(),
    restoredSavedAt: restored?.savedAt ?? null,
    hits: new Map(),
  };
  session.agentLoop = createAgentLoop(engine, {
    intervalMs: AGENT_LOOP_INTERVAL_MS,
    maxTicks: AGENT_LOOP_MAX_TICKS,
    maxCheckpoints: AGENT_LOOP_MAX_CHECKPOINTS,
    initialCheckpoints,
    ...(id === "main"
      ? { onCheckpoint: (checkpoint) => upsertAgentLoopCheckpoint(AGENT_LOOP_CHECKPOINT_PATH, checkpoint, AGENT_LOOP_MAX_CHECKPOINTS) }
      : {}),
    onTick: (summary) => {
      broadcastSse(session, "tick", { summary });
      checkArc(session);
      maybeAuthor(session);
      maybeReflect(session);
    },
  });
  return session;
}

async function sessionFor(req: IncomingMessage, url: URL): Promise<GameSession> {
  const id = sessionIdFrom(req, url);
  let session = sessions.get(id);
  let awayMs = 0;
  if (!session) {
    if (sessions.size >= MAX_SESSIONS) evictOldestIdleSession();
    session = createSession(id);
    sessions.set(id, session);
    if (session.restoredSavedAt) awayMs = Date.now() - session.restoredSavedAt;
  } else {
    awayMs = Date.now() - session.lastActiveAt;
  }
  session.lastActiveAt = Date.now();
  if (awayMs > 10 * 60_000) {
    // the world kept living: replay the missed time before answering
    const recap = await catchUpWorld(session.engine.state, awayMs).catch(() => null);
    if (recap) {
      session.dirty = true;
      console.info(`[catch-up] session "${session.id}": ${recap.ticks} ticks while away (${Math.round(awayMs / 60000)} min)`);
    }
  }
  session.restoredSavedAt = null;
  return session;
}

function evictOldestIdleSession(): void {
  let oldest: GameSession | null = null;
  for (const session of sessions.values()) {
    if (session.id === "main") continue;
    if (!oldest || session.lastActiveAt < oldest.lastActiveAt) oldest = session;
  }
  if (!oldest) return;
  disposeSession(oldest);
}

function disposeSession(session: GameSession): void {
  if (session.agentLoop.status().state === "running") session.agentLoop.stop("session_evicted");
  flushSession(session);
  for (const client of session.sseClients) client.end();
  clearDialogueHistories(session.id);
  sessions.delete(session.id);
}

// sweep: flush dirty sessions, stop loops nobody is watching, evict idle sessions
setInterval(() => {
  const now = Date.now();
  for (const session of sessions.values()) {
    flushSession(session);
    const idleFor = now - session.lastActiveAt;
    if (session.sseClients.size === 0 && idleFor > LOOP_IDLE_STOP_MS && session.agentLoop.status().state === "running") {
      session.agentLoop.stop("no_viewers");
    }
    if (session.id !== "main" && session.sseClients.size === 0 && idleFor > SESSION_IDLE_EVICT_MS) {
      disposeSession(session);
    }
  }
}, AUTOSAVE_INTERVAL_MS).unref();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    for (const session of sessions.values()) flushSession(session);
    process.exit(0);
  });
}

function broadcastSse(session: GameSession, event: string, payload: unknown): void {
  const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of session.sseClients) client.write(frame);
}

setInterval(() => {
  for (const session of sessions.values()) {
    for (const client of session.sseClients) client.write(": ping\n\n");
  }
}, 25_000).unref();

/** the showrunner writes new content (quest/arrival/incident) on a slow cadence */
function maybeAuthor(session: GameSession): void {
  if (session.authoring || !isLlmEnabled() || !shouldAuthorBeat(session.engine.state)) return;
  session.authoring = true;
  void (async () => {
    try {
      const beat = await authorBeat(session.engine.state);
      if (!beat) return;
      session.dirty = true;
      broadcastSse(session, "tick", {
        summary: {
          tick: session.engine.state.tick,
          actions: [
            {
              action: { type: "remember", actorId: beat.focusActorId, text: beat.text },
              text: beat.text,
              fromDirector: true,
            },
          ],
          rejected: [],
          checksum: "authored-beat",
          clock: session.engine.state.clock,
        },
      });
    } catch {
      // authored beats are a bonus; failures must never break the loop
    } finally {
      session.authoring = false;
    }
  })();
}

/** synthesises one NPC's recent experiences into a private belief (no SSE broadcast) */
function maybeReflect(session: GameSession): void {
  if (session.reflecting || !isLlmEnabled()) return;
  const world = session.engine.state;
  const npc = world.npcs.find((n) => reflectionDue(n, world.tick));
  if (!npc) return;
  session.reflecting = true;
  void (async () => {
    try {
      const insight = await reflectNpc(world, npc);
      if (insight) session.dirty = true;
    } catch {
      // reflections are non-critical; failures are silently dropped
    } finally {
      session.reflecting = false;
    }
  })();
}

/** check arc progress after world mutations; broadcast a director-style beat on stage advance */
function checkArc(session: GameSession): void {
  session.dirty = true;
  const beat = evaluateArc(session.engine.state);
  if (!beat) return;
  broadcastSse(session, "tick", {
    summary: {
      tick: session.engine.state.tick,
      actions: [
        {
          action: { type: "remember", actorId: beat.focusId, text: beat.text },
          text: `${beat.text} (+${beat.xpAwarded} XP)`,
          fromDirector: true,
        },
      ],
      rejected: [],
      checksum: "arc-beat",
      clock: session.engine.state.clock,
    },
  });
}

// ---------------------------------------------------------------------------
// Rate limiting: sliding-window per session. Every dialogue call is an LLM
// call someone pays for; world replacement rebuilds the whole sim.

const RATE_LIMITS: Record<string, { max: number; windowMs: number }> = {
  dialogue: { max: 20, windowMs: 60_000 },
  tick: { max: 120, windowMs: 60_000 },
  replace_world: { max: 6, windowMs: 10 * 60_000 },
};

function rateLimited(session: GameSession, kind: keyof typeof RATE_LIMITS): boolean {
  const limit = RATE_LIMITS[kind]!;
  const now = Date.now();
  const hits = (session.hits.get(kind) ?? []).filter((at) => now - at < limit.windowMs);
  if (hits.length >= limit.max) {
    session.hits.set(kind, hits);
    return true;
  }
  hits.push(now);
  session.hits.set(kind, hits);
  return false;
}

function isAdmin(req: IncomingMessage): boolean {
  if (!ADMIN_TOKEN) return true; // dev mode: no token configured
  return req.headers["x-admin-token"] === ADMIN_TOKEN;
}

// ---------------------------------------------------------------------------

const mainSession = createSession("main");
sessions.set("main", mainSession);
if (AGENT_LOOP_AUTOSTART) mainSession.agentLoop.start();

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  // the client is built with base /game/ — accept its API calls here too
  if (url.pathname.startsWith("/game/api/")) url.pathname = url.pathname.slice("/game".length);
  if (!url.pathname.startsWith("/api/")) return serveStatic(url.pathname, res);
  const session = await sessionFor(req, url);
  const { engine, agentLoop } = session;

  if (url.pathname === "/api/state" && req.method === "GET") {
    return json(res, 200, engine.state);
  }
  if (url.pathname === "/api/worlds" && req.method === "GET") {
    return json(res, 200, { worlds: listBundledWorlds(), currentId: engine.state.id });
  }
  if (url.pathname === "/api/worlds/select" && req.method === "POST") {
    if (rateLimited(session, "replace_world")) return json(res, 429, { error: "rate_limited" });
    const body = await readJson(req).catch(() => null);
    const id = body && typeof body === "object" ? (body as { id?: unknown }).id : undefined;
    const entry = listBundledWorlds().find((world) => world.id === id);
    if (!entry) return json(res, 404, { error: "unknown world" });
    try {
      const raw = JSON.parse(readFileSync(new URL(entry.file, CWD), "utf8")) as Record<string, unknown>;
      const nextWorld = entry.kind === "source" ? worldSourceToWorld(raw as never) : (raw as unknown as World);
      const agentLoopStatus = await replaceEngineState(session, nextWorld);
      return json(res, 200, { ok: true, state: engine.state, agentLoopStatus });
    } catch (error) {
      return json(res, 400, { error: (error as Error).message });
    }
  }
  if (url.pathname === "/api/events" && req.method === "GET") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    res.write(`event: hello\ndata: ${JSON.stringify({ worldId: engine.state.id, tick: engine.state.tick })}\n\n`);
    session.sseClients.add(res);
    req.on("close", () => {
      session.sseClients.delete(res);
      session.lastActiveAt = Date.now();
    });
    return;
  }
  if (url.pathname === "/api/story-package" && req.method === "GET") {
    const pkg = storyPackageFromWorld(engine.state, readCutsceneManifest());
    return json(res, 200, { package: pkg, issues: validateStoryPackage(pkg) });
  }
  if (url.pathname === "/api/import-story-package" && req.method === "POST") {
    if (rateLimited(session, "replace_world")) return json(res, 429, { error: "rate_limited" });
    const body = await readJson(req).catch(() => null);
    try {
      const pkg = body && typeof body === "object" && "package" in body ? (body as { package?: unknown }).package : body;
      if (!pkg || typeof pkg !== "object" || !("packageVersion" in pkg)) {
        return json(res, 400, { error: "invalid_story_package", issues: [{ path: "packageVersion", message: "Story package is required." }] });
      }
      const issues = validateStoryPackage(pkg as never);
      if (issues.length > 0) return json(res, 400, { error: "invalid_story_package", issues });
      const agentLoopStatus = await replaceEngineState(session, worldFromStoryPackage(pkg as never));
      return json(res, 200, { ok: true, state: engine.state, agentLoopStatus });
    } catch (error) {
      return json(res, 400, { error: (error as Error).message });
    }
  }
  if (url.pathname === "/api/import-fandom" && req.method === "POST") {
    if (rateLimited(session, "replace_world")) return json(res, 429, { error: "rate_limited" });
    const body = await readJson(req).catch(() => null);
    const query = body && typeof body === "object" ? (body as { query?: unknown }).query : undefined;
    if (typeof query !== "string" || !query.trim()) return json(res, 400, { error: "query is required" });
    try {
      const imported = await fandomToWorldSource(query);
      const agentLoopStatus = await replaceEngineState(session, worldSourceToWorld(imported.source));
      return json(res, 200, { ok: true, state: engine.state, wiki: imported.wiki, notes: imported.notes, agentLoopStatus });
    } catch (error) {
      return json(res, 400, { error: (error as Error).message });
    }
  }
  if ((url.pathname === "/api/import-world-source" || url.pathname === "/api/import-anime") && req.method === "POST") {
    if (rateLimited(session, "replace_world")) return json(res, 429, { error: "rate_limited" });
    const body = await readJson(req).catch(() => null);
    try {
      const source = body && typeof body === "object" && "source" in body ? (body as { source?: unknown }).source : body;
      if (!source || typeof source !== "object") {
        return json(res, 400, { error: "invalid_world_source", issues: [{ path: "source", message: "World ingest source is required." }] });
      }
      const issues = validateWorldIngestSource(source as never);
      if (issues.length > 0) return json(res, 400, { error: "invalid_world_source", issues });
      const agentLoopStatus = await replaceEngineState(session, worldSourceToWorld(source as never));
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
  if (url.pathname === "/api/reset" && req.method === "POST") {
    if (rateLimited(session, "replace_world")) return json(res, 429, { error: "rate_limited" });
    try {
      const agentLoopStatus = await replaceEngineState(session, parseInitialWorld());
      return json(res, 200, { ok: true, state: engine.state, agentLoopStatus });
    } catch (error) {
      return json(res, 400, { error: (error as Error).message });
    }
  }
  if (url.pathname === "/api/load" && req.method === "POST") {
    // Load a client-held save snapshot into this session. Non-admin (it only
    // touches the caller's own cookie-scoped session) but rate-limited, same as
    // /api/reset. Powers the OPFS multi-slot save/load on the start screen.
    if (rateLimited(session, "replace_world")) return json(res, 429, { error: "rate_limited" });
    const body = await readJson(req).catch(() => null);
    try {
      const snapshot = body && typeof body === "object" ? (body as { world?: World }) : null;
      const incoming = snapshot?.world ?? (body as World | null);
      if (!incoming || typeof incoming !== "object" || !("npcs" in incoming)) {
        return json(res, 400, { error: "invalid_snapshot" });
      }
      const agentLoopStatus = await replaceEngineState(session, incoming);
      return json(res, 200, { ok: true, state: engine.state, agentLoopStatus });
    } catch (error) {
      return json(res, 400, { error: (error as Error).message });
    }
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
      checkArc(session);
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
      session.dirty = true;
      return json(res, 200, { checkpoint: { tick: checkpoint.tick, capturedAt: checkpoint.capturedAt, worldId: checkpoint.world.id }, status: agentLoop.status(), state: engine.state });
    } catch (error) {
      return json(res, 404, { error: (error as Error).message, status: agentLoop.status() });
    }
  }
  if (url.pathname === "/api/restore" && req.method === "POST") {
    if (!isAdmin(req)) return json(res, 403, { error: "admin_token_required" });
    const body = await readJson(req).catch(() => null);
    try {
      const snapshot = body && typeof body === "object" ? body as { world?: World } : null;
      const incoming = snapshot?.world ?? (body as World | null);
      if (!incoming || typeof incoming !== "object" || !("npcs" in incoming)) {
        return json(res, 400, { error: "invalid_snapshot" });
      }
      const agentLoopStatus = await replaceEngineState(session, incoming);
      return json(res, 200, { ok: true, state: engine.state, agentLoopStatus });
    } catch (error) {
      return json(res, 400, { error: (error as Error).message });
    }
  }
  if (url.pathname === "/api/dialogue/history" && req.method === "GET") {
    const npcId = url.searchParams.get("npcId") ?? "";
    if (!dialogueAvailable()) {
      const options = storyDialogueOptions(engine.state, npcId);
      return json(res, 200, { llm: false, story: Boolean(options), options: options ?? [] });
    }
    const context = dialogueContext(engine.state, npcId, session.id);
    if (!context) return json(res, 404, { error: "unknown_npc" });
    return json(res, 200, { llm: true, ...context });
  }
  if (url.pathname === "/api/dialogue/choose" && req.method === "POST") {
    const body = await readJson(req).catch(() => null);
    const npcId = body && typeof body === "object" ? (body as { npcId?: unknown }).npcId : undefined;
    const optionId = body && typeof body === "object" ? (body as { optionId?: unknown }).optionId : undefined;
    if (typeof npcId !== "string" || typeof optionId !== "string") return json(res, 400, { error: "npcId and optionId required" });
    const reply = storyDialogueRespond(engine.state, npcId, optionId);
    if (!reply) return json(res, 404, { error: "unknown_option" });
    if (reply.action) {
      broadcastSse(session, "tick", {
        summary: {
          tick: engine.state.tick,
          actions: [{ action: { type: reply.action.type, actorId: npcId, targetId: "player" }, text: reply.action.text }],
          rejected: [],
          checksum: "story-action",
          clock: engine.state.clock,
        },
      });
    }
    checkArc(session);
    return json(res, 200, { ...reply });
  }
  if (url.pathname === "/api/dialogue" && req.method === "POST") {
    if (!dialogueAvailable()) return json(res, 200, { llm: false });
    if (rateLimited(session, "dialogue")) return json(res, 429, { error: "rate_limited" });
    const body = await readJson(req).catch(() => null);
    const npcId = body && typeof body === "object" ? (body as { npcId?: unknown }).npcId : undefined;
    const text = body && typeof body === "object" ? (body as { text?: unknown }).text : undefined;
    if (typeof npcId !== "string" || typeof text !== "string" || !text.trim()) {
      return json(res, 400, { error: "npcId and text are required" });
    }
    const historyKey = session.id;
    if (body && typeof body === "object" && (body as { stream?: unknown }).stream) {
      // streaming: visible reply tokens flow as SSE, structured result in `done`
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      const abortController = new AbortController();
      req.on("close", () => {
        // close fires on both disconnect and natural end; only abort if still writing
        if (!res.writableEnded) abortController.abort();
      });
      let tokensSent = false;
      const onToken = (delta: string) => {
        tokensSent = true;
        res.write(`event: token\ndata: ${JSON.stringify({ t: delta })}\n\n`);
      };
      let streamResult = await generateDialogueReply(engine.state, npcId, text.trim().slice(0, 500), { onToken, historyKey, signal: abortController.signal });
      if (!streamResult.ok && !tokensSent && !["unknown_npc", "npc_defeated", "npc_not_here", "cancelled"].includes(streamResult.reason)) {
        streamResult = await generateDialogueReply(engine.state, npcId, text.trim().slice(0, 500), { onToken, historyKey, signal: abortController.signal });
      }
      if (streamResult.ok && streamResult.action) {
        broadcastSse(session, "tick", {
          summary: {
            tick: engine.state.tick,
            actions: [{ action: { type: streamResult.action.type, actorId: npcId, targetId: "player" }, text: streamResult.action.text }],
            rejected: [],
            checksum: "dialogue-action",
            clock: engine.state.clock,
          },
        });
      }
      checkArc(session);
      const done = streamResult.ok
        ? { llm: true, reply: streamResult.reply, action: streamResult.action ?? null, relationship: streamResult.relationship }
        : { llm: true, error: streamResult.reason };
      res.write(`event: done\ndata: ${JSON.stringify(done)}\n\n`);
      res.end();
      return;
    }
    let result = await generateDialogueReply(engine.state, npcId, text.trim().slice(0, 500), { historyKey });
    if (!result.ok && !["unknown_npc", "npc_defeated", "npc_not_here"].includes(result.reason)) {
      // transient model failure (cooldown/timeout): one retry before giving up
      result = await generateDialogueReply(engine.state, npcId, text.trim().slice(0, 500), { historyKey });
    }
    if (!result.ok) return json(res, 200, { llm: true, error: result.reason });
    if (result.action) {
      // a dialogue-decided action changed the world: let every client sync
      broadcastSse(session, "tick", {
        summary: {
          tick: engine.state.tick,
          actions: [{ action: { type: result.action.type, actorId: npcId, targetId: "player" }, text: result.action.text }],
          rejected: [],
          checksum: "dialogue-action",
          clock: engine.state.clock,
        },
      });
    }
    checkArc(session);
    return json(res, 200, { llm: true, reply: result.reply, action: result.action ?? null, relationship: result.relationship });
  }
  if (url.pathname === "/api/arc/event" && req.method === "POST") {
    const body = await readJson(req).catch(() => null);
    const kind = body && typeof body === "object" ? (body as { kind?: unknown }).kind : undefined;
    if (kind === "spar_won") {
      const award = markSparWon(engine.state);
      if (award) {
        broadcastSse(session, "tick", {
          summary: {
            tick: engine.state.tick,
            actions: [
              {
                action: { type: "remember", actorId: engine.state.arc?.mentorId ?? "player", text: "The spar is won." },
                text: "You held your ground in the spar. (+50 XP)",
                fromDirector: true,
              },
            ],
            rejected: [],
            checksum: "arc-spar",
            clock: engine.state.clock,
          },
        });
      }
      checkArc(session);
      return json(res, 200, { ok: true, arc: engine.state.arc ?? null, growth: engine.state.player.growth ?? null });
    }
    return json(res, 400, { error: "unknown arc event" });
  }
  if (url.pathname === "/api/tick" && req.method === "POST") {
    if (rateLimited(session, "tick")) return json(res, 429, { error: "rate_limited" });
    const body = await readJson(req).catch(() => null);
    try {
      const action = (body && typeof body === "object" ? (body as { action?: PlayerAction }).action : undefined) ?? undefined;
      const summary = await engine.tick(action);
      checkArc(session);
      return json(res, 200, { summary, state: engine.state });
    } catch (error) {
      return json(res, 400, { error: (error as Error).message });
    }
  }

  // Portrait: GET /api/portrait/:npcId
  const portraitMatch = url.pathname.match(/^\/api\/portrait\/([^/]+)$/);
  if (portraitMatch && req.method === "GET") {
    const npcId = decodeURIComponent(portraitMatch[1]!);
    const worldId = engine.state.id;
    const file = portraitPath(npcId, worldId);
    if (existsSync(file)) {
      res.writeHead(200, {
        "content-type": "image/png",
        "cache-control": "public, max-age=86400, immutable",
      });
      res.end(readFileSync(file));
      return;
    }
    // Not ready yet — enqueue if portraits are enabled
    if (PORTRAITS_ENABLED) {
      const isPlayer = npcId === "player";
      if (isPlayer) {
        void queueHeroPortrait(engine.state, engine.state.player.name);
      } else {
        const npc = engine.state.npcs.find((n) => n.id === npcId);
        if (npc) void queueNpcPortrait(npc, engine.state);
      }
    }
    return notFound(res);
  }

  return notFound(res);
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

/** Fire-and-forget: enqueue portraits for all NPCs + the player hero. */
function enqueueWorldPortraits(world: World): void {
  void queueHeroPortrait(world, world.player.name);
  for (const npc of world.npcs) {
    void queueNpcPortrait(npc, world);
  }
}

async function replaceEngineState(session: GameSession, nextWorld: World) {
  const { agentLoop, engine } = session;
  if (agentLoop.status().state === "running") agentLoop.stop("world_replaced");
  await agentLoop.waitForIdle();
  engine.setState(nextWorld);
  createArcForWorld(engine.state);
  applyWorldPacing(engine.state);
  if (PORTRAITS_ENABLED) enqueueWorldPortraits(engine.state);
  session.dirty = true;
  const status = agentLoop.clearCheckpoints();
  if (session.id === "main") writeAgentLoopCheckpoints(AGENT_LOOP_CHECKPOINT_PATH, []);
  clearDialogueHistories(session.id);
  broadcastSse(session, "world", { worldId: engine.state.id, tick: engine.state.tick });
  return status;
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    req.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        reject(new Error("payload_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (chunks.length === 0) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch (error) { reject(error); }
    });
    req.on("error", reject);
  });
}

server.listen(PORT, () => {
  console.info(`${mainSession.engine.state.name} running at http://localhost:${PORT} (${isLlmEnabled() ? "LLM" : "scripted"} mode)`);
});

interface BundledWorld {
  id: string;
  name: string;
  blurb: string;
  kind: "world" | "source";
  file: string;
  /** anime worlds are beta while the showcase leans on stylized CC0 asset packs */
  beta: boolean;
  /** the static-agent gossip demo — surfaced as a distinct card */
  showcase: boolean;
}

let bundledWorldsCache: BundledWorld[] | null = null;

function listBundledWorlds(): BundledWorld[] {
  if (bundledWorldsCache) return bundledWorldsCache;
  const entries: BundledWorld[] = [];
  const scan = (dir: string) => {
    let files: string[] = [];
    try {
      files = readdirSync(new URL(dir, CWD)).filter((file) => file.endsWith(".json"));
    } catch {
      return;
    }
    for (const file of files) {
      try {
        const raw = JSON.parse(readFileSync(new URL(`${dir}${file}`, CWD), "utf8")) as Record<string, unknown>;
        const isSource = typeof raw["title"] === "string" && Array.isArray(raw["characters"]);
        const isWorld = typeof raw["name"] === "string" && Array.isArray(raw["npcs"]);
        if (!isSource && !isWorld) continue;
        const id = String(raw["worldId"] ?? raw["id"] ?? file.replace(".json", ""));
        if (entries.some((entry) => entry.id === id)) continue;
        entries.push({
          id,
          name: String(raw["title"] ?? raw["name"]),
          blurb: String(raw["synopsis"] ?? (raw["story"] as { premise?: string } | undefined)?.premise ?? "").slice(0, 160),
          kind: isSource ? "source" : "world",
          file: `${dir}${file}`,
          beta: Boolean(raw["beta"]) || dir.includes("/anime/"),
          showcase: Boolean(raw["showcase"]),
        });
      } catch {
        // unreadable file; skip
      }
    }
  };
  scan("./worlds/");
  scan("./fixtures/anime/");
  bundledWorldsCache = entries;
  return entries;
}

function readCutsceneManifest(): CutsceneManifestEntry[] {
  try {
    return JSON.parse(readFileSync(CUTSCENE_MANIFEST_PATH, "utf8")) as CutsceneManifestEntry[];
  } catch {
    return [];
  }
}

function parseInitialWorld(): World {
  return JSON.parse(INITIAL_WORLD_JSON) as World;
}
