import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it } from "vitest";

import { checkCoherence } from "../src/coherence.ts";
import { clearDialogueHistories, type DialogueCompleter, generateDialogueReply } from "../src/dialogue.ts";
import type { AgentGoal, Memory, Npc, World } from "../src/types.ts";

// ---------------------------------------------------------------------------
// World helpers
// ---------------------------------------------------------------------------

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

/** Minimal world with two named locations and one NPC. */
function makeWorld(npc: Npc, extraNpcs: Npc[] = []): World {
  const world = loadWorld();
  // Ensure deterministic location set for checks.
  world.locations = [
    { id: "loc_plaza", name: "Town Plaza", x: 0, y: 0, w: 10, h: 10 },
    { id: "loc_market", name: "Market", x: 20, y: 0, w: 10, h: 10 },
    { id: "loc_dojo", name: "Dojo", x: 40, y: 0, w: 10, h: 10 },
  ];
  world.exits = [
    { from: "loc_plaza", to: "loc_market", bidirectional: true },
    { from: "loc_market", to: "loc_dojo", bidirectional: true },
  ];
  world.player.locationId = "loc_plaza";
  world.npcs = [npc, ...extraNpcs];
  world.chronicle = [];
  return world;
}

function completerReturning(text: string): { complete: DialogueCompleter } {
  const complete: DialogueCompleter = (req) =>
    Promise.resolve({
      text,
      raw: text,
      meta: { tier: req.tier, model: "test", latencyMs: 1, error: null, jsonOk: false },
    });
  return { complete };
}

/** Completer that returns different text on first vs subsequent calls. */
function twoStepCompleter(first: string, second: string): DialogueCompleter {
  let count = 0;
  return (req) => {
    const text = count++ === 0 ? first : second;
    return Promise.resolve({
      text,
      raw: text,
      meta: { tier: req.tier, model: "test", latencyMs: 1, error: null, jsonOk: false },
    });
  };
}

beforeEach(() => clearDialogueHistories());

// ---------------------------------------------------------------------------
// checkCoherence — unit tests (no LLM)
// ---------------------------------------------------------------------------

describe("checkCoherence — location lie", () => {
  it("passes when the NPC makes no location claim", () => {
    const npc = makeNpc({ locationId: "loc_plaza" });
    const world = makeWorld(npc);
    const result = checkCoherence(world, npc, "Good morning, what brings you here?", { playerText: "Hello" });
    expect(result.ok).toBe(true);
  });

  it("passes when the NPC truthfully states their location", () => {
    const npc = makeNpc({ locationId: "loc_plaza" });
    const world = makeWorld(npc);
    const result = checkCoherence(world, npc, "I'm here in the Town Plaza as always.", { playerText: "Where are you?" });
    expect(result.ok).toBe(true);
  });

  it("flags an explicit false location claim", () => {
    const npc = makeNpc({ locationId: "loc_plaza" });
    const world = makeWorld(npc);
    // NPC is at plaza but claims to be at the Market
    const result = checkCoherence(world, npc, "I'm at the Market right now, come find me.", { playerText: "Where are you?" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations.some((v) => v.includes("Town Plaza"))).toBe(true);
      expect(result.hint).toContain("COHERENCE CORRECTION");
    }
  });
});

describe("checkCoherence — goal contradiction", () => {
  it("passes when the NPC has no harm goal", () => {
    const npc = makeNpc({ locationId: "loc_plaza" });
    const world = makeWorld(npc);
    const result = checkCoherence(world, npc, "I'm at peace with everyone here.", { playerText: "How are you?" });
    expect(result.ok).toBe(true);
  });

  it("flags claiming peace with the target of an active harm goal", () => {
    // The rival NPC — note targetId matches npc id, candidate uses their NAME.
    const rivalNpc: Npc = makeNpc({ id: "npc_rival", name: "Speed-o-Sound Sonic", locationId: "loc_dojo" });
    const harmGoal: AgentGoal = {
      id: "goal_1",
      title: "Eliminate the rival",
      kind: "harm",
      priority: 8,
      status: "active",
      targetId: "npc_rival",
    };
    const npc = makeNpc({ locationId: "loc_plaza", ambitions: [harmGoal] });
    const world = makeWorld(npc, [rivalNpc]);
    // Candidate uses the rival's real name (as an LLM would), not their id
    const result = checkCoherence(
      world, npc,
      "Speed-o-Sound Sonic and I are friends and I have no problem with them.",
      { playerText: "What's your relationship with Sonic?" }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations.some((v) => v.includes("harm"))).toBe(true);
    }
  });
});

describe("checkCoherence — presence lie", () => {
  it("flags claiming to be alone when another NPC is present", () => {
    const otherNpc = makeNpc({ id: "npc_other", name: "Saitama", locationId: "loc_plaza" });
    const npc = makeNpc({ locationId: "loc_plaza" });
    const world = makeWorld(npc, [otherNpc]);
    const result = checkCoherence(world, npc, "I am alone here with just you.", { playerText: "Who else is here?" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations.some((v) => v.includes("saitama") || v.includes("Saitama"))).toBe(true);
    }
  });

  it("passes when the NPC is actually alone with the player", () => {
    const npc = makeNpc({ locationId: "loc_plaza" });
    const world = makeWorld(npc); // no extraNpcs
    const result = checkCoherence(world, npc, "I am alone with you here.", { playerText: "Just us?" });
    expect(result.ok).toBe(true);
  });

  it("flags an absent NPC claimed as present", () => {
    // otherNpc is at a different location
    const otherNpc = makeNpc({ id: "npc_other", name: "Saitama", locationId: "loc_dojo" });
    const npc = makeNpc({ locationId: "loc_plaza" });
    const world = makeWorld(npc, [otherNpc]);
    const result = checkCoherence(world, npc, "Saitama is here with me right now.", { playerText: "Is Saitama here?" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations.some((v) => v.includes("Saitama"))).toBe(true);
    }
  });
});

describe("checkCoherence — denial of high-importance memory", () => {
  it("flags denying an event the NPC remembers with high importance", () => {
    const mem: Memory = {
      tick: 1,
      text: "I fought the monster at the bridge and nearly died.",
      meta: { importance: 7 },
    };
    const npc = makeNpc({ locationId: "loc_plaza", memories: [mem] });
    const world = makeWorld(npc);
    const result = checkCoherence(
      world, npc,
      "That never happened — I never fought any monster at the bridge.",
      { playerText: "Remember the bridge fight?" }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations.some((v) => v.includes("memory"))).toBe(true);
    }
  });

  it("passes when the memory is low-importance and the NPC denies it", () => {
    const mem: Memory = {
      tick: 1,
      text: "I ate lunch at noon.",
      meta: { importance: 1 },
    };
    const npc = makeNpc({ locationId: "loc_plaza", memories: [mem] });
    const world = makeWorld(npc);
    const result = checkCoherence(
      world, npc,
      "That never happened.",
      { playerText: "Did you eat?" }
    );
    expect(result.ok).toBe(true);
  });
});

describe("checkCoherence — identity / belief contradiction", () => {
  it("flags contradicting a standing reflection belief", () => {
    const beliefMem: Memory = {
      tick: 5,
      text: "I have always protected the weak — that is my purpose.",
      meta: { importance: 6, tags: ["reflection"] },
    };
    const npc = makeNpc({ locationId: "loc_plaza", memories: [beliefMem] });
    const world = makeWorld(npc);
    const result = checkCoherence(
      world, npc,
      "I never protected anyone weak, that is not who I am.",
      { playerText: "What do you believe in?" }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations.some((v) => v.includes("belief"))).toBe(true);
    }
  });

  it("passes when NPC affirms their standing belief", () => {
    const beliefMem: Memory = {
      tick: 5,
      text: "I have always protected the weak — that is my purpose.",
      meta: { importance: 6, tags: ["reflection"] },
    };
    const npc = makeNpc({ locationId: "loc_plaza", memories: [beliefMem] });
    const world = makeWorld(npc);
    const result = checkCoherence(
      world, npc,
      "I protect the weak — it is what I am here for.",
      { playerText: "What drives you?" }
    );
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integration tests — coherence check wired into generateDialogueReply
// ---------------------------------------------------------------------------

describe("generateDialogueReply coherence integration", () => {
  it("clean first pass: no chronicle event, no coherence-caught memory", async () => {
    const npc = makeNpc({ locationId: "loc_plaza" });
    const world = makeWorld(npc);
    const { complete } = completerReturning('Good to see you.@@{"action":null,"disposition":0}');
    const chronicleBefore = (world.chronicle ?? []).length;
    const result = await generateDialogueReply(world, npc.id, "Hello", { complete });
    expect(result.ok).toBe(true);
    // No coherence_caught chronicle event should have been added
    const caught = (world.chronicle ?? []).filter((e) => e.kind === "coherence_caught");
    expect(caught).toHaveLength(0);
    // Chronicle should not have grown (beyond any player_word)
    const chronicleAfter = (world.chronicle ?? []).length;
    expect(chronicleAfter).toBe(chronicleBefore);
  });

  it("retry succeeds: stamps exactly one coherence_caught chronicle event", async () => {
    // NPC is at loc_plaza; first reply falsely claims to be at the Market
    const npc = makeNpc({ locationId: "loc_plaza" });
    const world = makeWorld(npc);
    const incoherentReply = "I'm at the Market right now, so come find me there.@@{\"action\":null,\"disposition\":0}";
    const coherentRetry = "I am here at the plaza, happy to chat.@@{\"action\":null,\"disposition\":0}";
    const complete = twoStepCompleter(incoherentReply, coherentRetry);

    const result = await generateDialogueReply(world, npc.id, "Where are you?", { complete });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.reply).toContain("plaza");

    const caught = (world.chronicle ?? []).filter((e) => e.kind === "coherence_caught");
    expect(caught).toHaveLength(1);
    expect(caught[0]!.actorId).toBe(npc.id);

    const taggedMem = npc.memories.filter((m) => m.meta?.tags?.includes("coherence-caught"));
    expect(taggedMem).toHaveLength(1);
  });

  it("both attempts incoherent: returns deflection, stamps chronicle", async () => {
    const npc = makeNpc({ locationId: "loc_plaza" });
    const world = makeWorld(npc);
    const incoherent = "I'm at the Market right now.@@{\"action\":null,\"disposition\":0}";
    // Both attempts return an incoherent reply
    const complete = twoStepCompleter(incoherent, incoherent);

    const result = await generateDialogueReply(world, npc.id, "Where are you?", { complete });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.reply).toBe("I'd rather not talk about that right now.");

    const caught = (world.chronicle ?? []).filter((e) => e.kind === "coherence_caught");
    expect(caught).toHaveLength(1);
  });

  it("streaming path, both attempts fail: client receives deflection as single chunk", async () => {
    const npc = makeNpc({ locationId: "loc_plaza" });
    const world = makeWorld(npc);
    const incoherent = "I'm at the Market right now.@@{\"action\":null,\"disposition\":0}";
    const tokens: string[] = [];

    let llmCalls = 0;
    const complete: DialogueCompleter = (req) => {
      llmCalls++;
      req.onToken?.(incoherent);
      return Promise.resolve({
        text: incoherent,
        raw: incoherent,
        meta: { tier: req.tier, model: "test", latencyMs: 1, error: null, jsonOk: false },
      });
    };

    const result = await generateDialogueReply(world, npc.id, "Where are you?", {
      complete,
      onToken: (delta) => tokens.push(delta),
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.reply).toBe("I'd rather not talk about that right now.");
    // Two LLM calls: attempt 1 + retry
    expect(llmCalls).toBe(2);
    // Deflection is paced into chunks for typewriter effect; total joins to full line
    expect(tokens.join("")).toBe("I'd rather not talk about that right now.");
    const caught = (world.chronicle ?? []).filter((e) => e.kind === "coherence_caught");
    expect(caught).toHaveLength(1);
  });

  it("streaming path: coherence check fires; incoherent first pass does NOT emit tokens until retry", async () => {
    // On the streaming path, tokens are buffered and only flushed after coherence.
    const npc = makeNpc({ locationId: "loc_plaza" });
    const world = makeWorld(npc);
    const incoherentReply = "I'm at the Market right now.@@{\"action\":null,\"disposition\":0}";
    const coherentRetry = "I am here at the plaza, happy to chat.@@{\"action\":null,\"disposition\":0}";
    const tokens: string[] = [];

    let llmCalls = 0;
    const complete: DialogueCompleter = (req) => {
      llmCalls++;
      const text = llmCalls === 1 ? incoherentReply : coherentRetry;
      req.onToken?.(text);
      return Promise.resolve({
        text,
        raw: text,
        meta: { tier: req.tier, model: "test", latencyMs: 1, error: null, jsonOk: false },
      });
    };

    const result = await generateDialogueReply(world, npc.id, "Where are you?", {
      complete,
      onToken: (delta) => tokens.push(delta),
    });
    expect(result.ok).toBe(true);
    // Retry fired: two LLM calls total
    expect(llmCalls).toBe(2);
    // Coherence_caught chronicle event recorded
    const caught = (world.chronicle ?? []).filter((e) => e.kind === "coherence_caught");
    expect(caught).toHaveLength(1);
    // Tokens received by the client come from the retry (coherent reply), not attempt 1
    const joined = tokens.join("");
    expect(joined).toContain("plaza");
    expect(joined).not.toContain("Market");
  });
});
