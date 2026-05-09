import { type ChildProcess,spawn } from "node:child_process";

import { describe, expect, test } from "vitest";

const SERVER = new URL("../src/server.ts", import.meta.url).pathname;
const TSX = new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url).pathname;

function startServer(port: number): Promise<ChildProcess> {
  const child = spawn(process.execPath, [TSX, SERVER], {
    env: { ...process.env, PORT: String(port), LLM_API_KEY: "", LLM_BASE_URL: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    const onData = (data: Buffer) => {
      if (data.toString().includes("running at")) {
        child.stdout?.off("data", onData);
        resolve(child);
      }
    };
    child.stdout?.on("data", onData);
    child.on("error", reject);
    setTimeout(() => reject(new Error("server start timeout")), 6000);
  });
}

describe("server", () => {
  test("exposes state and accepts tick actions", async () => {
    const port = 5200 + Math.floor(Math.random() * 200);
    const child = await startServer(port);
    try {
      const stateRes = await fetch(`http://localhost:${port}/api/state`);
      expect(stateRes.status).toBe(200);
      const state = (await stateRes.json()) as { id: string; npcs: unknown[] };
      expect(state.id).toBe("ashbend");
      expect(Array.isArray(state.npcs)).toBe(true);

      const tickRes = await fetch(`http://localhost:${port}/api/tick`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: { type: "talk", targetId: "lena", text: "hello" } }),
      });
      expect(tickRes.status).toBe(200);
      const body = (await tickRes.json()) as { summary: { tick: number; actions: { action: { type: string } }[] } };
      expect(body.summary.tick).toBe(1);
      expect(body.summary.actions.some((entry) => entry.action.type === "talk")).toBe(true);

      const html = await fetch(`http://localhost:${port}/`);
      expect(html.status).toBe(200);
      expect(await html.text()).toMatch(/Ashbend Village/);
    } finally {
      child.kill();
    }
  });
});
