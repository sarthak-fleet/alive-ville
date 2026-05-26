import { describe, expect, it } from "vitest";

import { type Initiative,initiativeCompleted } from "../web/src/organisms/agent-town-initiatives.ts";

function makeInitiative(overrides: Partial<Initiative>): Initiative {
  return {
    id: "i1",
    kind: "talk-to",
    text: "go",
    createdAt: 0,
    source: "deterministic",
    ...overrides,
  };
}

describe("initiatives", () => {
  it("talk-to is completed only by talking to the matching NPC", () => {
    const init = makeInitiative({ kind: "talk-to", targetCharacterId: "mumen" });
    expect(initiativeCompleted(init, { kind: "talked", characterId: "mumen" })).toBe(true);
    expect(initiativeCompleted(init, { kind: "talked", characterId: "sonic" })).toBe(false);
    expect(initiativeCompleted(init, { kind: "entered-zone", zoneId: "hq" })).toBe(false);
  });

  it("visit-zone is completed by entering that zone", () => {
    const init = makeInitiative({ kind: "visit-zone", targetZoneId: "alley" });
    expect(initiativeCompleted(init, { kind: "entered-zone", zoneId: "alley" })).toBe(true);
    expect(initiativeCompleted(init, { kind: "entered-zone", zoneId: "hq" })).toBe(false);
  });

  it("win-duel without a target matches any duel win", () => {
    const init = makeInitiative({ kind: "win-duel" });
    expect(initiativeCompleted(init, { kind: "won-duel", opponentId: "bang" })).toBe(true);
  });

  it("win-duel with a target only matches the named opponent", () => {
    const init = makeInitiative({ kind: "win-duel", targetCharacterId: "sonic" });
    expect(initiativeCompleted(init, { kind: "won-duel", opponentId: "sonic" })).toBe(true);
    expect(initiativeCompleted(init, { kind: "won-duel", opponentId: "garou" })).toBe(false);
  });
});
