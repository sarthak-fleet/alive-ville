export { GameSessionDO } from "./session-do.ts";

interface Env {
  SESSIONS: DurableObjectNamespace;
  ASSETS: Fetcher;
  MAX_BODY_BYTES?: string;
}

const MAX_BODY_BYTES = 1_500_000;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // the game lives under /game (aliveville.com root is the landing site)
    if (url.pathname === "/" || url.pathname === "/game") {
      return Response.redirect(new URL("/game/", url).toString(), 302);
    }
    if (url.pathname.startsWith("/game/api/")) {
      const length = Number(request.headers.get("content-length") ?? 0);
      if (length > MAX_BODY_BYTES) {
        return new Response(JSON.stringify({ error: "payload_too_large" }), {
          status: 413,
          headers: { "content-type": "application/json" },
        });
      }
      const raw = url.searchParams.get("session") ?? request.headers.get("x-session-id") ?? "main";
      const sessionId = /^[a-zA-Z0-9_-]{1,48}$/.test(raw) ? raw : "main";
      const stub = env.SESSIONS.get(env.SESSIONS.idFromName(sessionId));
      // the session DO speaks /api/* — strip the mount prefix
      url.pathname = url.pathname.slice("/game".length);
      return stub.fetch(new Request(url.toString(), request));
    }
    return env.ASSETS.fetch(request);
  },
};
