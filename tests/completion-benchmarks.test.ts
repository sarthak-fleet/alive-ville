import { describe, expect, test } from "vitest";

import { assertCompletionTarget, projectCompletionBenchmarks } from "../src/completion-benchmarks.ts";

describe("internal completion benchmarks", () => {
  test("scores at least 80% across the five project metrics", () => {
    const benchmarks = projectCompletionBenchmarks();

    expect(benchmarks.map((benchmark) => benchmark.id)).toEqual([
      "lore_ingestion",
      "character_simulation",
      "narrative_director",
      "game_runtime",
      "media_cutscene",
    ]);
    expect(() => assertCompletionTarget(benchmarks)).not.toThrow();
  });

  test("keeps benchmark misses visible for follow-up work", () => {
    const benchmarks = projectCompletionBenchmarks();

    for (const benchmark of benchmarks) {
      expect(benchmark.passed.length + benchmark.missing.length).toBeGreaterThan(0);
      expect(benchmark.score).toBeGreaterThanOrEqual(80);
    }
  });
});
