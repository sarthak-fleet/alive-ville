import { describe, expect, test } from "vitest";

import { assertExpandedCompletion, expandedCompletionReport } from "../src/expanded-completion-benchmarks.ts";

describe("expanded completion gates", () => {
  test("requires the new 100% scope to be explicitly evidenced", () => {
    const report = expandedCompletionReport();

    expect(report.score).toBe(100);
    expect(report.gates.map((gate) => gate.id)).toEqual([
      "three_d_variant",
      "generic_world_ingest",
      "long_running_agents",
      "performance_budget",
      "verification_surface",
    ]);
    expect(() => assertExpandedCompletion(report)).not.toThrow();
  });
});
