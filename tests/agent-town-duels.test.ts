import { describe, expect, it } from "vitest";

import { DUEL_OPPONENTS, opponentForCharacter } from "../web/src/organisms/agent-town-duels.ts";

describe("agent town duel registry", () => {
  it("registers Sonic, Bang, and Garou as duel-able", () => {
    expect(Object.keys(DUEL_OPPONENTS).sort()).toEqual(["bang", "garou", "sonic"]);
  });

  it("returns a profile for known characters and null for everyone else", () => {
    expect(opponentForCharacter("sonic")?.name).toBe("Sonic");
    expect(opponentForCharacter("bang")?.name).toBe("Bang");
    expect(opponentForCharacter("garou")?.name).toBe("Garou");
    expect(opponentForCharacter("saitama")).toBeNull();
    expect(opponentForCharacter("unknown")).toBeNull();
  });

  it("each opponent has at least three moves and a positive HP pool", () => {
    for (const opponent of Object.values(DUEL_OPPONENTS)) {
      expect(opponent.moves.length).toBeGreaterThanOrEqual(3);
      expect(opponent.maxHp).toBeGreaterThan(0);
      expect(opponent.damageMin).toBeLessThanOrEqual(opponent.damageMax);
    }
  });
});
