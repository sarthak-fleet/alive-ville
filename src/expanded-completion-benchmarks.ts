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
      source("web/src/templates/AppShell.tsx", ["3D", "lazy", "ThreeWorld", "const PhaserGame = lazy", "useState<\"2d\" | \"3d\">(\"3d\")", "focusMode", "Escape", "aria-pressed={focusMode}"]),
      source("web/src/three/world-scene.ts", ["Raycaster", "onLocationSelect", "onNpcSelect", "onItemSelect", "onPropSelect", "onTargetHover", "onContextStatus", "webglcontextlost", "webglcontextrestored", "orbitCamera", "zoomCamera", "cameraZoomPercent", "resetCamera", "TRAVEL_ANIMATION_MS", "previousActorPositions", "movingActors", "actorMotion", "animateTravel", "makeTargetHalo", "sceneAnimation", "makePathMesh", "makeLabelSprite", "makeLandmarkMesh", "makePropMesh", "makeAtmosphereMesh", "atmosphereKindFor", "locationPalette", "npc.id !== world.player.characterId", "SceneMoodNode", "sceneMoodForClock", "applySceneMood", "timeOfDay", "PCFSoftShadowMap", "applyShadows"]),
      source("web/src/organisms/ThreeWorld.tsx", ["3D travel", "3D target", "3D camera controls", "3D camera zoom", "Zoom camera in", "Zoom camera out", "3D agent activity", "3D renderer status", "latestAutonomousActivity", "action.type === \"move\"", "Rotate camera right", "Reset camera", "onKeyDown", "keyboardDestinationFor", "hoverTarget", "activateSceneTarget", "event.key.toLowerCase() === \"e\"", "three-interact-button", "Interact with", "movePlayerToward", "openDrawer", "pickup", "inspect", "ashbend:travel-to"]),
      source("web/src/api/client.ts", ["readApiJson", "returned invalid JSON", "failed: ${res.status}", "isErrorPayload"]),
      source("web/src/pages/App.tsx", ["Recoverable app error", "Action failed", "clearError", "error && !world"]),
      source("web/src/world-travel.ts", ["movePlayerToward", "shortestLocationRoute", "keyboardDestinationFor", "keyDirection"]),
      source("tests/world-travel.test.ts", ["keyboardDestinationFor", "d", "ArrowDown", "ArrowLeft"]),
      file("fixtures/saves/not-json.json"),
      source("tests/playtests/first-loop.ts", ["Slot Save", "page.reload", "clickThreeTarget", "hoverThreeTarget", "keyboard.press(\"e\")", "Pick up Pruning shears", "Inspect Sooty tool rack", "Fresh soot outlines", "importInvalidSave", "Restore failed: Save file is not valid JSON", "Slot Load", "three-host canvas", "At Herb Garden"]),
      source("tests/playtests/alive-village.ts", ["three-host canvas", "nonBlankCanvasPixels", "canvasPixelHash", "webglcontextlost", "webglcontextrestored", "3D renderer paused", "3D renderer restored", "choosePlayableCharacter", "At Old Forge", "travelStartHash", "Rotate camera right", "Zoom camera in", "Zoom camera out", "3D camera zoom", "Reset camera", "keyboard.press(\"d\")", "keyboard.press(\"a\")", "Go Village Square", "Go Herb Garden", "At Village Square", "At Herb Garden", "hoverThreeTarget", "Talk Mira", "Interact with Mira", "Focus", "HUD", "expectNoHorizontalOverlap", "dialogue-panel", "toHaveClass(/active/)", "Recoverable app error", "Dismiss", "header-actions", "expectWithinViewport", "expectNoVerticalOverlap"]),
      source("web/src/three/world-scene.ts", ["pickableItems", "pickableProps", "pickableActors", "SceneObjectiveNode", "makeObjectiveBeaconMesh", "SphereGeometry(0.32", "BoxGeometry(0.38", "firstHitTarget(this.pickableItems)"]),
      source("tests/three-world.test.ts", ["structureColor", "landmarks", "forge_tool_rack", "objectives[0]", "moves the primary 3D objective beacon", "chosen character as the 3D player avatar", "changes 3D lighting mood with the world clock", "fogDensity", "atmosphere", "firefly", "dust", "source-derived artifact visuals", "source-derived location palettes", "conservatory-source.json", "shape: \"gear\"", "shape: \"scrap\""]),
      source("worlds/village.json", ["\"visual\"", "\"landmarks\"", "\"palette\""]),
    ]),
    gate(rootDir, "generic_world_ingest", "Generic world ingest", [
      file("src/world-ingest.ts"),
      file("src/anime-ingest.ts"),
      file("fixtures/anime/opm-ingest-source.json"),
      file("fixtures/worlds/skyfront-source.json"),
      file("fixtures/worlds/conservatory-source.json"),
      file("fixtures/worlds/invalid-source.json"),
      source("src/world-ingest.ts", ["WorldIngestSource", "worldSourceToWorld", "validateWorldIngestSource", "rebrandGenericWorld", "remapGenericWorldIds", "locationIdMap", "uniqueSlug", "World Ingest Slice", "Invalid world ingest source", "Duplicate world source entry", "_world_goal_"]),
      source("src/anime-ingest.ts", ["artifactVisualFor", "itemFromArtifact", "shape: \"token\"", "shape: \"gear\"", "shape: \"scrap\"", "material: \"radio\""]),
      source("src/types.ts", ["ItemVisualDesign", "visual?: ItemVisualDesign"]),
      source("src/quest-targets.ts", ["questItemTargetsFor", "inferQuestItemTargets", "return_shears", "bridge_whisper"]),
      source("src/story-context.ts", ["storyPhaseLocations", "storyConfrontationTargetId", "storyWitnessNpc", "directorStoryBeatText", "quietWorldRevealText", "phasePressureRevealText", "planRevealText", "villainPlans"]),
      source("src/director.ts", ["directorStoryBeatText", "storyDirectorNpc", "world's narrative director"]),
      source("src/agents.ts", ["quietWorldRevealText", "phasePressureRevealText", "planRevealText"]),
      source("src/story-progress.ts", ["STARTER_QUEST_IDS", "(world.quests ?? []).slice(0, STARTER_QUEST_IDS.length)"]),
      source("src/anime-ingest.ts", ["locationPaletteFor", "locationLandmarksFor", "generatedPortraitDataUri", "data:image/svg+xml", "visualTags", "greenhouse|botanical", "cloud|sky|harbor"]),
      source("src/server.ts", ["/api/import-world-source", "validateWorldIngestSource", "worldSourceToWorld"]),
      source("web/src/store/world.ts", ["importWorldSource", "importWorldSourceFromJson"]),
      source("web/src/organisms/AppHeader.tsx", ["World source JSON", "World", "World import failed"]),
      source("web/src/organisms/NpcDrawer.tsx", ["questItemTargetsFor", "Complete: Give", "relevantQuestItemIds(world, activeQuest)", "Ask about world", "That matters in ${world.name}"]),
      source("tests/director.test.ts", ["generic imported worlds get source-derived director story beats", "OPM world gets Z-City director story beats", "generic imported worlds get source-derived pressure reveals", "Guild Counter", "Hero Association kiosk", "Vex is exposed while Nell watches"]),
      source("tests/world-ingest.test.ts", ["Skyfront Couriers: World Ingest Slice", "Clockwork Conservatory: World Ingest Slice", "data:image/svg+xml", "generated portrait", "world_origin_clue", "harbor_ring", "signal_mast", "guild_counter", "chain_bridge", "recover_route_token", "route_token", "a_false_pirate_alarm_threatens_the_harbor_route_plan", "recover_verdigris_key", "luminous_shell", "compiles a second non-anime genre", "keeps source-derived generic quest IDs playable", "uses source-derived story objectives", "Report to Guild Counter before pressure peaks", "Confront Vex", "World title is required.", "Duplicate world source entry", "invalid-source.json", "rejects malformed generic source", "Invalid world ingest source"]),
      source("tests/playtests/world-ingest.ts", ["Skyfront Couriers Playable Slice", "Clockwork Conservatory Playable Slice", "Agent loop controls", "Start", "running", "stopped", "0 autonomous ticks", "Autonomous agents waiting", "3D travel", "At Harbor Ring", "Go Rookery Deck", "At Rookery Deck", "Pick up Route token", "Complete: Give Route token", "Recover Prism gear for Ivo", "Pick up Prism gear", "Pick up Painted flag scrap", "Report to Guild Counter before pressure peaks", "Call Vex into the open with Nell watching.", "Skyfront Couriers Playable Slice route stabilized", "That matters in Skyfront Couriers Playable Slice", "Recover Verdigris key for Eda", "Pick up Verdigris key", "That matters in Clockwork Conservatory Playable Slice", "Ask about world", "expectGeneratedPortrait", "generated portrait", "data:image/svg+xml", "naturalWidth", "canvasPixelHash", "importInvalidSource", "World import failed: invalid_world_source", "One Punch Man Playable Slice"]),
    ]),
    gate(rootDir, "long_running_agents", "Long-running AI agents", [
      file("src/agent-loop.ts"),
      file("src/agent-checkpoint-store.ts"),
      source("src/server.ts", ["/api/agent-loop/status", "/api/agent-loop/start", "/api/agent-loop/stop", "/api/agent-loop/step", "/api/agent-loop/restore-checkpoint", "AGENT_LOOP_CHECKPOINT_FILE", "readAgentLoopCheckpoints", "upsertAgentLoopCheckpoint", "writeAgentLoopCheckpoints", "checkpoint.world.id === world.id", "replaceEngineState", "clearCheckpoints", "world_replaced"]),
      source("web/src/api/client.ts", ["fetchAgentLoopStatus", "startAgentLoop", "stopAgentLoop", "stepAgentLoop", "restoreAgentLoopCheckpoint"]),
      source("web/src/organisms/AgentLoopPanel.tsx", ["Agent loop controls", "Start", "Stop", "Step", "Restore latest", "Restored checkpoint", "applyServerTick", "refreshFromServer"]),
      source("web/src/store/world.ts", ["applyServerTick", "commitTick", "summary.tick === world.tick", "lastSummary", "agentLoopStatus", "setAgentLoopStatus", "result.agentLoopStatus", "bubbles"]),
      source("web/src/templates/AppShell.tsx", ["AgentLoopPanel", "Agents"]),
      source("src/agent-loop.ts", ["checkpointEveryTicks", "maxTicks", "start()", "stop(", "restoreCheckpoint", "clearCheckpoints", "waitForIdle", "currentStep", "restoredCheckpoint", "agent_loop_step_in_progress", "initialCheckpoints", "maxCheckpoints", "slice(-maxCheckpoints)"]),
      source("src/agent-checkpoint-store.ts", ["readAgentLoopCheckpoints", "writeAgentLoopCheckpoints", "upsertAgentLoopCheckpoint", "mkdirSync", "version: 1"]),
      source("tests/agent-loop.test.ts", ["skips overlapping interval ticks", "restores a captured checkpoint", "hydrates persisted checkpoints into a fresh loop", "caps retention", "clears checkpoints when the owning world is replaced", "waits for an in-flight autonomous step", "agent_loop_checkpoint_not_found", "state: \"running\"", "lastError: null"]),
      source("tests/agent-checkpoint-store.test.ts", ["round-trips persisted checkpoints", "upserts checkpoint ticks", "drops malformed checkpoint files"]),
      source("tests/server.test.ts", ["/api/agent-loop/status", "/api/agent-loop/step", "/api/agent-loop/restore-checkpoint", "restoredCheckpoint", "persists agent loop checkpoints across server restarts", "AGENT_LOOP_CHECKPOINT_FILE", "stops a running agent loop before replacing world state", "ticksRun: 0", "lastTick: null", "checkpoints: []"]),
      source("tests/playtests/alive-village.ts", ["Agent loop controls", "1 autonomous ticks", "6 autonomous ticks", "Restore latest", "Restored checkpoint: world tick 5", "20:00", "18:00", "autonomousTickCount", "LIVE_LOOP_INTERVAL_MS", "3D agent activity", "Autonomous t1", "Autonomous t(?:[7-9]|\\d{2,})", "Autonomous agents waiting", "running", "stopped"]),
    ]),
    gate(rootDir, "performance_budget", "Performance budget", [
      file("src/bundle-budget.ts"),
      file("tests/bundle-budget.test.ts"),
      packageScript("budget:bundle"),
      source("src/bundle-budget.ts", ["FIRST_LOAD_JS_MAX_BYTES", "FIRST_LOAD_CSS_MAX_BYTES", "FIRST_LOAD_TOTAL_MAX_BYTES", "FIRST_LOAD_GZIP_MAX_BYTES", "LAZY_THREE_WORLD_MAX_BYTES", "LAZY_PHASER_MAX_BYTES", "LAZY_MISC_JS_MAX_BYTES", "firstLoadAssets", "lazyAssets", "lazyAssetFailures", "assertBundleBudget"]),
      source("tests/bundle-budget.test.ts", ["compact first-load shell", "lazy runtime chunks", "first-load shell gets too large", "named lazy runtime chunk"]),
    ]),
    gate(rootDir, "verification_surface", "Everything tested", [
      packageScript("typecheck"),
      packageScript("lint"),
      packageScript("test"),
      packageScript("build"),
      packageScript("budget:bundle"),
      packageScript("bench:completion"),
      packageScript("bench:expanded"),
      packageScript("playtest:all"),
      packageScript("verify:readiness"),
      packageScript("playtest:first-loop"),
      packageScript("playtest:basic-v0"),
      packageScript("playtest:alive"),
      packageScript("playtest:opm"),
      packageScript("playtest:world-ingest"),
      packageScriptContains("playtest:all", ["playtest:first-loop", "playtest:basic-v0", "playtest:alive", "playtest:opm", "playtest:world-ingest"]),
      packageScriptContains("verify:readiness", ["typecheck", "lint", "test", "build", "budget:bundle", "bench:completion", "bench:expanded", "playtest:all"]),
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
  const report = expandedCompletionReport();
  console.info(`${report.score}% expanded completion`);
  for (const gate of report.gates) {
    console.info(`${gate.passed ? "PASS" : "FAIL"} ${gate.label}`);
    for (const missing of gate.missing) console.info(`  missing: ${missing}`);
  }
  assertExpandedCompletion(report);
}
