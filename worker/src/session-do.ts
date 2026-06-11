import { createAgentLoop } from "../../src/agent-loop.ts";
import { createArcForWorld, evaluateArc, markSparWon } from "../../src/arcs.ts";
import { authorBeat, shouldAuthorBeat } from "../../src/author.ts";
import { catchUpWorld } from "../../src/catch-up.ts";
import { clearDialogueHistories, dialogueAvailable, dialogueContext, generateDialogueReply } from "../../src/dialogue.ts";
import { createDirector } from "../../src/director.ts";
import { fandomToWorldSource } from "../../src/fandom-import.ts";
import { createLlmProposer } from "../../src/llm/proposer.ts";
import { isLlmEnabled, proposeAction, setLlmFetch } from "../../src/llm/router.ts";
import { applyWorldPacing, createEngine } from "../../src/simulation.ts";
import { storyDialogueOptions, storyDialogueRespond } from "../../src/story-dialogue.ts";
import type { PlayerAction, World } from "../../src/types.ts";
import { validateWorldIngestSource, worldSourceToWorld } from "../../src/world-ingest.ts";
import { BUNDLED_WORLDS, defaultWorld, worldForEntry } from "./catalog.ts";

interface Env {
  ADMIN_TOKEN?: string;
  GATEWAY?: { fetch: (url: string, init: RequestInit) => Promise<Response> };
  [key: string]: unknown;
}

const SSE_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache",
  connection: "keep-alive",
};

const RATE_LIMITS: Record<string, { max: number; windowMs: number }> = {
  dialogue: { max: 20, windowMs: 60_000 },
  tick: { max: 120, windowMs: 60_000 },
  replace_world: { max: 6, windowMs: 10 * 60_000 },
};

const AGENT_LOOP_INTERVAL_MS = 4_000;
const PERSIST_DEBOUNCE_MS = 5_000;

/**
 * One Durable Object per visitor session: an isolated world, agent loop,
 * SSE fan-out, and durable storage. The DO hibernates when no client is
 * connected; world state is re-hydrated from storage on the next request.
 */
export class GameSessionDO {
  private readonly ctx: DurableObjectState;
  private readonly env: Env;
  private engine: ReturnType<typeof createEngine> | null = null;
  private agentLoop: ReturnType<typeof createAgentLoop> | null = null;
  private sseWriters = new Set<WritableStreamDefaultWriter<Uint8Array>>();
  private hits = new Map<string, number[]>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private lastTouchedAt = 0;
  private authoring = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private readonly encoder = new TextEncoder();

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
    // the engine's LLM modules read process.env at call time; mirror Worker
    // vars/secrets into it regardless of nodejs_compat population flags
    const proc = (globalThis as { process?: { env?: Record<string, string> } }).process;
    if (proc?.env) {
      for (const [key, value] of Object.entries(env)) {
        if (typeof value === "string") proc.env[key] = value;
      }
    }
    // route LLM calls through the service binding — direct workers.dev
    // fetches between workers in the same account are blocked
    if (env.GATEWAY) {
      const gateway = env.GATEWAY;
      setLlmFetch((url, init) => gateway.fetch(url, init));
    }
  }

  private async ensureEngine(): Promise<{ engine: ReturnType<typeof createEngine>; agentLoop: ReturnType<typeof createAgentLoop> }> {
    if (this.engine && this.agentLoop) return { engine: this.engine, agentLoop: this.agentLoop };
    const saved = await this.ctx.storage.get<string>("world");
    let world: World | null = null;
    if (saved) {
      try {
        world = JSON.parse(saved) as World;
      } catch {
        world = null;
      }
    }
    world ??= defaultWorld();
    const propose = isLlmEnabled() ? createLlmProposer({ tier: "normal", maxNpcs: 5 }) : undefined;
    const director = createDirector({ propose: isLlmEnabled() ? proposeAction : undefined });
    this.engine = createEngine(world, { propose, director });
    createArcForWorld(this.engine.state);
    applyWorldPacing(this.engine.state);
    this.agentLoop = createAgentLoop(this.engine, {
      intervalMs: AGENT_LOOP_INTERVAL_MS,
      maxTicks: null,
      maxCheckpoints: 8,
      onTick: (summary) => {
        this.broadcast("tick", { summary });
        this.checkArc();
        this.maybeAuthor();
      },
    });
    return { engine: this.engine, agentLoop: this.agentLoop };
  }

  private schedulePersist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      if (!this.engine) return;
      void this.ctx.storage.put("world", JSON.stringify(this.engine.state));
      void this.ctx.storage.put("savedAt", Date.now());
    }, PERSIST_DEBOUNCE_MS);
  }

  private broadcast(event: string, payload: unknown): void {
    const frame = this.encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    for (const writer of this.sseWriters) {
      writer.write(frame).catch(() => {
        this.sseWriters.delete(writer);
        this.maybeStopLoop();
      });
    }
  }

  private maybeStopLoop(): void {
    if (this.sseWriters.size > 0) return;
    if (this.agentLoop?.status().state === "running") this.agentLoop.stop("no_viewers");
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /** the showrunner writes new content (quest/arrival/incident) on a slow cadence */
  private maybeAuthor(): void {
    const engine = this.engine;
    if (!engine || this.authoring || !isLlmEnabled() || !shouldAuthorBeat(engine.state)) return;
    this.authoring = true;
    this.ctx.waitUntil(
      (async () => {
        try {
          const beat = await authorBeat(engine.state);
          if (!beat) return;
          this.schedulePersist();
          this.broadcast("tick", {
            summary: {
              tick: engine.state.tick,
              actions: [{ action: { type: "remember", actorId: beat.focusActorId, text: beat.text }, text: beat.text, fromDirector: true }],
              rejected: [],
              checksum: "authored-beat",
              clock: engine.state.clock,
            },
          });
        } catch {
          // authored beats are a bonus; failures must never break the DO
        } finally {
          this.authoring = false;
        }
      })()
    );
  }

  private checkArc(): void {
    if (!this.engine) return;
    this.schedulePersist();
    const beat = evaluateArc(this.engine.state);
    if (!beat) return;
    this.broadcast("tick", {
      summary: {
        tick: this.engine.state.tick,
        actions: [
          {
            action: { type: "remember", actorId: beat.focusId, text: beat.text },
            text: `${beat.text} (+${beat.xpAwarded} XP)`,
            fromDirector: true,
          },
        ],
        rejected: [],
        checksum: "arc-beat",
        clock: this.engine.state.clock,
      },
    });
  }

  private rateLimited(kind: keyof typeof RATE_LIMITS): boolean {
    const limit = RATE_LIMITS[kind]!;
    const now = Date.now();
    const hits = (this.hits.get(kind) ?? []).filter((at) => now - at < limit.windowMs);
    if (hits.length >= limit.max) {
      this.hits.set(kind, hits);
      return true;
    }
    hits.push(now);
    this.hits.set(kind, hits);
    return false;
  }

  private isAdmin(request: Request): boolean {
    const token = this.env.ADMIN_TOKEN ?? "";
    if (!token) return true; // dev mode
    return request.headers.get("x-admin-token") === token;
  }

  private async replaceWorld(nextWorld: World) {
    const { engine, agentLoop } = await this.ensureEngine();
    if (agentLoop.status().state === "running") agentLoop.stop("world_replaced");
    await agentLoop.waitForIdle();
    engine.setState(nextWorld);
    createArcForWorld(engine.state);
    applyWorldPacing(engine.state);
    const status = agentLoop.clearCheckpoints();
    clearDialogueHistories(this.ctx.id.toString());
    await this.ctx.storage.put("world", JSON.stringify(engine.state));
    this.broadcast("world", { worldId: engine.state.id, tick: engine.state.tick });
    return status;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const hadEngine = Boolean(this.engine);
    const { engine, agentLoop } = await this.ensureEngine();
    const historyKey = this.ctx.id.toString();

    // the world advances while you're away — replay missed time on return
    const now = Date.now();
    let awayMs = 0;
    if (!hadEngine) {
      const savedAt = await this.ctx.storage.get<number>("savedAt");
      if (savedAt) awayMs = now - savedAt;
    } else if (this.lastTouchedAt) {
      awayMs = now - this.lastTouchedAt;
    }
    this.lastTouchedAt = now;
    if (awayMs > 10 * 60_000) {
      const recap = await catchUpWorld(engine.state, awayMs).catch(() => null);
      if (recap) this.schedulePersist();
    }

    if (path === "/api/state" && request.method === "GET") return json(200, engine.state);
    if (path === "/api/worlds" && request.method === "GET") {
      return json(200, {
        worlds: BUNDLED_WORLDS.map(({ id, name, blurb, kind }) => ({ id, name, blurb, kind })),
        currentId: engine.state.id,
      });
    }
    if (path === "/api/worlds/select" && request.method === "POST") {
      if (this.rateLimited("replace_world")) return json(429, { error: "rate_limited" });
      const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
      const entry = BUNDLED_WORLDS.find((world) => world.id === body?.id);
      if (!entry) return json(404, { error: "unknown world" });
      try {
        const agentLoopStatus = await this.replaceWorld(worldForEntry(entry));
        return json(200, { ok: true, state: engine.state, agentLoopStatus });
      } catch (error) {
        return json(400, { error: (error as Error).message });
      }
    }
    if (path === "/api/events" && request.method === "GET") {
      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
      const writer = writable.getWriter();
      this.sseWriters.add(writer);
      void writer.write(
        this.encoder.encode(`event: hello\ndata: ${JSON.stringify({ worldId: engine.state.id, tick: engine.state.tick })}\n\n`)
      );
      if (!this.pingTimer) {
        this.pingTimer = setInterval(() => {
          for (const w of this.sseWriters) {
            w.write(this.encoder.encode(": ping\n\n")).catch(() => {
              this.sseWriters.delete(w);
              this.maybeStopLoop();
            });
          }
        }, 25_000);
      }
      return new Response(readable, { headers: SSE_HEADERS });
    }
    if (path === "/api/import-fandom" && request.method === "POST") {
      if (this.rateLimited("replace_world")) return json(429, { error: "rate_limited" });
      const body = (await request.json().catch(() => null)) as { query?: unknown } | null;
      const query = body?.query;
      if (typeof query !== "string" || !query.trim()) return json(400, { error: "query is required" });
      try {
        const imported = await fandomToWorldSource(query);
        const agentLoopStatus = await this.replaceWorld(worldSourceToWorld(imported.source));
        return json(200, { ok: true, state: engine.state, wiki: imported.wiki, notes: imported.notes, agentLoopStatus });
      } catch (error) {
        return json(400, { error: (error as Error).message });
      }
    }
    if ((path === "/api/import-world-source" || path === "/api/import-anime") && request.method === "POST") {
      if (this.rateLimited("replace_world")) return json(429, { error: "rate_limited" });
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      try {
        const source = body && "source" in body ? body["source"] : body;
        if (!source || typeof source !== "object") {
          return json(400, { error: "invalid_world_source", issues: [{ path: "source", message: "World ingest source is required." }] });
        }
        const issues = validateWorldIngestSource(source as never);
        if (issues.length > 0) return json(400, { error: "invalid_world_source", issues });
        const agentLoopStatus = await this.replaceWorld(worldSourceToWorld(source as never));
        return json(200, { ok: true, state: engine.state, issues: [], agentLoopStatus });
      } catch (error) {
        return json(400, { error: (error as Error).message });
      }
    }
    if (path === "/api/save" && request.method === "GET") {
      return json(200, { capturedAt: new Date().toISOString(), world: engine.state });
    }
    if (path === "/api/reset" && request.method === "POST") {
      if (this.rateLimited("replace_world")) return json(429, { error: "rate_limited" });
      const agentLoopStatus = await this.replaceWorld(defaultWorld());
      return json(200, { ok: true, state: engine.state, agentLoopStatus });
    }
    if (path === "/api/restore" && request.method === "POST") {
      if (!this.isAdmin(request)) return json(403, { error: "admin_token_required" });
      const body = (await request.json().catch(() => null)) as { world?: World } | World | null;
      const incoming = body && typeof body === "object" && "world" in body ? (body as { world?: World }).world : (body as World | null);
      if (!incoming || typeof incoming !== "object" || !("npcs" in incoming)) return json(400, { error: "invalid_snapshot" });
      const agentLoopStatus = await this.replaceWorld(incoming);
      return json(200, { ok: true, state: engine.state, agentLoopStatus });
    }
    if (path === "/api/agent-loop/status" && request.method === "GET") return json(200, agentLoop.status());
    if (path === "/api/agent-loop/start" && request.method === "POST") return json(200, agentLoop.start());
    if (path === "/api/agent-loop/stop" && request.method === "POST") return json(200, agentLoop.stop());
    if (path === "/api/agent-loop/step" && request.method === "POST") {
      try {
        const summary = await agentLoop.step();
        this.checkArc();
        return json(200, { summary, status: agentLoop.status(), state: engine.state });
      } catch (error) {
        return json(409, { error: (error as Error).message, status: agentLoop.status() });
      }
    }
    if (path === "/api/dialogue/history" && request.method === "GET") {
      const npcId = url.searchParams.get("npcId") ?? "";
      if (!dialogueAvailable()) {
        const options = storyDialogueOptions(engine.state, npcId);
        return json(200, { llm: false, story: Boolean(options), options: options ?? [] });
      }
      const context = dialogueContext(engine.state, npcId, historyKey);
      if (!context) return json(404, { error: "unknown_npc" });
      return json(200, { llm: true, ...context });
    }
    if (path === "/api/dialogue/choose" && request.method === "POST") {
      const body = (await request.json().catch(() => null)) as { npcId?: unknown; optionId?: unknown } | null;
      if (typeof body?.npcId !== "string" || typeof body?.optionId !== "string") return json(400, { error: "npcId and optionId required" });
      const reply = storyDialogueRespond(engine.state, body.npcId, body.optionId);
      if (!reply) return json(404, { error: "unknown_option" });
      if (reply.action) {
        this.broadcast("tick", {
          summary: {
            tick: engine.state.tick,
            actions: [{ action: { type: reply.action.type, actorId: body.npcId, targetId: "player" }, text: reply.action.text }],
            rejected: [],
            checksum: "story-action",
            clock: engine.state.clock,
          },
        });
      }
      this.checkArc();
      return json(200, { ...reply });
    }
    if (path === "/api/dialogue" && request.method === "POST") {
      if (!dialogueAvailable()) return json(200, { llm: false });
      if (this.rateLimited("dialogue")) return json(429, { error: "rate_limited" });
      const body = (await request.json().catch(() => null)) as { npcId?: unknown; text?: unknown; stream?: unknown } | null;
      const npcId = body?.npcId;
      const text = body?.text;
      if (typeof npcId !== "string" || typeof text !== "string" || !text.trim()) {
        return json(400, { error: "npcId and text are required" });
      }
      const trimmed = text.trim().slice(0, 500);
      if (body?.stream) {
        const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
        const writer = writable.getWriter();
        this.ctx.waitUntil(
          (async () => {
            let tokensSent = false;
            const onToken = (delta: string) => {
              tokensSent = true;
              void writer.write(this.encoder.encode(`event: token\ndata: ${JSON.stringify({ t: delta })}\n\n`));
            };
            let result = await generateDialogueReply(engine.state, npcId, trimmed, { onToken, historyKey });
            if (!result.ok && !tokensSent && !["unknown_npc", "npc_defeated", "npc_not_here"].includes(result.reason)) {
              result = await generateDialogueReply(engine.state, npcId, trimmed, { onToken, historyKey });
            }
            if (result.ok && result.action) {
              this.broadcast("tick", {
                summary: {
                  tick: engine.state.tick,
                  actions: [{ action: { type: result.action.type, actorId: npcId, targetId: "player" }, text: result.action.text }],
                  rejected: [],
                  checksum: "dialogue-action",
                  clock: engine.state.clock,
                },
              });
            }
            this.checkArc();
            const done = result.ok
              ? { llm: true, reply: result.reply, action: result.action ?? null, relationship: result.relationship }
              : { llm: true, error: result.reason };
            await writer.write(this.encoder.encode(`event: done\ndata: ${JSON.stringify(done)}\n\n`));
            await writer.close();
          })().catch(() => writer.close().catch(() => undefined))
        );
        return new Response(readable, { headers: SSE_HEADERS });
      }
      let result = await generateDialogueReply(engine.state, npcId, trimmed, { historyKey });
      if (!result.ok && !["unknown_npc", "npc_defeated", "npc_not_here"].includes(result.reason)) {
        result = await generateDialogueReply(engine.state, npcId, trimmed, { historyKey });
      }
      if (!result.ok) return json(200, { llm: true, error: result.reason });
      if (result.action) {
        this.broadcast("tick", {
          summary: {
            tick: engine.state.tick,
            actions: [{ action: { type: result.action.type, actorId: npcId, targetId: "player" }, text: result.action.text }],
            rejected: [],
            checksum: "dialogue-action",
            clock: engine.state.clock,
          },
        });
      }
      this.checkArc();
      return json(200, { llm: true, reply: result.reply, action: result.action ?? null, relationship: result.relationship });
    }
    if (path === "/api/arc/event" && request.method === "POST") {
      const body = (await request.json().catch(() => null)) as { kind?: unknown } | null;
      if (body?.kind === "spar_won") {
        const award = markSparWon(engine.state);
        if (award) {
          this.broadcast("tick", {
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
        this.checkArc();
        return json(200, { ok: true, arc: engine.state.arc ?? null, growth: engine.state.player.growth ?? null });
      }
      return json(400, { error: "unknown arc event" });
    }
    if (path === "/api/tick" && request.method === "POST") {
      if (this.rateLimited("tick")) return json(429, { error: "rate_limited" });
      const body = (await request.json().catch(() => null)) as { action?: PlayerAction } | null;
      try {
        const summary = await engine.tick(body?.action ?? undefined);
        this.checkArc();
        return json(200, { summary, state: engine.state });
      } catch (error) {
        return json(400, { error: (error as Error).message });
      }
    }

    return json(404, { error: "not_found" });
  }
}

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
