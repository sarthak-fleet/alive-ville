import { type ChildProcess,spawn } from "node:child_process";
import { readFileSync } from "node:fs";

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

      const pkgRes = await fetch(`http://localhost:${port}/api/story-package`);
      expect(pkgRes.status).toBe(200);
      const pkg = (await pkgRes.json()) as { package: { worldId: string; assets: { cutscenes: unknown[] } }; issues: unknown[] };
      expect(pkg.package.worldId).toBe("ashbend");
      expect(pkg.issues).toEqual([]);
      expect(Array.isArray(pkg.package.assets.cutscenes)).toBe(true);

      const importRes = await fetch(`http://localhost:${port}/api/import-story-package`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(pkg.package),
      });
      expect(importRes.status).toBe(200);
      const imported = (await importRes.json()) as { state: { id: string; tick: number; player: { locationId: string } } };
      expect(imported.state.id).toBe("ashbend");
      expect(imported.state.tick).toBe(0);
      expect(imported.state.player.locationId).toBe("square");

      const animeSource = JSON.parse(readFileSync(new URL("../fixtures/anime/opm-ingest-source.json", import.meta.url), "utf8")) as unknown;
      const animeRes = await fetch(`http://localhost:${port}/api/import-world-source`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: animeSource }),
      });
      expect(animeRes.status).toBe(200);
      const animeImported = (await animeRes.json()) as { state: { id: string; name: string; npcs: Array<{ name: string }> } };
      expect(animeImported.state.id).toBe("opm_ingested_z_city");
      expect(animeImported.state.name).toBe("One Punch Man Playable Slice");
      expect(animeImported.state.npcs.map((npc) => npc.name)).toContain("Saitama");

      const loopStatus = await fetch(`http://localhost:${port}/api/agent-loop/status`);
      expect(loopStatus.status).toBe(200);
      const statusBody = (await loopStatus.json()) as { state: string; ticksRun: number };
      expect(statusBody).toMatchObject({ state: "idle", ticksRun: 0 });

      const stepRes = await fetch(`http://localhost:${port}/api/agent-loop/step`, { method: "POST" });
      expect(stepRes.status).toBe(200);
      const stepBody = (await stepRes.json()) as { status: { ticksRun: number }; state: { tick: number } };
      expect(stepBody.status.ticksRun).toBe(1);
      expect(stepBody.state.tick).toBe(1);

      const html = await fetch(`http://localhost:${port}/`);
      expect(html.status).toBe(200);
      expect(await html.text()).toMatch(/Ashbend Village/);
    } finally {
      child.kill();
    }
  });
});
