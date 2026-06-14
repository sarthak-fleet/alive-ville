import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { retrieveRelevantMemories } from "../src/agents.ts";
import { cosineSimilarity } from "../src/llm/cosine.ts";
import type { Memory, World } from "../src/types.ts";

const fixture = (): World => JSON.parse(readFileSync(new URL("../worlds/village.json", import.meta.url), "utf8")) as World;

function withMemories(memories: Memory[], tick = 100): World {
  const world = fixture();
  world.tick = tick;
  world.npcs[0]!.memories = memories;
  return world;
}
const npcId = () => fixture().npcs[0]!.id;

describe("memory retrieval (Generative Agents scorer)", () => {
  test("relevance: a keyword match outranks a non-match", () => {
    const world = withMemories([
      { tick: 100, text: "Nothing of note happened by the river.", meta: { importance: 5 } },
      { tick: 100, text: "The player stole the blue ember from the forge.", meta: { importance: 5 } },
    ]);
    const top = retrieveRelevantMemories(world, npcId(), "ember", 2);
    expect(top[0]!.text).toContain("ember");
  });

  test("recency: among equal relevance, the more recent memory ranks higher", () => {
    const world = withMemories([
      { tick: 10, text: "The player visited the garden.", meta: { importance: 5 } },
      { tick: 99, text: "The player visited the garden.", meta: { importance: 5 } },
    ]);
    const top = retrieveRelevantMemories(world, npcId(), "garden", 2);
    expect(top[0]!.tick).toBe(99);
  });

  test("importance: among equal relevance and recency, higher importance ranks higher", () => {
    const world = withMemories([
      { tick: 100, text: "The player mentioned the forge.", meta: { importance: 2 } },
      { tick: 100, text: "The player threatened me at the forge.", meta: { importance: 9 } },
    ]);
    const top = retrieveRelevantMemories(world, npcId(), "forge", 2);
    expect(top[0]!.meta?.importance).toBe(9);
  });

  test("returns top-k by combined score even with no keyword hit (recency/importance fallback)", () => {
    const world = withMemories([
      { tick: 5, text: "An old faint thing.", meta: { importance: 1 } },
      { tick: 99, text: "A vivid recent thing.", meta: { importance: 8 } },
    ]);
    const top = retrieveRelevantMemories(world, npcId(), "unrelated-query-xyz", 1);
    expect(top).toHaveLength(1);
    expect(top[0]!.text).toBe("A vivid recent thing.");
  });
});

describe("semantic recall (embeddings)", () => {
  test("cosineSimilarity: identical=1, orthogonal=0", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([], [1])).toBe(0);
  });

  test("with a query embedding, the semantically-closest memory ranks first (no keyword overlap)", () => {
    const world = withMemories([
      { tick: 100, text: "aaa", meta: { importance: 5, embedding: [0, 1] } }, // orthogonal to query
      { tick: 100, text: "bbb", meta: { importance: 5, embedding: [0.95, 0.05] } }, // close to query
    ]);
    const top = retrieveRelevantMemories(world, npcId(), "zzz", 2, [1, 0]);
    expect(top[0]!.text).toBe("bbb");
  });
});
