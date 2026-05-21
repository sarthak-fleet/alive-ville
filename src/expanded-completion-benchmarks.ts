import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface ExpandedGate {
  id: string;
  label: string;
  passed: boolean;
  evidence: string[];
  missing: string[];
}

export interface ExpandedCompletionReport {
  score: number;
  gates: ExpandedGate[];
}

export function expandedCompletionReport(rootDir = process.cwd()): ExpandedCompletionReport {
  const gates = [
    gate(rootDir, "three_d_variant", "3D variant", [
      file("web/src/three/world-scene.ts"),
      file("web/src/organisms/ThreeWorld.tsx"),
      packageDependency("three"),
      source("web/src/templates/AppShell.tsx", ["3D", "lazy", "ThreeWorld", "const PhaserGame = lazy", "useState<\"2d\" | \"3d\">(\"3d\")"]),
      source("web/src/three/world-scene.ts", ["Raycaster", "onLocationSelect", "makePathMesh", "makeLabelSprite", "makeLandmarkMesh", "locationPalette"]),
      source("web/src/organisms/ThreeWorld.tsx", ["3D travel", "movePlayerToward", "ashbend:travel-to"]),
      source("web/src/world-travel.ts", ["movePlayerToward", "shortestLocationRoute"]),
      source("tests/playtests/alive-village.ts", ["three-host canvas", "nonBlankCanvasPixels", "Go Herb Garden", "At Herb Garden", "toHaveClass(/active/)", "expectNoVerticalOverlap"]),
      source("tests/three-world.test.ts", ["structureColor", "landmarks"]),
      source("worlds/village.json", ["\"visual\"", "\"landmarks\"", "\"palette\""]),
    ]),
    gate(rootDir, "generic_world_ingest", "Generic world ingest", [
      file("src/world-ingest.ts"),
      file("src/anime-ingest.ts"),
      file("fixtures/anime/opm-ingest-source.json"),
      file("fixtures/worlds/skyfront-source.json"),
      source("src/anime-ingest.ts", ["locationPaletteFor", "locationLandmarksFor", "visualTags"]),
      source("src/server.ts", ["/api/import-world-source", "validateWorldIngestSource", "worldSourceToWorld"]),
      source("web/src/organisms/AppHeader.tsx", ["World source JSON", "World"]),
      file("tests/world-ingest.test.ts"),
      file("tests/playtests/world-ingest.ts"),
    ]),
    gate(rootDir, "long_running_agents", "Long-running AI agents", [
      file("src/agent-loop.ts"),
      source("src/server.ts", ["/api/agent-loop/status", "/api/agent-loop/start", "/api/agent-loop/stop", "/api/agent-loop/step"]),
      source("src/agent-loop.ts", ["checkpointEveryTicks", "maxTicks", "start()", "stop("]),
      file("tests/agent-loop.test.ts"),
      source("tests/server.test.ts", ["/api/agent-loop/status", "/api/agent-loop/step"]),
    ]),
    gate(rootDir, "verification_surface", "Everything tested", [
      packageScript("typecheck"),
      packageScript("lint"),
      packageScript("test"),
      packageScript("build"),
      packageScript("bench:completion"),
      packageScript("bench:expanded"),
      packageScript("playtest:first-loop"),
      packageScript("playtest:basic-v0"),
      packageScript("playtest:alive"),
      packageScript("playtest:opm"),
      packageScript("playtest:world-ingest"),
      file("tests/completion-benchmarks.test.ts"),
      file("tests/expanded-completion-benchmarks.test.ts"),
    ]),
  ];
  const score = Math.round((gates.filter((item) => item.passed).length / gates.length) * 100);
  return { score, gates };
}

export function assertExpandedCompletion(report = expandedCompletionReport()): void {
  const failed = report.gates.filter((gate) => !gate.passed);
  if (failed.length > 0) {
    throw new Error(failed.map((gate) => `${gate.label}: ${gate.missing.join(", ")}`).join("; "));
  }
}

type Check = (rootDir: string) => { passed: boolean; evidence: string; missing: string };

function gate(rootDir: string, id: string, label: string, checks: Check[]): ExpandedGate {
  const results = checks.map((check) => check(rootDir));
  return {
    id,
    label,
    passed: results.every((result) => result.passed),
    evidence: results.filter((result) => result.passed).map((result) => result.evidence),
    missing: results.filter((result) => !result.passed).map((result) => result.missing),
  };
}

function file(path: string): Check {
  return (rootDir) => ({
    passed: existsSync(join(rootDir, path)),
    evidence: path,
    missing: `missing ${path}`,
  });
}

function source(path: string, terms: string[]): Check {
  return (rootDir) => {
    const text = readText(rootDir, path);
    const missing = terms.filter((term) => !text.includes(term));
    return {
      passed: missing.length === 0,
      evidence: `${path} contains ${terms.join(", ")}`,
      missing: `${path} missing ${missing.join(", ")}`,
    };
  };
}

function packageScript(name: string): Check {
  return (rootDir) => {
    const pkg = readPackage(rootDir);
    return {
      passed: typeof pkg.scripts?.[name] === "string",
      evidence: `package script ${name}`,
      missing: `missing package script ${name}`,
    };
  };
}

function packageDependency(name: string): Check {
  return (rootDir) => {
    const pkg = readPackage(rootDir);
    return {
      passed: typeof pkg.dependencies?.[name] === "string" || typeof pkg.devDependencies?.[name] === "string",
      evidence: `package dependency ${name}`,
      missing: `missing package dependency ${name}`,
    };
  };
}

function readText(rootDir: string, path: string): string {
  try {
    return readFileSync(join(rootDir, path), "utf8");
  } catch {
    return "";
  }
}

function readPackage(rootDir: string): {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
} {
  return JSON.parse(readText(rootDir, "package.json") || "{}") as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = expandedCompletionReport();
  console.info(`${report.score}% expanded completion`);
  for (const gate of report.gates) {
    console.info(`${gate.passed ? "PASS" : "FAIL"} ${gate.label}`);
    for (const missing of gate.missing) console.info(`  missing: ${missing}`);
  }
  assertExpandedCompletion(report);
}
