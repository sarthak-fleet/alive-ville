import { describe, expect, test } from "vitest";

import {
  assertCompetitiveDifferentiation,
  competitiveDifferentiationReport,
} from "../src/competitive-differentiation.ts";

describe("competitive differentiation gates", () => {
  test("keeps AI Dungeon differentiation explicit and behavior-backed", () => {
    const report = competitiveDifferentiationReport();

    expect(report.score).toBe(100);
    expect(report.gates.map((gate) => gate.id)).toEqual([
      "competitor_boundary",
      "positive_positioning",
      "avoid_clone_claims",
      "behavioral_proof",
    ]);
    expect(() => assertCompetitiveDifferentiation(report)).not.toThrow();
  });

  test("keeps misses visible for follow-up work", () => {
    const report = competitiveDifferentiationReport();

    for (const gate of report.gates) {
      expect(gate.evidence.length + gate.missing.length).toBeGreaterThan(0);
    }
  });
});
