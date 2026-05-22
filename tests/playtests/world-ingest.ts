import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { chromium, expect, type Locator, type Page } from "@playwright/test";

const API_PORT = Number(process.env["PLAYTEST_API_PORT"] ?? 5674);
const WEB_PORT = Number(process.env["PLAYTEST_WEB_PORT"] ?? 5675);
const BASE_URL = `http://127.0.0.1:${WEB_PORT}`;
const ARTIFACT_DIR = process.env["PLAYTEST_ARTIFACT_DIR"] ?? "tmp/playtest-artifacts/world-ingest";
const LIVE_LOOP_INTERVAL_MS = 500;
const TSX = new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url).pathname;
const VITE = new URL("../../node_modules/vite/bin/vite.js", import.meta.url).pathname;
const SERVER = new URL("../../src/server.ts", import.meta.url).pathname;
const WORLD = new URL("../../worlds/village.json", import.meta.url).pathname;
const SKYFRONT = new URL("../../fixtures/worlds/skyfront-source.json", import.meta.url).pathname;
const CONSERVATORY = new URL("../../fixtures/worlds/conservatory-source.json", import.meta.url).pathname;
const ABYSSAL = new URL("../../fixtures/worlds/abyssal-source.json", import.meta.url).pathname;
const NOIR = new URL("../../fixtures/worlds/noir-source.json", import.meta.url).pathname;
const INVALID_WORLD = new URL("../../fixtures/worlds/invalid-source.json", import.meta.url).pathname;
const OPM = new URL("../../fixtures/anime/opm-ingest-source.json", import.meta.url).pathname;

async function main(): Promise<void> {
  mkdirSync(ARTIFACT_DIR, { recursive: true });

  const api = spawn(process.execPath, [TSX, SERVER], {
    env: { ...process.env, PORT: String(API_PORT), LLM_API_KEY: "", LLM_BASE_URL: "", AGENT_LOOP_INTERVAL_MS: String(LIVE_LOOP_INTERVAL_MS) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const web = spawn(process.execPath, [VITE, "--host", "127.0.0.1", "--port", String(WEB_PORT), "--strictPort"], {
    env: { ...process.env, SERVER_PORT: String(API_PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await Promise.all([waitForHttp(`http://127.0.0.1:${API_PORT}/api/state`), waitForHttp(BASE_URL)]);
    await restoreWorld();
    await runWorldIngestPlaytest();
  } finally {
    stopProcess(web);
    stopProcess(api);
  }
}

async function runWorldIngestPlaytest(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors: string[] = [];
  let allowInvalidImportError = false;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && !(allowInvalidImportError && text.includes("400 (Bad Request)"))) errors.push(text);
  });
  page.on("response", (response) => {
    if (response.status() === 404) errors.push(`404 ${response.url()}`);
  });

  try {
    await page.goto(BASE_URL);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: "Ashment Village" })).toBeVisible();
    await openAgentsPanel(page);
    await expect(page.getByLabel("Agent loop controls")).toContainText("idle");
    await startAgentLoopFromUi(page);

    await importSource(page, SKYFRONT);
    await expect(page.getByRole("heading", { name: "Skyfront Couriers Playable Slice" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel("Agent loop controls")).toContainText("stopped");
    await expect(page.getByLabel("Agent loop controls")).toContainText("0 autonomous ticks");
    await expect(page.getByLabel("3D agent activity")).toContainText("Autonomous agents waiting");
    await expect(page.locator(".objective-tracker")).toContainText("Recover Route token for Mara");
    await expect(page.getByRole("button", { name: "3D" })).toHaveClass(/active/);
    await expect(page.locator(".three-host canvas")).toBeVisible();
    await expect.poll(() => nonBlankCanvasPixels(page, ".three-host canvas"), { message: "Skyfront 3D canvas should render nonblank pixels", timeout: 10_000 }).toBeGreaterThan(40);
    await expect(page.getByLabel("3D travel")).toContainText("At Harbor Ring");
    const skyfrontStartHash = await canvasPixelHash(page, ".three-host canvas");
    await expect(page.getByRole("button", { name: "Go Rookery Deck" })).toBeVisible();
    await clickTravelStrip(page, "Rookery Deck", "At Rookery Deck");
    await expect.poll(() => canvasPixelHash(page, ".three-host canvas"), { message: "Skyfront 3D canvas should change after travel", timeout: 10_000 }).not.toEqual(skyfrontStartHash);
    await page.screenshot({ path: join(ARTIFACT_DIR, "01-skyfront-3d.png") });
    await completeSkyfrontQuest(page, {
      title: "Recover Route token for Mara",
      acceptNpc: "Mara",
      itemText: "Find Route token",
      pickupLabel: "Pick up Route token",
      returnText: "Bring Route token to Mara",
      travelText: "At Signal Mast",
      completeButton: "Complete: Give Route token",
      completedText: "Recover Route token for Mara is complete",
      nextText: "Recover Prism gear for Ivo",
      artifactPrefix: "route-token",
      pickupVia3d: true,
    });
    await completeSkyfrontQuest(page, {
      title: "Recover Prism gear for Ivo",
      acceptNpc: "Ivo",
      itemText: "Find Prism gear",
      pickupLabel: "Pick up Prism gear",
      returnText: "Bring Prism gear to Ivo",
      travelText: "At Cloud Engine",
      completeButton: "Complete: Give Prism gear",
      completedText: "Recover Prism gear for Ivo is complete",
      nextText: "Recover Painted flag scrap for Nell",
      artifactPrefix: "prism-gear",
    });
    await completeSkyfrontQuest(page, {
      title: "Recover Painted flag scrap for Nell",
      acceptNpc: "Nell",
      itemText: "Find Painted flag scrap",
      pickupLabel: "Pick up Painted flag scrap",
      returnText: "Bring Painted flag scrap to Nell",
      travelText: "At Chain Bridge",
      completeButton: "Complete: Give Painted flag scrap",
      completedText: "Recover Painted flag scrap for Nell is complete",
      nextText: "Report to Guild Counter before pressure peaks",
      artifactPrefix: "painted-flag",
    });
    await resolveSkyfrontStoryLoop(page);

    allowInvalidImportError = true;
    await importInvalidSource(page, INVALID_WORLD);
    allowInvalidImportError = false;
    await expect(page.getByRole("heading", { name: "Skyfront Couriers Playable Slice" })).toBeVisible();
    await expect(page.getByLabel("3D travel")).toContainText("At Guild Counter");
    await expect(page.locator(".three-host canvas")).toBeVisible();

    await importSource(page, CONSERVATORY);
    await expect(page.getByRole("heading", { name: "Clockwork Conservatory Playable Slice" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel("Agent loop controls")).toContainText("stopped");
    await expect(page.locator(".objective-tracker")).toContainText("Recover Verdigris key for Eda");
    await expect(page.locator(".three-host canvas")).toBeVisible();
    await expect.poll(() => nonBlankCanvasPixels(page, ".three-host canvas"), { message: "Conservatory 3D canvas should render nonblank pixels", timeout: 10_000 }).toBeGreaterThan(40);
    await expect(page.getByLabel("3D travel")).toContainText("At Atrium Gate");
    const conservatoryStartHash = await canvasPixelHash(page, ".three-host canvas");
    expect(conservatoryStartHash).not.toEqual(skyfrontStartHash);
    await completeConservatoryFirstQuest(page);
    await expect.poll(() => canvasPixelHash(page, ".three-host canvas"), { message: "Conservatory 3D canvas should change after quest movement", timeout: 10_000 }).not.toEqual(conservatoryStartHash);
    await page.screenshot({ path: join(ARTIFACT_DIR, "06-conservatory-source.png") });

    await importSource(page, ABYSSAL);
    await expect(page.getByRole("heading", { name: "Abyssal Salvage Playable Slice" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel("Agent loop controls")).toContainText("stopped");
    await expect(page.locator(".objective-tracker")).toContainText("Recover Pearl key for Neri");
    await expect(page.locator(".three-host canvas")).toBeVisible();
    await expect.poll(() => nonBlankCanvasPixels(page, ".three-host canvas"), { message: "Abyssal 3D canvas should render nonblank pixels", timeout: 10_000 }).toBeGreaterThan(40);
    await expect(page.getByLabel("3D travel")).toContainText("At Reef Dome");
    const abyssalStartHash = await canvasPixelHash(page, ".three-host canvas");
    expect(abyssalStartHash).not.toEqual(conservatoryStartHash);
    await completeAbyssalFirstQuest(page);
    await expect.poll(() => canvasPixelHash(page, ".three-host canvas"), { message: "Abyssal 3D canvas should change after quest movement", timeout: 10_000 }).not.toEqual(abyssalStartHash);
    await page.screenshot({ path: join(ARTIFACT_DIR, "07-abyssal-source.png") });
    await verifyAbyssalLiveLoop(page);
    await quickSaveImportedAbyssal(page);
    await verifyMobileImportedAbyssal(browser);

    await importSource(page, NOIR);
    await expect(page.getByRole("heading", { name: "Neon Nocturne Playable Slice" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel("Agent loop controls")).toContainText("stopped");
    await expect(page.locator(".objective-tracker")).toContainText("Recover Witness badge for Reva");
    await expect(page.locator(".three-host canvas")).toBeVisible();
    await expect.poll(() => nonBlankCanvasPixels(page, ".three-host canvas"), { message: "Noir 3D canvas should render nonblank pixels", timeout: 10_000 }).toBeGreaterThan(40);
    await expect(page.getByLabel("3D travel")).toContainText("At Rain Market");
    const noirStartHash = await canvasPixelHash(page, ".three-host canvas");
    expect(noirStartHash).not.toEqual(abyssalStartHash);
    await completeNoirFirstQuest(page);
    await expect.poll(() => canvasPixelHash(page, ".three-host canvas"), { message: "Noir 3D canvas should change after evidence movement", timeout: 10_000 }).not.toEqual(noirStartHash);
    await page.screenshot({ path: join(ARTIFACT_DIR, "12-noir-source.png") });

    await importSource(page, OPM);
    await expect(page.getByRole("heading", { name: "One Punch Man Playable Slice" })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".objective-tracker")).toContainText("Recover Grocery coupon for Saitama");
    await page.screenshot({ path: join(ARTIFACT_DIR, "07-opm-source.png") });
    await expect(page.getByLabel("Agent loop controls")).toContainText("stopped");
    await expect(page.getByLabel("Agent loop controls")).toContainText("0 autonomous ticks");
    const opmLiveLoopBeforeHash = await canvasPixelHash(page, ".three-host canvas");
    await startAgentLoopFromUi(page);
    await expect(page.getByLabel("Agent loop controls")).toContainText(`${LIVE_LOOP_INTERVAL_MS}ms`);
    await expect.poll(() => autonomousTickCount(page), { timeout: 10_000 }).toBeGreaterThan(0);
    await expect.poll(() => canvasPixelHash(page, ".three-host canvas"), {
      message: "imported world live agent loop should visibly update the 3D scene",
      timeout: 10_000,
    }).not.toEqual(opmLiveLoopBeforeHash);
    await expect(page.getByLabel("3D agent activity")).toContainText(/Autonomous t\d+/);
    await page.screenshot({ path: join(ARTIFACT_DIR, "08-opm-live-loop.png") });
    await page.getByLabel("Agent loop controls").getByRole("button", { name: "Stop" }).click();
    await expect(page.getByLabel("Agent loop controls")).toContainText("stopped");
    await quickLoadImportedAbyssal(page);
    await verifyImportedPackageReview(page);
    await expect(errors, errors.join("\n")).toEqual([]);
  } finally {
    await page.close();
    await browser.close();
  }
}

async function completeSkyfrontQuest(
  page: Page,
  quest: {
    title: string;
    acceptNpc: string;
    itemText: string;
    pickupLabel: string;
    returnText: string;
    travelText: string;
    completeButton: string;
    completedText: string;
    nextText: string;
    artifactPrefix: string;
    pickupVia3d?: boolean;
  }
): Promise<void> {
  await expect(objective(page)).toContainText(quest.title);
  await clickObjective(page, "Go");
  await expect(objective(page)).toContainText(`Talk to ${quest.acceptNpc}`);
  await clickObjective(page, "Talk");
  await expectGeneratedPortrait(page, quest.acceptNpc);
  await clickButton(page, "Accept task");
  await clickButton(page, "Close");
  await expect(objective(page)).toContainText(quest.itemText);
  await travelViaObjectiveOr3dStrip(page, quest.travelText);
  await expect(page.locator(".three-host canvas")).toBeVisible();
  await expect.poll(() => nonBlankCanvasPixels(page, ".three-host canvas"), { message: `${quest.title} destination should keep 3D canvas nonblank`, timeout: 10_000 }).toBeGreaterThan(40);
  await expect(objective(page)).toContainText("Pick up");
  if (quest.pickupVia3d) {
    await clickThreeTarget(page, quest.pickupLabel);
  } else {
    await clickObjective(page, "Pick up");
  }
  await expect(objective(page)).toContainText(quest.returnText);
  await clickObjective(page, "Go");
  await expect(objective(page)).toContainText("Talk", { timeout: 20_000 });
  await clickObjective(page, "Talk");
  await clickButton(page, quest.completeButton);
  await expect(page.locator(".outcome-toast")).toContainText(quest.completedText);
  await expect(page.locator(".dialogue-panel")).toContainText("That matters in Skyfront Couriers Playable Slice");
  await expect(page.locator(".dialogue-panel")).not.toContainText("That matters in Ashment");
  await expect(page.getByRole("button", { name: "Ask about world" })).toBeVisible();
  await clickButton(page, "Close");
  await expect(objective(page)).toContainText(quest.nextText);
  await page.screenshot({ path: join(ARTIFACT_DIR, `02-${quest.artifactPrefix}-complete.png`) });
}

async function resolveSkyfrontStoryLoop(page: Page): Promise<void> {
  await expect(objective(page)).toContainText("Report to Guild Counter before pressure peaks");
  await clickObjective(page, "Go");
  await expect(page.getByLabel("3D travel")).toContainText("At Guild Counter");
  await expect(objective(page)).toContainText("Confront Vex");
  await expect(objective(page)).toContainText("Call Vex into the open with Nell watching.");
  await clickObjective(page, "Confront");
  await expect(objective(page)).toContainText("Skyfront Couriers Playable Slice route stabilized");
  await expect(objective(page)).toContainText("The imported world's first playable loop is resolved");
  await page.screenshot({ path: join(ARTIFACT_DIR, "05-skyfront-story-resolved.png") });
}

async function completeConservatoryFirstQuest(page: Page): Promise<void> {
  await expect(objective(page)).toContainText("Recover Verdigris key for Eda");
  await expect(objective(page)).toContainText("Talk to Eda");
  await clickObjective(page, "Talk");
  await expectGeneratedPortrait(page, "Eda");
  await clickButton(page, "Accept task");
  await clickButton(page, "Close");
  await expect(objective(page)).toContainText("Find Verdigris key");
  await clickObjective(page, "Go");
  await expect(page.getByLabel("3D travel")).toContainText("At Gear Hall");
  await expect(page.getByLabel("3D target")).toBeVisible();
  await clickThreeTarget(page, "Pick up Verdigris key");
  await expect(objective(page)).toContainText("Bring Verdigris key to Eda");
  await clickObjective(page, "Go");
  await expect(page.getByLabel("3D travel")).toContainText("At Atrium Gate");
  await clickObjective(page, "Talk");
  await clickButton(page, "Complete: Give Verdigris key");
  await expect(page.locator(".outcome-toast")).toContainText("Recover Verdigris key for Eda is complete");
  await expect(page.locator(".dialogue-panel")).toContainText("That matters in Clockwork Conservatory Playable Slice");
  await expect(page.locator(".dialogue-panel")).not.toContainText("That matters in Skyfront");
  await clickButton(page, "Close");
  await expect(objective(page)).toContainText("Recover Glass gear for Brin");
}

async function completeAbyssalFirstQuest(page: Page): Promise<void> {
  await expect(objective(page)).toContainText("Recover Pearl key for Neri");
  await expect(objective(page)).toContainText("Talk to Neri");
  await clickObjective(page, "Talk");
  await expectGeneratedPortrait(page, "Neri");
  await clickButton(page, "Accept task");
  await clickButton(page, "Close");
  await expect(objective(page)).toContainText("Find Pearl key");
  await clickObjective(page, "Go");
  await expect(page.getByLabel("3D travel")).toContainText("At Sonar Array");
  await expect(page.getByLabel("3D target")).toBeVisible();
  await clickThreeTarget(page, "Pick up Pearl key");
  await expect(objective(page)).toContainText("Bring Pearl key to Neri");
  await clickObjective(page, "Go");
  await expect(page.getByLabel("3D travel")).toContainText("At Reef Dome");
  await clickObjective(page, "Talk");
  await clickButton(page, "Complete: Give Pearl key");
  await expect(page.locator(".outcome-toast")).toContainText("Recover Pearl key for Neri is complete");
  await expect(page.locator(".dialogue-panel")).toContainText("That matters in Abyssal Salvage Playable Slice");
  await expect(page.locator(".dialogue-panel")).not.toContainText("That matters in Clockwork");
  await clickButton(page, "Close");
  await expect(objective(page)).toContainText("Recover Turbine gear for Paxel");
}

async function completeNoirFirstQuest(page: Page): Promise<void> {
  await expect(objective(page)).toContainText("Recover Witness badge for Reva");
  await expect(objective(page)).toContainText("Talk to Reva");
  await clickObjective(page, "Talk");
  await expectGeneratedPortrait(page, "Reva");
  await clickButton(page, "Accept task");
  await clickButton(page, "Close");
  await expect(objective(page)).toContainText("Find Witness badge");
  await clickObjective(page, "Go");
  await expect(page.getByLabel("3D travel")).toContainText("At Signal Booth");
  await expect(page.getByLabel("3D target")).toBeVisible();
  await clickThreeTarget(page, "Pick up Witness badge");
  await expect(objective(page)).toContainText("Bring Witness badge to Reva");
  await clickObjective(page, "Go");
  await expect(page.getByLabel("3D travel")).toContainText("At Rain Market");
  await clickObjective(page, "Talk");
  await clickButton(page, "Complete: Give Witness badge");
  await expect(page.locator(".outcome-toast")).toContainText("Recover Witness badge for Reva is complete");
  await expect(page.locator(".dialogue-panel")).toContainText("That matters in Neon Nocturne Playable Slice");
  await expect(page.locator(".dialogue-panel")).not.toContainText("That matters in Abyssal");
  await clickButton(page, "Close");
  await expect(objective(page)).toContainText("Recover Signal lens for Milo");
}

async function verifyAbyssalLiveLoop(page: Page): Promise<void> {
  await expect(page.getByLabel("Agent loop controls")).toContainText("stopped");
  await expect(page.getByLabel("Agent loop controls")).toContainText("0 autonomous ticks");
  const abyssalLiveLoopBeforeHash = await canvasPixelHash(page, ".three-host canvas");
  await startAgentLoopFromUi(page);
  await expect(page.getByLabel("Agent loop controls")).toContainText(`${LIVE_LOOP_INTERVAL_MS}ms`);
  await expect.poll(() => autonomousTickCount(page), { timeout: 10_000 }).toBeGreaterThan(6);
  await expect(page.getByLabel("Agent loop controls")).toContainText(/Checkpoints\s*\d+/);
  await expect.poll(() => canvasPixelHash(page, ".three-host canvas"), {
    message: "generic imported world live agent loop should visibly update the 3D scene",
    timeout: 10_000,
  }).not.toEqual(abyssalLiveLoopBeforeHash);
  await expect(page.getByLabel("3D agent activity")).toContainText(/Autonomous t\d+/);
  await page.screenshot({ path: join(ARTIFACT_DIR, "08-abyssal-live-loop.png") });
  await page.getByLabel("Agent loop controls").getByRole("button", { name: "Restore latest" }).click();
  await expect(page.getByLabel("Agent loop controls")).toContainText(/Restored checkpoint: world tick \d+/);
  await expect(page.getByLabel("Agent loop controls")).toContainText("stopped");
  await expect(page.getByRole("heading", { name: "Abyssal Salvage Playable Slice" })).toBeVisible();
  await expect(page.locator(".objective-tracker")).toContainText("Recover Turbine gear for Paxel");
  await expect(page.getByLabel("3D travel")).toContainText("At Reef Dome");
  await expect(page.locator(".three-host canvas")).toBeVisible();
  await expect.poll(() => nonBlankCanvasPixels(page, ".three-host canvas"), { message: "restored Abyssal checkpoint should keep 3D canvas nonblank", timeout: 10_000 }).toBeGreaterThan(40);
  await page.screenshot({ path: join(ARTIFACT_DIR, "09-abyssal-checkpoint-restore.png") });
}

async function quickSaveImportedAbyssal(page: Page): Promise<void> {
  await clickButton(page, "Slot Save");
  await expect(page.locator(".header-toast")).toContainText("Quick saved: Abyssal Salvage Playable Slice", { timeout: 5_000 });
}

async function quickLoadImportedAbyssal(page: Page): Promise<void> {
  await clickButton(page, "Slot Load");
  await expect(page.locator(".header-toast")).toContainText("Quick loaded: Abyssal Salvage Playable Slice", { timeout: 5_000 });
  await expect(page.getByRole("heading", { name: "Abyssal Salvage Playable Slice" })).toBeVisible();
  await expect(page.locator(".objective-tracker")).toContainText("Recover Turbine gear for Paxel");
  await expect(page.getByLabel("3D travel")).toContainText("At Reef Dome");
  await expect(page.locator(".three-host canvas")).toBeVisible();
  await expect.poll(() => nonBlankCanvasPixels(page, ".three-host canvas"), { message: "quick-loaded imported Abyssal 3D canvas should render nonblank pixels", timeout: 10_000 }).toBeGreaterThan(40);
  await page.screenshot({ path: join(ARTIFACT_DIR, "10-abyssal-quick-load.png") });
}

async function verifyImportedPackageReview(page: Page): Promise<void> {
  await clickButton(page, "Review");
  await expect(page.locator(".header-toast")).toContainText("Package healthy.", { timeout: 5_000 });
  const review = page.getByRole("dialog", { name: "Story package review" });
  await expect(review).toBeVisible();
  await expect(review).toContainText("Abyssal Salvage: World Ingest Slice");
  await expectPackageMetric(review, "Locations", "6");
  await expectPackageMetric(review, "NPCs", "5");
  await expectPackageMetric(review, "Quests", "3");
  await expectPackageMetric(review, "Props", "3");
  await expect(review).toContainText("No structural issues found.");
  await page.screenshot({ path: join(ARTIFACT_DIR, "11-abyssal-package-review.png") });
  await page.getByRole("button", { name: "Close package review" }).click();
  await expect(review).toHaveCount(0);
}

async function verifyMobileImportedAbyssal(browser: Awaited<ReturnType<typeof chromium.launch>>): Promise<void> {
  const mobile = await browser.newPage({ viewport: { width: 390, height: 720 } });
  try {
    await mobile.goto(BASE_URL);
    await mobile.waitForLoadState("domcontentloaded");
    await expect(mobile.locator(".app-shell")).toHaveClass(/focus-mode/);
    await expect(mobile.getByRole("button", { name: "HUD" })).toHaveAttribute("aria-pressed", "true");
    await expect(mobile.getByRole("button", { name: "3D" })).toHaveClass(/active/);
    await expect(mobile.locator(".three-host canvas")).toBeVisible();
    await expect.poll(() => nonBlankCanvasPixels(mobile, ".three-host canvas"), { message: "Abyssal mobile 3D canvas should render nonblank pixels", timeout: 10_000 }).toBeGreaterThan(40);
    await expect(mobile.getByLabel("3D travel")).toContainText("At Reef Dome");
    await expect(mobile.locator(".objective-tracker")).toContainText("Recover Turbine gear for Paxel");
    await expect(mobile.getByRole("button", { name: "Go Sonar Array" })).toBeVisible();
    await mobile.getByRole("button", { name: "Go Sonar Array" }).click();
    await expect(mobile.getByLabel("3D travel")).toContainText("At Sonar Array");
    await expectNoVerticalOverlap(mobile, ".view-toggle", ".three-overlay");
    await expectNoVerticalOverlap(mobile, ".three-overlay", ".objective-tracker");
    await mobile.screenshot({ path: join(ARTIFACT_DIR, "08-abyssal-mobile.png") });
  } finally {
    await mobile.close();
  }
}

async function importSource(page: Page, sourcePath: string): Promise<void> {
  await page.locator("input[aria-label='World source JSON']").setInputFiles(sourcePath);
}

async function importInvalidSource(page: Page, sourcePath: string): Promise<void> {
  await page.locator("input[aria-label='World source JSON']").setInputFiles(sourcePath);
  await expect(page.locator(".header-toast")).toContainText("World import failed: invalid_world_source", { timeout: 8_000 });
}

async function expectGeneratedPortrait(page: Page, npcName: string): Promise<void> {
  const portrait = page.locator(".dialogue-panel .portrait img");
  await expect(portrait).toHaveCount(1);
  const src = await portrait.getAttribute("src");
  expect(src?.startsWith("data:image/svg+xml,")).toBe(true);
  expect(decodeURIComponent(src!.replace("data:image/svg+xml,", ""))).toContain(`${npcName} `);
  expect(decodeURIComponent(src!.replace("data:image/svg+xml,", ""))).toContain("generated portrait");
  await expect.poll(() => portrait.evaluate((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0), { message: `${npcName} generated portrait should load as an image`, timeout: 10_000 }).toBe(true);
}

async function openAgentsPanel(page: Page): Promise<void> {
  const agents = page.locator("details").filter({ has: page.locator("summary", { hasText: "Agents" }) });
  await expect(agents).toHaveCount(1);
  if ((await agents.getAttribute("open")) === null) await agents.locator("summary").click();
}

async function startAgentLoopFromUi(page: Page): Promise<void> {
  await openAgentsPanel(page);
  const start = page.getByLabel("Agent loop controls").getByRole("button", { name: "Start" });
  await expect(start).toBeEnabled();
  await start.click();
  await expect(page.getByLabel("Agent loop controls")).toContainText("running", { timeout: 15_000 });
}

async function autonomousTickCount(page: Page): Promise<number> {
  const text = await page.getByLabel("Agent loop controls").innerText();
  const match = /(\d+) autonomous ticks/.exec(text);
  return match ? Number(match[1]) : 0;
}

function objective(page: Page): Locator {
  return page.locator(".objective-tracker");
}

async function clickObjective(page: Page, label: string): Promise<void> {
  const locator = objective(page).getByRole("button", { name: label });
  try {
    await clickUnique(locator);
  } catch (error) {
    const text = await objective(page).innerText().catch(() => "(objective unavailable)");
    throw new Error(`Objective button ${label} was not available. Current objective: ${text}. ${(error as Error).message}`);
  }
}

async function clickButton(page: Page, label: string): Promise<void> {
  await clickUnique(page.getByRole("button", { name: label }));
}

async function clickTravelStrip(page: Page, destination: string, travelText: string): Promise<void> {
  await clickUnique(page.getByRole("button", { name: `Go ${destination}` }));
  await expect(page.getByLabel("3D travel")).toContainText(travelText, { timeout: 10_000 });
}

async function travelViaObjectiveOr3dStrip(page: Page, travelText: string): Promise<void> {
  await clickObjective(page, "Go");
  await expect(page.getByLabel("3D travel")).toContainText(travelText, { timeout: 20_000 });
}

async function clickThreeTarget(page: Page, label: string): Promise<void> {
  try {
    await hoverThreeTarget(page, label);
  } catch (error) {
    if (!String((error as Error).message).includes("Could not find 3D target")) throw error;
    await page.locator(".three-host").focus();
    await page.keyboard.press("e");
    await expect(page.getByLabel("3D target")).toContainText(label);
    return;
  }
  await page.getByRole("button", { name: `Interact with ${sceneTargetName(label)}` }).click();
}

function sceneTargetName(readout: string): string {
  return readout.replace(/^(Pick up|Talk|Inspect|Travel) /, "");
}

async function hoverThreeTarget(page: Page, label: string): Promise<{ x: number; y: number }> {
  const canvas = page.locator(".three-host canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("3D canvas is not visible");
  const seen = new Set<string>();

  for (const y of [0.5, 0.16, 0.24, 0.32, 0.4, 0.48, 0.56, 0.64, 0.72, 0.8, 0.88]) {
    for (const x of [0.5, 0.08, 0.16, 0.24, 0.32, 0.4, 0.48, 0.56, 0.64, 0.72, 0.8, 0.88]) {
      const point = { x: box.x + box.width * x, y: box.y + box.height * y };
      await page.mouse.move(point.x, point.y);
      await page.waitForTimeout(15);
      const readout = await page.getByLabel("3D target").innerText();
      if (readout !== "No scene target") seen.add(readout);
      if (readout.includes(label)) return point;
    }
  }

  throw new Error(`Could not find 3D target: ${label}. Saw: ${[...seen].join(", ") || "none"}`);
}

async function clickUnique(locator: Locator): Promise<void> {
  await expect(locator).toHaveCount(1, { timeout: 10_000 });
  await locator.click();
}

async function expectPackageMetric(review: Locator, label: string, value: string): Promise<void> {
  await expect.poll(async () => review.evaluate((node, label) => {
    const rows = [...node.querySelectorAll("dl > div")];
    const row = rows.find((item) => item.querySelector("dt")?.textContent?.trim() === label);
    return row?.querySelector("dd")?.textContent?.trim() ?? null;
  }, label), { message: `${label} package metric should be ${value}` }).toBe(value);
}

async function expectNoVerticalOverlap(page: Page, upperSelector: string, lowerSelector: string): Promise<void> {
  const boxes = await page.evaluate(({ upperSelector, lowerSelector }) => {
    const upper = document.querySelector(upperSelector)?.getBoundingClientRect();
    const lower = document.querySelector(lowerSelector)?.getBoundingClientRect();
    return upper && lower ? { upperBottom: upper.bottom, lowerTop: lower.top } : null;
  }, { upperSelector, lowerSelector });
  expect(boxes).not.toBeNull();
  expect(boxes!.lowerTop).toBeGreaterThanOrEqual(boxes!.upperBottom + 6);
}

async function nonBlankCanvasPixels(page: Page, selector: string): Promise<number> {
  return page.locator(selector).evaluate((canvas) => {
    const source = canvas as HTMLCanvasElement;
    const probe = document.createElement("canvas");
    probe.width = 32;
    probe.height = 32;
    const ctx = probe.getContext("2d");
    if (!ctx || source.width === 0 || source.height === 0) return 0;
    ctx.drawImage(source, 0, 0, probe.width, probe.height);
    const pixels = ctx.getImageData(0, 0, probe.width, probe.height).data;
    let visible = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i] ?? 0;
      const g = pixels[i + 1] ?? 0;
      const b = pixels[i + 2] ?? 0;
      if (r + g + b > 8) visible += 1;
    }
    return visible;
  });
}

async function canvasPixelHash(page: Page, selector: string): Promise<string> {
  return page.locator(selector).evaluate((canvas) => {
    const source = canvas as HTMLCanvasElement;
    const probe = document.createElement("canvas");
    probe.width = 48;
    probe.height = 48;
    const ctx = probe.getContext("2d");
    if (!ctx || source.width === 0 || source.height === 0) return "blank";
    ctx.drawImage(source, 0, 0, probe.width, probe.height);
    const pixels = ctx.getImageData(0, 0, probe.width, probe.height).data;
    let hash = 2166136261;
    for (let i = 0; i < pixels.length; i += 12) {
      hash ^= pixels[i] ?? 0;
      hash = Math.imul(hash, 16777619);
      hash ^= pixels[i + 1] ?? 0;
      hash = Math.imul(hash, 16777619);
      hash ^= pixels[i + 2] ?? 0;
      hash = Math.imul(hash, 16777619);
    }
    return hash.toString(16);
  });
}

async function restoreWorld(): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${API_PORT}/api/restore`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: readFileSync(WORLD, "utf8"),
  });
  if (!response.ok) throw new Error(`Restore failed: HTTP ${response.status}`);
}

async function waitForHttp(url: string, timeoutMs = 12_000): Promise<void> {
  const started = Date.now();
  let lastError: unknown;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function stopProcess(child: ChildProcess): void {
  if (!child.killed) child.kill();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
