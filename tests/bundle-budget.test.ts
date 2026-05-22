import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { assertBundleBudget, bundleBudgetReport } from "../src/bundle-budget.ts";

describe("bundle budget", () => {
  test("passes for a compact first-load shell with lazy runtime chunks", () => {
    const root = makeBuild({
      "index-shell.js": "console.info('shell');",
      "index-style.css": "body{margin:0}",
      "ThreeWorld-lazy.js": "x".repeat(540 * 1024),
      "PhaserGame-lazy.js": "x".repeat(1_200 * 1024),
    });
    mkdirSync(join(root, "dist", "web", "assets", "cutscenes"), { recursive: true });

    const report = bundleBudgetReport(root);

    expect(report.passed).toBe(true);
    expect(report.firstLoadAssets.map((asset) => asset.path)).toEqual(["assets/index-shell.js", "assets/index-style.css"]);
    expect(report.lazyAssets.map((asset) => asset.path)).toContain("assets/ThreeWorld-lazy.js");
    expect(() => assertBundleBudget(report)).not.toThrow();
  });

  test("fails when the first-load shell gets too large", () => {
    const root = makeBuild({
      "index-shell.js": "x".repeat(380 * 1024),
      "index-style.css": "body{margin:0}",
    });

    const report = bundleBudgetReport(root);

    expect(report.passed).toBe(false);
    expect(report.failures.join("\n")).toContain("first-load JS");
    expect(() => assertBundleBudget(report)).toThrow("first-load JS");
  });

  test("fails when a named lazy runtime chunk grows beyond its budget", () => {
    const root = makeBuild({
      "index-shell.js": "console.info('shell');",
      "index-style.css": "body{margin:0}",
      "ThreeWorld-lazy.js": "x".repeat(610 * 1024),
    });

    const report = bundleBudgetReport(root);

    expect(report.passed).toBe(false);
    expect(report.failures.join("\n")).toContain("lazy ThreeWorld");
    expect(() => assertBundleBudget(report)).toThrow("lazy ThreeWorld");
  });
});

function makeBuild(assets: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "ai-game-budget-"));
  const dist = join(root, "dist", "web");
  const assetDir = join(dist, "assets");
  mkdirSync(assetDir, { recursive: true });
  for (const [name, contents] of Object.entries(assets)) {
    writeFileSync(join(assetDir, name), contents);
  }
  writeFileSync(
    join(dist, "index.html"),
    [
      "<!doctype html>",
      "<html><head>",
      '<script type="module" crossorigin src="/assets/index-shell.js"></script>',
      '<link rel="stylesheet" crossorigin href="/assets/index-style.css">',
      "</head><body><div id=\"root\"></div></body></html>",
    ].join("")
  );
  return root;
}
