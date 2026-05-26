import { describe, expect, it } from "vitest";

import { pickGossip } from "../web/src/organisms/agent-town-gossip.ts";
import { type MemoryStore, recordDuelOutcome, recordItemGiven } from "../web/src/organisms/agent-town-memory.ts";
import { CAST } from "../web/src/organisms/agent-town-world.ts";

const speaker = CAST.find((member) => member.id === "child_emperor")!;
const listener = CAST.find((member) => member.id === "sonic")!;
const fubuki = CAST.find((member) => member.id === "fubuki")!;
const king = CAST.find((member) => member.id === "king")!;

describe("agent-town gossip", () => {
  it("propagates a witnessed Sonic defeat into gossip and the listener's memory", () => {
    const memories: MemoryStore = recordDuelOutcome({}, "sonic", "victory", "alley", 1);
    const exchange = pickGossip(speaker, listener, { cast: CAST, memories, now: 100 });
    expect(exchange.speakerLine).toMatch(/Sonic/i);
    expect(exchange.observationForListener).toMatchObject({
      kind: "saw-defeat",
      subject: "sonic",
      note: /Child Emperor/,
    });
  });

  it("references a delivered item when no defeats are known", () => {
    const memories: MemoryStore = recordItemGiven({}, fubuki.id, "Grocery coupon", 1);
    const exchange = pickGossip(fubuki, king, { cast: CAST, memories, now: 2 });
    expect(exchange.speakerLine).toMatch(/Grocery coupon/);
    expect(exchange.observationForListener?.kind).toBe("asked-about");
  });

  it("falls back to role-flavored banter with no memories", () => {
    const exchange = pickGossip(king, fubuki, { cast: CAST, memories: {}, now: 3 });
    expect(exchange.speakerLine.length).toBeGreaterThan(0);
    expect(exchange.observationForListener).toBeNull();
  });
});
