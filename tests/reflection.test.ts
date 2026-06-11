import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it } from "vitest";

import { clearDialogueHistories, type DialogueCompleter, generateDialogueReply } from "../src/dialogue.ts";
import type { CompleteTextResult } from "../src/llm/router.ts";
import { reflectionDue, reflectNpc, reflectNpcScripted } from "../src/reflection.ts";
import type { Npc, World } from "../src/types.ts";

function loadWorld(): World {
  return JSON.parse(readFileSync(new URL("../worlds/one-punch-man.json", import.meta.url), "utf8")) as World;
}

function npcWithPlayer(world: World): Npc {
  return world.npcs.find((n) => n.locationId === world.player.locationId)!;
}

function completerReturning(text: string): {
  calls: Array<{ system: string; user: string }>;
  complete: DialogueCompleter;
} {
  const calls: Array<{ system: string; user: string }> = [];
  return {
    calls,
    complete: (req) => {
      calls.push({ system: req.system, user: req.user });
      return Promise.resolve({ text, raw: text, meta: { tier: req.tier, model: "test", latencyMs: 1, error: null, jsonOk: false } });
    },
  };
}

function makeCompleteText(
  text: string
): { calls: Array<{ system: string; user: string }>; fn: (req: { tier: string; system: string; user: string; timeoutMs?: number; model?: string }) => Promise<CompleteTextResult> } {
  const calls: Array<{ system: string; user: string }> = [];
  return {
    calls,
    fn: (req) => {
      calls.push({ system: req.system, user: req.user });
      return Promise.resolve({
        text,
        raw: text,
        meta: { tier: "normal" as const, model: "test", latencyMs: 1, error: null, jsonOk: false },
      });
    },
  };
}

function makeFailingCompleteText(): (req: { tier: string; system: string; user: string; timeoutMs?: number; model?: string }) => Promise<CompleteTextResult> {
  return (_req) =>
    Promise.resolve({
      error: "timeout",
      meta: { tier: "normal" as const, model: "test", latencyMs: 1, error: "timeout", jsonOk: false },
    });
}

function makeNpc(overrides: Partial<Npc> = {}): Npc {
  return {
    id: "npc_test",
    name: "Test NPC",
    locationId: "loc_1",
    relationships: {},
    memories: [],
    ...overrides,
  };
}

function makeWorld(npc: Npc): World {
  const world = loadWorld();
  world.npcs = [npc, ...world.npcs.filter((n) => n.id !== npc.id)];
  return world;
}

beforeEach(() => clearDialogueHistories());

// ---------------------------------------------------------------------------
// reflectionDue
// ---------------------------------------------------------------------------

describe("reflectionDue", () => {
  it("returns false when total importance is below threshold", () => {
    const npc = makeNpc({
      memories: [
        { tick: 1, text: "saw a bird", meta: { importance: 3 } },
        { tick: 2, text: "ate lunch", meta: { importance: 2 } },
      ],
    });
    expect(reflectionDue(npc, 10)).toBe(false);
  });

  it("returns true when importance sum meets or exceeds 24", () => {
    const npc = makeNpc({
      memories: [
        { tick: 1, text: "bridge collapsed", meta: { importance: 7 } },
        { tick: 2, text: "stranger betrayed trust", meta: { importance: 7 } },
        { tick: 3, text: "lost a fight", meta: { importance: 6 } },
        { tick: 4, text: "found evidence", meta: { importance: 4 } },
      ],
    });
    expect(reflectionDue(npc, 10)).toBe(true);
  });

  it("only counts memories after lastReflectionTick", () => {
    const npc = makeNpc({
      plan: { lastReflectionTick: 5 },
      memories: [
        // these are at or before lastReflectionTick — should NOT count
        { tick: 3, text: "old memory A", meta: { importance: 7 } },
        { tick: 5, text: "old memory B", meta: { importance: 7 } },
        // these are after — only adds up to 10, below threshold
        { tick: 6, text: "new memory C", meta: { importance: 5 } },
        { tick: 7, text: "new memory D", meta: { importance: 5 } },
      ],
    });
    expect(reflectionDue(npc, 10)).toBe(false);
  });

  it("treats memories with undefined importance as 0", () => {
    const npc = makeNpc({
      memories: [
        { tick: 1, text: "vague feeling" },
        { tick: 2, text: "another vague feeling" },
      ],
    });
    // no importance → sum = 0, never due
    expect(reflectionDue(npc, 10)).toBe(false);
  });

  it("counts all memories when lastReflectionTick is undefined (fresh NPC)", () => {
    const npc = makeNpc({
      memories: [
        { tick: 1, text: "event A", meta: { importance: 7 } },
        { tick: 2, text: "event B", meta: { importance: 7 } },
        { tick: 3, text: "event C", meta: { importance: 7 } },
        { tick: 4, text: "event D", meta: { importance: 3 } },
      ],
    });
    expect(reflectionDue(npc, 10)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// reflectNpc (LLM path)
// ---------------------------------------------------------------------------

describe("reflectNpc", () => {
  it("appends a reflection memory and updates lastReflectionTick on success", async () => {
    const insight = "I no longer trust the bridge at night.";
    const npc = makeNpc({
      memories: [
        { tick: 1, text: "saw someone fall off bridge", meta: { importance: 7 } },
        { tick: 2, text: "bridge groaned underfoot", meta: { importance: 7 } },
        { tick: 3, text: "a stranger warned me", meta: { importance: 7 } },
        { tick: 4, text: "felt unsafe crossing at dusk", meta: { importance: 3 } },
      ],
    });
    const world = makeWorld(npc);
    world.tick = 10;
    const before = npc.memories.length;

    const { fn } = makeCompleteText(insight);
    const result = await reflectNpc(world, npc, fn as never);

    expect(result).toBe(insight);
    expect(npc.memories.length).toBe(before + 1);
    const pushed = npc.memories.at(-1)!;
    expect(pushed.text).toBe(insight);
    expect(pushed.tick).toBe(10);
    expect(pushed.meta?.tags).toContain("reflection");
    expect(pushed.meta?.visibility).toBe("private");
    expect(pushed.meta?.importance).toBe(5);
    expect(npc.plan?.lastReflectionTick).toBe(10);
  });

  it("returns null and does NOT update lastReflectionTick on LLM failure", async () => {
    const npc = makeNpc({
      memories: [
        { tick: 1, text: "event A", meta: { importance: 7 } },
        { tick: 2, text: "event B", meta: { importance: 7 } },
        { tick: 3, text: "event C", meta: { importance: 7 } },
        { tick: 4, text: "event D", meta: { importance: 3 } },
      ],
    });
    const world = makeWorld(npc);
    world.tick = 10;
    const beforeLen = npc.memories.length;

    const result = await reflectNpc(world, npc, makeFailingCompleteText() as never);

    expect(result).toBeNull();
    expect(npc.memories.length).toBe(beforeLen);
    expect(npc.plan?.lastReflectionTick).toBeUndefined();
  });

  it("returns null and does NOT update tick on skipped result (no LLM)", async () => {
    const npc = makeNpc({ memories: [{ tick: 1, text: "event", meta: { importance: 7 } }] });
    const world = makeWorld(npc);
    world.tick = 5;
    const skippingFn = (_req: unknown) =>
      Promise.resolve({ skipped: true as const, reason: "no LLM_API_KEY" });

    const result = await reflectNpc(world, npc, skippingFn as never);
    expect(result).toBeNull();
    expect(npc.plan?.lastReflectionTick).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// reflectNpcScripted (deterministic fallback)
// ---------------------------------------------------------------------------

describe("reflectNpcScripted", () => {
  it("picks the two highest-importance memories and templates an insight", () => {
    const npc = makeNpc({
      memories: [
        { tick: 1, text: "low importance thing", meta: { importance: 1 } },
        { tick: 2, text: "very important event", meta: { importance: 7 } },
        { tick: 3, text: "also important", meta: { importance: 6 } },
      ],
    });
    const world = makeWorld(npc);
    world.tick = 10;

    const result = reflectNpcScripted(world, npc);
    expect(result).not.toBeNull();
    expect(result).toContain("very important event");
    expect(result).toContain("also important");
    expect(result).toContain("Thinking on it:");
    expect(npc.memories.at(-1)?.meta?.tags).toContain("reflection");
    expect(npc.plan?.lastReflectionTick).toBe(10);
  });

  it("works with only one qualifying memory", () => {
    const npc = makeNpc({
      memories: [{ tick: 1, text: "the only event", meta: { importance: 7 } }],
    });
    const world = makeWorld(npc);
    world.tick = 5;

    const result = reflectNpcScripted(world, npc);
    expect(result).not.toBeNull();
    expect(result).toContain("the only event");
    expect(npc.plan?.lastReflectionTick).toBe(5);
  });

  it("returns null and does not push memory when no qualifying memories exist", () => {
    const npc = makeNpc({
      plan: { lastReflectionTick: 10 },
      memories: [
        // these are all at or before lastReflectionTick
        { tick: 5, text: "old", meta: { importance: 7 } },
        { tick: 10, text: "also old", meta: { importance: 7 } },
      ],
    });
    const world = makeWorld(npc);
    world.tick = 15;
    const before = npc.memories.length;

    const result = reflectNpcScripted(world, npc);
    expect(result).toBeNull();
    expect(npc.memories.length).toBe(before);
    expect(npc.plan?.lastReflectionTick).toBe(10); // unchanged
  });
});

// ---------------------------------------------------------------------------
// Dialogue anchoring: STANDING BELIEFS in buildDialogueSystem
// ---------------------------------------------------------------------------

describe("dialogue anchoring — STANDING BELIEFS block", () => {
  it("system prompt contains STANDING BELIEFS and not-obliged instruction", async () => {
    const world = loadWorld();
    const npc = npcWithPlayer(world);
    const { calls, complete } = completerReturning('{"reply":"Indeed.","action":null,"disposition":0}');

    await generateDialogueReply(world, npc.id, "Hello", { complete });

    expect(calls[0]!.system).toContain("STANDING BELIEFS");
    expect(calls[0]!.system).toContain("not obliged to agree");
  });

  it("system prompt includes reflection insights when the NPC has reflection memories", async () => {
    const world = loadWorld();
    const npc = npcWithPlayer(world);
    const insight = "I no longer trust the bridge at night.";
    npc.memories.push({
      tick: world.tick,
      text: insight,
      meta: { importance: 5, visibility: "private", tags: ["reflection"] },
    });

    const { calls, complete } = completerReturning('{"reply":"Be careful.","action":null,"disposition":0}');
    await generateDialogueReply(world, npc.id, "What do you think?", { complete });

    expect(calls[0]!.system).toContain(insight);
  });

  it("system prompt includes speech style in the STANDING BELIEFS block", async () => {
    const world = loadWorld();
    const npc = npcWithPlayer(world);
    if (!npc.traits) npc.traits = {};
    npc.traits.speechStyle = "terse, blunt";

    const { calls, complete } = completerReturning('{"reply":"Fine.","action":null,"disposition":0}');
    await generateDialogueReply(world, npc.id, "Hello", { complete });

    // the STANDING BELIEFS block interpolates the speech style
    expect(calls[0]!.system).toContain("terse, blunt");
  });
});
