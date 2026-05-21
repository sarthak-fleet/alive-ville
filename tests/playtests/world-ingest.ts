import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { chromium, expect, type Locator, type Page } from "@playwright/test";

const API_PORT = Number(process.env["PLAYTEST_API_PORT"] ?? 5674);
const WEB_PORT = Number(process.env["PLAYTEST_WEB_PORT"] ?? 5675);
const BASE_URL = `http://127.0.0.1:${WEB_PORT}`;
const ARTIFACT_DIR = process.env["PLAYTEST_ARTIFACT_DIR"] ?? "tmp/playtest-artifacts/world-ingest";
const TSX = new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url).pathname;
const VITE = new URL("../../node_modules/vite/bin/vite.js", import.meta.url).pathname;
const SERVER = new URL("../../src/server.ts", import.meta.url).pathname;
const WORLD = new URL("../../worlds/village.json", import.meta.url).pathname;
const SKYFRONT = new URL("../../fixtures/worlds/skyfront-source.json", import.meta.url).pathname;
const INVALID_WORLD = new URL("../../fixtures/worlds/invalid-source.json", import.meta.url).pathname;
const OPM = new URL("../../fixtures/anime/opm-ingest-source.json", import.meta.url).pathname;

async function main(): Promise<void> {
  mkdirSync(ARTIFACT_DIR, { recursive: true });

  const api = spawn(process.execPath, [TSX, SERVER], {
    env: { ...process.env, PORT: String(API_PORT), LLM_API_KEY: "", LLM_BASE_URL: "" },
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
    await expect(page.getByRole("heading", { name: "Ashbend Village" })).toBeVisible();
    await openAgentsPanel(page);
    await expect(page.getByLabel("Agent loop controls")).toContainText("idle");
    await page.getByLabel("Agent loop controls").getByRole("button", { name: "Start" }).click();
    await expect(page.getByLabel("Agent loop controls")).toContainText("running");

    await importSource(page, SKYFRONT);
    await expect(page.getByRole("heading", { name: "Skyfront Couriers Playable Slice" })).toBeVisible();
    await expect(page.getByLabel("Agent loop controls")).toContainText("stopped");
    await expect(page.locator(".objective-tracker")).toContainText("Recover Route token for Mara");
    await expect(page.getByRole("button", { name: "3D" })).toHaveClass(/active/);
    await expect(page.locator(".three-host canvas")).toBeVisible();
    await expect.poll(() => nonBlankCanvasPixels(page, ".three-host canvas")).toBeGreaterThan(40);
    await expect(page.getByLabel("3D travel")).toContainText("At Harbor Ring");
    const skyfrontStartHash = await canvasPixelHash(page, ".three-host canvas");
    await expect(page.getByRole("button", { name: "Go Rookery Deck" })).toBeVisible();
    await page.getByRole("button", { name: "Go Rookery Deck" }).click();
    await expect(page.getByLabel("3D travel")).toContainText("At Rookery Deck");
    await expect.poll(() => canvasPixelHash(page, ".three-host canvas")).not.toEqual(skyfrontStartHash);
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

    await importSource(page, OPM);
    await expect(page.getByRole("heading", { name: "One Punch Man Playable Slice" })).toBeVisible();
    await expect(page.locator(".objective-tracker")).toContainText("Recover Grocery coupon for Saitama");
    await page.screenshot({ path: join(ARTIFACT_DIR, "03-opm-source.png") });
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
  await clickButton(page, "Accept task");
  await clickButton(page, "Close");
  await expect(objective(page)).toContainText(quest.itemText);
  await clickObjective(page, "Go");
  await expect(page.getByLabel("3D travel")).toContainText(quest.travelText);
  await expect(page.locator(".three-host canvas")).toBeVisible();
  await expect.poll(() => nonBlankCanvasPixels(page, ".three-host canvas")).toBeGreaterThan(40);
  await expect(objective(page)).toContainText("Pick up");
  if (quest.pickupVia3d) {
    await clickThreeTarget(page, quest.pickupLabel);
  } else {
    await clickObjective(page, "Pick up");
  }
  await expect(objective(page)).toContainText(quest.returnText);
  await clickObjective(page, "Go");
  await expect(objective(page)).toContainText("Talk");
  await clickObjective(page, "Talk");
  await clickButton(page, quest.completeButton);
  await expect(page.locator(".outcome-toast")).toContainText(quest.completedText);
  await expect(page.locator(".dialogue-panel")).toContainText("That matters in Skyfront Couriers Playable Slice");
  await expect(page.locator(".dialogue-panel")).not.toContainText("That matters in Ashbend");
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

async function importSource(page: Page, sourcePath: string): Promise<void> {
  await page.locator("input[aria-label='World source JSON']").setInputFiles(sourcePath);
  await expect(page.locator(".header-toast")).toContainText("World source imported", { timeout: 8_000 });
}

async function importInvalidSource(page: Page, sourcePath: string): Promise<void> {
  await page.locator("input[aria-label='World source JSON']").setInputFiles(sourcePath);
  await expect(page.locator(".header-toast")).toContainText("World import failed: invalid_world_source", { timeout: 8_000 });
}

async function openAgentsPanel(page: Page): Promise<void> {
  const agents = page.locator("details").filter({ has: page.locator("summary", { hasText: "Agents" }) });
  await expect(agents).toHaveCount(1);
  if ((await agents.getAttribute("open")) === null) await agents.locator("summary").click();
}

function objective(page: Page): Locator {
  return page.locator(".objective-tracker");
}

async function clickObjective(page: Page, label: string): Promise<void> {
  await clickUnique(objective(page).getByRole("button", { name: label }));
}

async function clickButton(page: Page, label: string): Promise<void> {
  await clickUnique(page.getByRole("button", { name: label }));
}

async function clickThreeTarget(page: Page, label: string): Promise<void> {
  const point = await hoverThreeTarget(page, label);
  await page.mouse.click(point.x, point.y);
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
      if (readout !== "Hover a scene target") seen.add(readout);
      if (readout.includes(label)) return point;
    }
  }

  throw new Error(`Could not find 3D target: ${label}. Saw: ${[...seen].join(", ") || "none"}`);
}

async function clickUnique(locator: Locator): Promise<void> {
  await expect(locator).toHaveCount(1);
  await locator.click();
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
      if (r + g + b > 32) visible += 1;
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
