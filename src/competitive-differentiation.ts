import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ACTIVE_SURFACE_DIRS = ["astro-landing/src", "web/src"];
const ACTIVE_SURFACE_EXTENSIONS = new Set([".astro", ".css", ".ts", ".tsx"]);

export interface DifferentiationGate {
  id: string;
  label: string;
  passed: boolean;
  evidence: string[];
  missing: string[];
}

export interface DifferentiationReport {
  score: number;
  gates: DifferentiationGate[];
}

export function competitiveDifferentiationReport(rootDir = process.cwd()): DifferentiationReport {
  const gates = [
    gate(rootDir, "competitor_boundary", "AI Dungeon boundary is explicit and current", [
      file("docs/ai-dungeon-differentiation.md"),
      source("docs/ai-dungeon-differentiation.md", [
        "Last rechecked: 2026-05-22",
        "https://aidungeon.com/",
        "https://apps.apple.com/us/app/ai-dungeon-rpg-story-maker/id1491268416",
        "https://help.aidungeon.com/faq/the-memory-system",
        "https://help.aidungeon.com/faq/how-to-play",
        "AI-native RPG and text-adventure generator",
        "Story Cards",
        "Memory Banks",
        "Image Generator",
        "multiplayer session",
        "Do, Say, Story, or See",
      ]),
    ]),
    gate(rootDir, "positive_positioning", "Public surface leads with our lane", [
      source("astro-landing/src/pages/index.astro", [
        "playable 3D RPG simulation",
        "3D Playability",
        "World Ingest",
        "Import structured world source JSON",
        "Long-Running Agents",
        "Autonomous loops continue",
        "Use W A S D to explore the 3D world",
      ]),
      source("web/src/organisms/AppHeader.tsx", [
        "Reviewed sample worlds",
        "Open reviewed sample worlds",
        "Import a reviewed world-source JSON draft",
      ]),
      source("web/src/world-samples.ts", ["Skyfront", "Clockwork", "Abyssal", "Neon Noir"]),
    ]),
    gate(rootDir, "avoid_clone_claims", "Active product copy avoids AI Dungeon clone claims", [
      activeSurfaceAvoids([
        "AI Dungeon clone",
        "infinite text adventure",
        "text-adventure generator",
        "Story Cards",
        "Memory Banks",
        "Do, Say, Story, or See",
        "community scenario library",
      ]),
    ]),
    gate(rootDir, "behavioral_proof", "Differentiation is backed by runtime gates", [
      source("tests/playtests/production-build.ts", [
        "production 3D canvas should render nonblank pixels",
        "production agent step should visibly update 3D scene",
        "Reviewed sample worlds",
        "Neon Noir imported.",
        "production imported noir 3D canvas should render nonblank pixels",
      ]),
      source("tests/playtests/world-ingest.ts", [
        "Skyfront Couriers Playable Slice",
        "Clockwork Conservatory Playable Slice",
        "Abyssal Salvage Playable Slice",
        "Neon Nocturne Playable Slice",
        "generic imported world live agent loop should visibly update the 3D scene",
        "Complete: Give Witness badge",
      ]),
      source("tests/playtests/alive-village.ts", [
        "three-host canvas",
        "live agent loop should visibly update the 3D scene",
        "Restore latest",
        "keyboard.press(\"d\")",
        "Interact with Mira",
      ]),
      source("src/expanded-completion-benchmarks.ts", [
        "docs/ai-dungeon-differentiation.md",
        "Production-build browser smoke tests",
        "noir mystery world with distinct visual treatment",
      ]),
    ]),
  ];

  const score = Math.round((gates.filter((item) => item.passed).length / gates.length) * 100);
  return { score, gates };
}

export function assertCompetitiveDifferentiation(report = competitiveDifferentiationReport()): void {
  const failed = report.gates.filter((gate) => !gate.passed);
  if (failed.length > 0) {
    throw new Error(failed.map((gate) => `${gate.label}: ${gate.missing.join(", ")}`).join("; "));
  }
}

type Check = (rootDir: string) => { passed: boolean; evidence: string; missing: string };

function gate(rootDir: string, id: string, label: string, checks: Check[]): DifferentiationGate {
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

function activeSurfaceAvoids(forbiddenTerms: string[]): Check {
  return (rootDir) => {
    const violations = activeSurfaceFiles(rootDir).flatMap((path) => {
      const text = readText(rootDir, path);
      return forbiddenTerms.filter((term) => text.includes(term)).map((term) => `${path}: ${term}`);
    });

    return {
      passed: violations.length === 0,
      evidence: `active surfaces avoid ${forbiddenTerms.join(", ")}`,
      missing: `active surface clone claims found: ${violations.join("; ")}`,
    };
  };
}

function activeSurfaceFiles(rootDir: string): string[] {
  return ACTIVE_SURFACE_DIRS.flatMap((dir) => walk(join(rootDir, dir), rootDir)).filter((path) => {
    const extension = path.slice(path.lastIndexOf("."));
    return ACTIVE_SURFACE_EXTENSIONS.has(extension);
  });
}

function walk(path: string, rootDir: string): string[] {
  if (!existsSync(path)) return [];
  const stat = statSync(path);
  if (stat.isFile()) return [relative(rootDir, path)];
  if (!stat.isDirectory()) return [];
  return readdirSync(path).flatMap((entry) => walk(join(path, entry), rootDir));
}

function readText(rootDir: string, path: string): string {
  try {
    return readFileSync(join(rootDir, path), "utf8");
  } catch {
    return "";
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = competitiveDifferentiationReport();
  console.info(`${report.score}% competitive differentiation`);
  for (const gate of report.gates) {
    console.info(`${gate.passed ? "PASS" : "FAIL"} ${gate.label}`);
    for (const missing of gate.missing) console.info(`  missing: ${missing}`);
  }
  assertCompetitiveDifferentiation(report);
}
