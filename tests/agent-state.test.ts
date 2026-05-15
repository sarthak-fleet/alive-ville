import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { planAgentIntent, retrieveRelevantMemories } from "../src/agents.ts";
import { applyAction, createEngine } from "../src/simulation.ts";
import type { World } from "../src/types.ts";

const fixture = (): World => JSON.parse(readFileSync(new URL("../worlds/village.json", import.meta.url), "utf8")) as World;

describe("Agent State v1", () => {
  test("engine initializes mood, needs, memory metadata, relationship axes, and current intent", () => {
    const engine = createEngine(fixture(), { propose: async () => [] });
    const mira = engine.npc("mira")!;

    expect(mira.mood?.emotion).toBe("worried");
    expect(mira.needs?.duty).toBeGreaterThan(70);
    expect(mira.relationshipAxes?.["tomas"]?.suspicion).toBeGreaterThan(0);
    expect(mira.plan?.currentIntent?.kind).toBe("help");
    expect(mira.memories[0]?.meta?.importance).toBeGreaterThan(0);
  });

  test("memory retrieval uses tags, importance, emotion, and recency", () => {
    const engine = createEngine(fixture(), { propose: async () => [] });
    const memories = retrieveRelevantMemories(engine.state, "pax", "bridge whisper secret bright pieces", 2);

    expect(memories[0]?.text).toMatch(/bright pieces/);
    expect(memories[0]?.score).toBeGreaterThan(memories[1]?.score ?? 0);
  });

  test("villain plan creates an escalation intent without making the villain omniscient", () => {
    const world = fixture();
    const pax = world.npcs.find((npc) => npc.id === "pax")!;
    const intent = planAgentIntent(world, pax);

    expect(intent.kind).toBe("escalate");
    expect(intent.reason).toMatch(/hidden plan/i);
    expect(intent.targetId).toBe("bridge_whisper_plan");
  });

  test("new memories written by actions get metadata and become retrievable", () => {
    const world = fixture();
    const result = applyAction(world, { type: "talk", actorId: "player", targetId: "lena", text: "The bridge is unsafe after sundown." });

    expect(result.applied).toBe(true);
    const latest = world.npcs.find((npc) => npc.id === "lena")?.memories.at(-1);
    expect(latest?.meta?.tags).toContain("bridge");
    expect(retrieveRelevantMemories(world, "lena", "bridge unsafe", 1)[0]?.text).toMatch(/bridge is unsafe/);
  });
});
