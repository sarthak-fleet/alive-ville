import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it } from "vitest";

import { clearDialogueHistories, type DialogueCompleter, generateDialogueReply } from "../src/dialogue.ts";
import type { Npc, World } from "../src/types.ts";

function loadWorld(): World {
  return JSON.parse(readFileSync(new URL("../worlds/one-punch-man.json", import.meta.url), "utf8")) as World;
}

function makeNpc(overrides: Partial<Npc> = {}): Npc {
  return {
    id: "npc_test",
    name: "Genos",
    locationId: "loc_plaza",
    relationships: {},
    memories: [],
    ...overrides,
  };
}

function makeWorld(npc: Npc): World {
  const world = loadWorld();
  world.locations = [
    { id: "loc_plaza", name: "Town Plaza", x: 0, y: 0, w: 10, h: 10 },
    { id: "loc_market", name: "Market", x: 20, y: 0, w: 10, h: 10 },
  ];
  world.exits = [{ from: "loc_plaza", to: "loc_market", bidirectional: true }];
  world.player.locationId = "loc_plaza";
  world.npcs = [npc];
  world.chronicle = [];
  return world;
}

// Incoherent reply: NPC at plaza claims to be at Market — triggers coherence retry
const INCOHERENT = "I'm at the Market right now, come find me there.@@{\"action\":null,\"disposition\":0}";
const COHERENT = "I am right here at the plaza, good to see you.@@{\"action\":null,\"disposition\":0}";

beforeEach(() => clearDialogueHistories());

describe("dialogue stream abort — pre-retry cancellation", () => {
  it("aborted before coherence retry: returns cancelled, no second LLM call", async () => {
    const npc = makeNpc({ locationId: "loc_plaza" });
    const world = makeWorld(npc);

    const controller = new AbortController();
    let llmCalls = 0;

    const complete: DialogueCompleter = (req) => {
      llmCalls++;
      if (llmCalls === 1) {
        // Abort after first call completes (before retry fires)
        controller.abort();
      }
      return Promise.resolve({
        text: INCOHERENT,
        raw: INCOHERENT,
        meta: { tier: req.tier, model: "test", latencyMs: 1, error: null, jsonOk: false },
      });
    };

    const result = await generateDialogueReply(world, npc.id, "Where are you?", {
      complete,
      signal: controller.signal,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("cancelled");
    // No second LLM call after abort
    expect(llmCalls).toBe(1);
    // No coherence_caught chronicle since retry never ran
    const caught = (world.chronicle ?? []).filter((e) => e.kind === "coherence_caught");
    expect(caught).toHaveLength(0);
  });
});

describe("dialogue stream abort — pre-existing abort signal", () => {
  it("signal already aborted before retry: returns cancelled immediately", async () => {
    const npc = makeNpc({ locationId: "loc_plaza" });
    const world = makeWorld(npc);

    const controller = new AbortController();
    let llmCalls = 0;

    const complete: DialogueCompleter = (req) => {
      llmCalls++;
      // Abort before returning so signal.aborted is true when coherence check runs
      controller.abort();
      return Promise.resolve({
        text: INCOHERENT,
        raw: INCOHERENT,
        meta: { tier: req.tier, model: "test", latencyMs: 1, error: null, jsonOk: false },
      });
    };

    const result = await generateDialogueReply(world, npc.id, "Where are you?", {
      complete,
      signal: controller.signal,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("cancelled");
    expect(llmCalls).toBe(1);
  });
});

describe("dialogue stream abort — mid-pacedFlush cancellation", () => {
  it("abort mid-flush: onToken stops receiving after abort", async () => {
    const npc = makeNpc({ locationId: "loc_plaza" });
    const world = makeWorld(npc);

    const controller = new AbortController();
    const tokens: string[] = [];

    const complete: DialogueCompleter = (req) => {
      // Return coherent reply — no coherence retry, goes straight to pacedFlush
      req.onToken?.(COHERENT);
      return Promise.resolve({
        text: COHERENT,
        raw: COHERENT,
        meta: { tier: req.tier, model: "test", latencyMs: 1, error: null, jsonOk: false },
      });
    };

    // Abort after receiving the first token chunk
    let aborted = false;
    const onToken = (delta: string) => {
      tokens.push(delta);
      if (!aborted) {
        aborted = true;
        controller.abort();
      }
    };

    const result = await generateDialogueReply(world, npc.id, "Hello", {
      complete,
      onToken,
      signal: controller.signal,
    });

    // Result is cancelled (abort happened during flush)
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("cancelled");

    // Only the first chunk was emitted; subsequent chunks were suppressed
    expect(tokens.length).toBeGreaterThanOrEqual(1);
    // Full reply text is longer than one chunk — abort cut it short
    const fullReply = "I am right here at the plaza, good to see you.";
    expect(tokens.join("").length).toBeLessThan(fullReply.length);
  });
});

describe("dialogue abort — coherence_caught recorded when retry fires before abort", () => {
  it("abort after retry resolves: chronicle still records coherence_caught", async () => {
    const npc = makeNpc({ locationId: "loc_plaza" });
    const world = makeWorld(npc);

    const controller = new AbortController();
    let llmCalls = 0;

    const complete: DialogueCompleter = (req) => {
      llmCalls++;
      const text = llmCalls === 1 ? INCOHERENT : COHERENT;
      return Promise.resolve({
        text,
        raw: text,
        meta: { tier: req.tier, model: "test", latencyMs: 1, error: null, jsonOk: false },
      });
    };

    // Abort just before pacedFlush runs (signal aborted before onToken callback)
    // We do this by aborting synchronously after the second LLM call
    const originalComplete = complete;
    let secondCallDone = false;
    const wrappedComplete: DialogueCompleter = async (req) => {
      const res = await originalComplete(req);
      if (llmCalls === 2 && !secondCallDone) {
        secondCallDone = true;
        controller.abort();
      }
      return res;
    };

    const tokens: string[] = [];
    const result = await generateDialogueReply(world, npc.id, "Where are you?", {
      complete: wrappedComplete,
      onToken: (delta) => tokens.push(delta),
      signal: controller.signal,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("cancelled");
    // Retry fired, so chronicle should have recorded coherence_caught
    const caught = (world.chronicle ?? []).filter((e) => e.kind === "coherence_caught");
    expect(caught).toHaveLength(1);
    // No tokens should have been emitted since abort happened before flush
    expect(tokens).toHaveLength(0);
  });
});
