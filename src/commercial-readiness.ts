import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface CommercialReadinessGate {
  id: string;
  label: string;
  passed: boolean;
  evidence: string[];
  missing: string[];
}

export interface CommercialReadinessReport {
  score: number;
  gates: CommercialReadinessGate[];
}

export function commercialReadinessReport(rootDir = process.cwd()): CommercialReadinessReport {
  const gates = [
    gate(rootDir, "commercial_product_surface", "Commercial product surface", [
      packageScript("build"),
      packageScript("serve:production"),
      packageScript("verify:readiness"),
      file("unreal/AshmentUnreal/AshmentUnreal.uproject"),
      file("unreal/README.md"),
      file("astro-landing/src/pages/index.astro"),
      source("astro-landing/src/pages/index.astro", [
        "playable 3D RPG simulation",
        "3D Playability",
        "World Ingest",
        "Long-Running Agents",
      ]),
      source("tests/playtests/production-build.ts", [
        "WEB_ROOT",
        "dist/web",
        "production 3D canvas should render nonblank pixels",
        "production agent step should visibly update 3D scene",
      ]),
    ]),
    gate(rootDir, "playable_graphics", "Playable graphics", [
      packageDependency("phaser"),
      packageDependency("three"),
      file("web/src/organisms/PhaserGame.tsx"),
      file("web/src/organisms/PlayerStatus.tsx"),
      file("web/src/organisms/AgentPulse.tsx"),
      source("unreal/AshmentUnreal/AshmentUnreal.uproject", ["EngineAssociation", "AshmentUnreal"]),
      source("unreal/AshmentUnreal/Source/AshmentUnreal/AshmentWorldClient.cpp", [
        "/api/unreal/state",
        "SpawnPrimitive",
        "SpawnLabel",
        "locations",
        "actors",
        "items",
        "objectives",
      ]),
      source("unreal/AshmentUnreal/Source/AshmentUnreal/AshmentPlayerPawn.cpp", ["MoveForward", "MoveRight", "MoveUp", "Turn", "LookUp"]),
      source("web/src/templates/AppShell.tsx", ["const PhaserGame = lazy", "PhaserGame", "PlayerStatus", "AgentPulse", "focusMode", "view-2d"]),
      source("web/src/phaser/VillageScene.ts", ["makeActor", "playCombatFx", "playAgentActionFx", "makeActorNameplate", "ambientBarksForLocation"]),
      source("tests/playtests/opm-world.ts", ["phaser-host canvas", "Player status", "AI agent pulse", "Hero roster", "Route complete"]),
      source("web/src/three/world-scene.ts", [
        "PCFSoftShadowMap",
        "SceneMoodNode",
        "makeWeatherMesh",
        "makeLandmarkMesh",
        "makeActorAccessoryMesh",
        "makeObjectiveBeaconMesh",
        "locationPalette",
      ]),
      source("tests/playtests/production-build.ts", [
        "production imported noir 3D canvas should render nonblank pixels",
        "production noir 3D canvas should visually differ from village",
        "production mobile imported 3D canvas should render nonblank pixels",
      ]),
      source("tests/three-world.test.ts", [
        "source-derived artifact visuals",
        "source-derived location palettes",
        "changes 3D lighting mood with the world clock",
      ]),
    ]),
    gate(rootDir, "long_running_agents", "Long-running agents", [
      file("src/agent-loop.ts"),
      file("src/agent-checkpoint-store.ts"),
      source("src/server.ts", ["/api/agent-loop/start", "/api/agent-loop/stop", "/api/agent-loop/restore-checkpoint"]),
      source("web/src/organisms/AgentLoopPanel.tsx", ["Agent loop controls", "Start", "Stop", "Restore latest"]),
      source("tests/playtests/alive-village.ts", [
        "live agent loop should visibly update the 3D scene",
        "Restored checkpoint: world tick",
        "Autonomous agents waiting",
      ]),
      source("tests/playtests/world-ingest.ts", ["generic imported world live agent loop should visibly update the 3D scene"]),
    ]),
    gate(rootDir, "world_ingest", "Ability to ingest things", [
      file("src/world-ingest.ts"),
      file("src/unreal-bridge.ts"),
      file("fixtures/worlds/skyfront-source.json"),
      file("fixtures/worlds/conservatory-source.json"),
      file("fixtures/worlds/abyssal-source.json"),
      file("fixtures/worlds/noir-source.json"),
      source("src/server.ts", ["/api/import-world-source", "/api/unreal/state", "/api/unreal/action", "validateWorldIngestSource", "worldSourceToWorld", "unrealWorldStateFromWorld"]),
      source("web/src/organisms/AppHeader.tsx", ["World source JSON", "Import", "Reviewed sample worlds"]),
      source("tests/playtests/world-ingest.ts", [
        "Skyfront Couriers Playable Slice",
        "Clockwork Conservatory Playable Slice",
        "Abyssal Salvage Playable Slice",
        "Neon Nocturne Playable Slice",
        "World import failed: invalid_world_source",
      ]),
    ]),
    gate(rootDir, "proper_playability", "Proper playability", [
      packageScript("playtest:all"),
      packageScriptContains("playtest:all", [
        "playtest:first-loop",
        "playtest:alive",
        "playtest:world-ingest",
        "playtest:production",
      ]),
      source("tests/playtests/first-loop.ts", ["Slot Save", "Slot Load", "phaser-host canvas", "Bring Pruning shears to Mira"]),
      source("tests/playtests/alive-village.ts", ["keyboard.press(\"d\")", "Interact with Mira", "expectNoHorizontalOverlap", "expectWithinViewport"]),
      source("tests/playtests/world-ingest.ts", ["Complete: Give Route token", "quick-loaded imported Abyssal 3D canvas should render nonblank pixels"]),
      source("web/src/three/scene-targets.ts", ["sceneTargetForWorld", "objectiveSceneTargetFor", "validSceneTarget"]),
      source("tests/three-interactions.test.ts", ["prefers the local objective NPC", "prefers the active objective item"]),
    ]),
    gate(rootDir, "verification_and_positioning", "Verification and positioning", [
      packageScriptContains("verify:readiness", [
        "typecheck",
        "lint",
        "test",
        "build",
        "budget:bundle",
        "bench:completion",
        "bench:expanded",
        "bench:differentiation",
        "bench:commercial",
        "playtest:all",
      ]),
      file("docs/ai-dungeon-differentiation.md"),
      source("docs/ai-dungeon-differentiation.md", [
        "AI World Simulator, a playable 3D world simulator",
        "Structured world compiler",
        "Long-running autonomous agents",
        "Playable objectives over open-ended prose drift",
      ]),
      source("src/expanded-completion-benchmarks.ts", [
        "two_d_primary_with_three_d_shelf",
        "generic_world_ingest",
        "long_running_agents",
        "verification_surface",
      ]),
      source("src/competitive-differentiation.ts", ["competitiveDifferentiationReport", "behavioral_proof"]),
      source("tests/unreal-bridge.test.ts", ["projects world state into an Unreal-friendly scene contract", "moves objective targets as quest state changes"]),
      source("tests/server.test.ts", ["/api/unreal/state", "/api/unreal/action", "ashment-unreal-v1"]),
    ]),
  ];

  const score = Math.round((gates.filter((item) => item.passed).length / gates.length) * 100);
  return { score, gates };
}

export function assertCommercialReadiness(report = commercialReadinessReport()): void {
  const failed = report.gates.filter((gate) => !gate.passed);
  if (failed.length > 0) {
    throw new Error(failed.map((gate) => `${gate.label}: ${gate.missing.join(", ")}`).join("; "));
  }
}

type Check = (rootDir: string) => { passed: boolean; evidence: string; missing: string };

function gate(rootDir: string, id: string, label: string, checks: Check[]): CommercialReadinessGate {
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

function packageScriptContains(name: string, terms: string[]): Check {
  return (rootDir) => {
    const pkg = readPackage(rootDir);
    const script = pkg.scripts?.[name] ?? "";
    const missing = terms.filter((term) => !script.includes(term));
    return {
      passed: missing.length === 0,
      evidence: `package script ${name} runs ${terms.join(", ")}`,
      missing: `package script ${name} missing ${missing.join(", ")}`,
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
  const report = commercialReadinessReport();
  console.info(`${report.score}% commercial readiness`);
  for (const gate of report.gates) {
    console.info(`${gate.passed ? "PASS" : "FAIL"} ${gate.label}`);
    for (const missing of gate.missing) console.info(`  missing: ${missing}`);
  }
  assertCommercialReadiness(report);
}
