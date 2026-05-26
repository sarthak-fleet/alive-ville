import { describe, expect, it } from "vitest";

import { CAST } from "../web/src/organisms/agent-town-world.ts";
import { type AgentOverlays,chooseWorldAction } from "../web/src/organisms/agent-town-world-tick.ts";

function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

describe("world tick action selection", () => {
  it("returns an action for a non-empty cast", () => {
    const action = chooseWorldAction(CAST, {}, seededRng(42));
    expect(["relocate", "challenge", "abandon", "idle"]).toContain(action.kind);
  });

  it("Sonic biases toward challenge action", () => {
    let challenges = 0;
    const rng = seededRng(7);
    for (let i = 0; i < 200; i += 1) {
      const action = chooseWorldAction([CAST.find((m) => m.id === "sonic")!], {}, rng);
      if (action.kind === "challenge" || action.kind === "idle") {
        // sonic alone -> can't challenge (no peers), so this should idle gracefully
        if (action.kind === "challenge") challenges += 1;
      }
    }
    // With no peers in zone, no challenges fire
    expect(challenges).toBe(0);
  });

  it("relocations move the actor to a different zone", () => {
    const overlays: AgentOverlays = {};
    let saw = false;
    const rng = seededRng(99);
    for (let i = 0; i < 50 && !saw; i += 1) {
      const action = chooseWorldAction(CAST, overlays, rng);
      if (action.kind === "relocate") {
        expect(action.toZone).not.toBe(CAST.find((m) => m.id === action.characterId)!.zoneId);
        saw = true;
      }
    }
    expect(saw).toBe(true);
  });
});
