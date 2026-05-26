import { describe, expect, it } from "vitest";

import {
  type MemoryStore,
  reactionFor,
  recordDuelOutcome,
  recordItemGiven,
  recordTalk,
  summarizeMemoryForPrompt,
} from "../web/src/organisms/agent-town-memory.ts";
import { CAST } from "../web/src/organisms/agent-town-world.ts";

const mumen = CAST.find((member) => member.id === "mumen")!;
const saitama = CAST.find((member) => member.id === "saitama")!;
const sonic = CAST.find((member) => member.id === "sonic")!;
const fubuki = CAST.find((member) => member.id === "fubuki")!;

describe("agent-town memory", () => {
  it("records a talk and bumps the count", () => {
    let store: MemoryStore = {};
    store = recordTalk(store, saitama.id, 100);
    store = recordTalk(store, saitama.id, 200);
    expect(store[saitama.id]?.talkCount).toBe(2);
    expect(store[saitama.id]?.lastSeenAt).toBe(200);
  });

  it("propagates duel outcomes to NPCs in the same zone (not the opponent themselves twice)", () => {
    const store = recordDuelOutcome({}, sonic.id, "victory", sonic.zoneId, 1);
    expect(store[sonic.id]?.observations[0]).toMatchObject({ kind: "lost-duel" });
    // Child Emperor is in the alley zone with Sonic
    expect(store["child_emperor"]?.observations[0]).toMatchObject({ kind: "saw-defeat", subject: "sonic", note: "player won" });
    // Mumen is in HQ zone — should NOT have heard
    expect(store[mumen.id]).toBeUndefined();
  });

  it("records gifted items against the recipient", () => {
    const store = recordItemGiven({}, saitama.id, "Grocery coupon", 5);
    expect(store[saitama.id]?.observations[0]).toMatchObject({ kind: "gave-item", subject: "Grocery coupon" });
  });

  it("reactionFor returns a memory line when the NPC has heard about a defeat", () => {
    let store: MemoryStore = recordDuelOutcome({}, sonic.id, "victory", sonic.zoneId, 1);
    const childEmperor = CAST.find((member) => member.id === "child_emperor")!;
    const reaction = reactionFor(childEmperor, store[childEmperor.id]!);
    expect(reaction?.line).toMatch(/Sonic/i);

    // After many talks, the talk-fatigue line should kick in for someone with no observations
    store = recordTalk(recordTalk(recordTalk({}, fubuki.id, 1), fubuki.id, 2), fubuki.id, 3);
    const fubukiReaction = reactionFor(fubuki, store[fubuki.id]!);
    expect(fubukiReaction?.line).toMatch(/Back again|Anything new/);
  });

  it("summarizeMemoryForPrompt mentions concrete past events", () => {
    let store: MemoryStore = recordTalk({}, saitama.id, 1);
    store = recordItemGiven(store, saitama.id, "Grocery coupon", 2);
    const summary = summarizeMemoryForPrompt(saitama, store[saitama.id]!);
    expect(summary).toMatch(/talked/);
    expect(summary).toMatch(/Grocery coupon/);
  });
});
