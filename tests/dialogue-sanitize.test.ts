import { describe, expect, test } from "vitest";

import { sanitizeReply } from "../src/dialogue-sanitize.ts";

describe("sanitizeReply", () => {
  test("strips a wrongly-prefixed player name (model ventriloquising the player)", () => {
    expect(sanitizeReply("Wanderer: I think they saw me, old man.", "Old Doran", "Wanderer")).toBe(
      "I think they saw me, old man."
    );
  });

  test("strips the npc's own name prefix", () => {
    expect(sanitizeReply("Old Doran: Hello there, traveler.", "Old Doran", "Wanderer")).toBe("Hello there, traveler.");
  });

  test("stops transcript continuation at the next speaker turn", () => {
    expect(
      sanitizeReply("Aye, I remember it well.\nWanderer: do you?\nOld Doran: I do indeed.", "Old Doran", "Wanderer")
    ).toBe("Aye, I remember it well.");
  });

  test("strips a generic Player:/You: label too", () => {
    expect(sanitizeReply("Player: what brings you here?", "Old Doran", "Wanderer")).toBe("what brings you here?");
  });

  test("strips wrapping quotes and keeps a clean line", () => {
    expect(sanitizeReply('"Just here to talk."', "Old Doran", "Wanderer")).toBe("Just here to talk.");
  });

  test("leaves a normal in-character line untouched", () => {
    const line = "The lanterns burn low tonight. Sit a while.";
    expect(sanitizeReply(line, "Old Doran", "Wanderer")).toBe(line);
  });
});
