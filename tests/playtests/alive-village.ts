import { type ChildProcess,spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { chromium, expect, type Page } from "@playwright/test";

const API_PORT = Number(process.env["PLAYTEST_API_PORT"] ?? 5474);
const WEB_PORT = Number(process.env["PLAYTEST_WEB_PORT"] ?? 5475);
const LIVE_LOOP_INTERVAL_MS = 500;
const BASE_URL = `http://127.0.0.1:${WEB_PORT}`;
const ARTIFACT_DIR = process.env["PLAYTEST_ARTIFACT_DIR"] ?? "tmp/playtest-artifacts/alive-village";
const TSX = new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url).pathname;
const VITE = new URL("../../node_modules/vite/bin/vite.js", import.meta.url).pathname;
const SERVER = new URL("../../src/server.ts", import.meta.url).pathname;
const WORLD = new URL("../../worlds/village.json", import.meta.url).pathname;

async function main(): Promise<void> {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const checkpointFile = join(ARTIFACT_DIR, "agent-loop-checkpoints.json");
  rmSync(checkpointFile, { force: true });
  const api = spawn(process.execPath, [TSX, SERVER], {
    env: {
      ...process.env,
      PORT: String(API_PORT),
      AGENT_LOOP_INTERVAL_MS: String(LIVE_LOOP_INTERVAL_MS),
      AGENT_LOOP_CHECKPOINT_FILE: checkpointFile,
      LLM_API_KEY: "",
      LLM_BASE_URL: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const web = spawn(process.execPath, [VITE, "--host", "127.0.0.1", "--port", String(WEB_PORT), "--strictPort"], {
    env: { ...process.env, SERVER_PORT: String(API_PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await Promise.all([waitForHttp(`http://127.0.0.1:${API_PORT}/api/state`), waitForHttp(BASE_URL)]);
    await restoreWorld();
    await runAliveVillagePlaytest(api);
  } finally {
    stopProcess(web);
    stopProcess(api);
  }
}

async function runAliveVillagePlaytest(api: ChildProcess): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors: string[] = [];
  let allowRecoverableNetworkError = false;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && !(allowRecoverableNetworkError && text.includes("502 (Bad Gateway)"))) errors.push(text);
  });

  try {
    await page.goto(BASE_URL);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator(".objective-tracker")).toContainText("Return the pruning shears");
    await expect(page.locator(".three-host canvas")).toHaveCount(1);
    await expect(page.locator(".three-host canvas")).toBeVisible();
    await expect(page.getByRole("button", { name: "3D" })).toHaveClass(/active/);
    await expect.poll(() => nonBlankCanvasPixels(page, ".three-host canvas")).toBeGreaterThan(40);
    await choosePlayableCharacter(page, "Tomas", "At Old Forge");
    await restoreWorld();
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator(".objective-tracker")).toContainText("Return the pruning shears");
    await expect(page.getByLabel("3D travel")).toContainText("At Village Square");
    await page.getByRole("button", { name: "Focus" }).click();
    await expect(page.getByRole("button", { name: "HUD" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".hud-panel")).toBeHidden();
    await expect(page.locator("header")).toBeHidden();
    await expect(page.locator(".objective-tracker")).toBeVisible();
    await expect(page.getByLabel("3D travel")).toBeVisible();
    await expect(page.locator(".three-host canvas")).toBeVisible();
    await expectNoHorizontalOverlap(page, ".view-toggle", ".objective-tracker");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Focus" })).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".hud-panel")).toBeVisible();

    const sound = page.getByRole("button", { name: "Sound" });
    await expect(sound).toHaveCount(1);
    await sound.click();
    await expect(page.getByRole("button", { name: "Sound on" })).toHaveAttribute("aria-pressed", "true");
    await openAgentsPanel(page);
    await expect(page.getByLabel("Agent loop controls")).toContainText("idle");
    await page.getByLabel("Agent loop controls").getByRole("button", { name: "Step" }).click();
    await expect(page.getByLabel("Agent loop controls")).toContainText("1 autonomous ticks");
    await expect(page.getByLabel("3D agent activity")).toContainText("Autonomous t1");
    for (let i = 0; i < 5; i += 1) {
      await page.getByLabel("Agent loop controls").getByRole("button", { name: "Step" }).click();
    }
    await expect(page.getByLabel("Agent loop controls")).toContainText("6 autonomous ticks");
    await expect(page.getByLabel("Agent loop controls")).toContainText(/Checkpoints\s*1/);
    await expect(page.locator("header")).toContainText(/Day 1 \u00b7 20:00/);
    await page.getByLabel("Agent loop controls").getByRole("button", { name: "Restore latest" }).click();
    await expect(page.getByLabel("Agent loop controls")).toContainText("Restored checkpoint: world tick 5");
    await expect(page.getByLabel("Agent loop controls")).toContainText("stopped");
    await expect(page.locator("header")).toContainText(/Day 1 \u00b7 18:00/);
    await expect(page.getByLabel("3D agent activity")).toContainText("Autonomous agents waiting");
    const liveLoopBeforeHash = await canvasPixelHash(page, ".three-host canvas");
    await page.getByLabel("Agent loop controls").getByRole("button", { name: "Start" }).click();
    await expect(page.getByLabel("Agent loop controls")).toContainText("running");
    await expect(page.getByLabel("Agent loop controls")).toContainText(`${LIVE_LOOP_INTERVAL_MS}ms`);
    await expect.poll(() => autonomousTickCount(page)).toBeGreaterThan(6);
    await expect.poll(() => canvasPixelHash(page, ".three-host canvas"), { message: "live agent loop should visibly update the 3D scene", timeout: 10_000 }).not.toEqual(liveLoopBeforeHash);
    await expect(page.getByLabel("3D agent activity")).toContainText(/Autonomous t(?:[7-9]|\d{2,})/);
    await page.getByLabel("Agent loop controls").getByRole("button", { name: "Stop" }).click();
    await expect(page.getByLabel("Agent loop controls")).toContainText("stopped");

    await page.screenshot({ path: join(ARTIFACT_DIR, "01-sound-on.png") });
    await page.waitForTimeout(7_500);
    await page.screenshot({ path: join(ARTIFACT_DIR, "02-ambient-wait.png") });

    await expect(page.getByLabel("3D travel")).toContainText("At Village Square");
    await expect(page.getByLabel("3D renderer status")).toContainText("3D renderer ready");
    await page.locator(".three-host canvas").dispatchEvent("webglcontextlost");
    await expect(page.getByLabel("3D renderer status")).toContainText("3D renderer paused");
    await page.locator(".three-host canvas").dispatchEvent("webglcontextrestored");
    await expect(page.getByLabel("3D renderer status")).toContainText("3D renderer restored");
    await expect(page.getByLabel("3D camera controls")).toBeVisible();
    await expect(page.getByLabel("3D camera bearing")).toContainText("34 deg");
    await expect(page.getByLabel("3D camera zoom")).toContainText("50%");
    const cameraBefore = await canvasPixelHash(page, ".three-host canvas");
    await page.getByRole("button", { name: "Rotate camera right" }).click();
    await expect(page.getByLabel("3D camera bearing")).toContainText("56 deg");
    await expect.poll(() => canvasPixelHash(page, ".three-host canvas")).not.toEqual(cameraBefore);
    const zoomBefore = await canvasPixelHash(page, ".three-host canvas");
    await page.getByRole("button", { name: "Zoom camera in" }).click();
    await expect(page.getByLabel("3D camera zoom")).toContainText("69%");
    await expect.poll(() => canvasPixelHash(page, ".three-host canvas")).not.toEqual(zoomBefore);
    await page.getByRole("button", { name: "Zoom camera out" }).click();
    await expect(page.getByLabel("3D camera zoom")).toContainText("50%");
    await page.getByRole("button", { name: "Reset camera" }).click();
    await expect(page.getByLabel("3D camera bearing")).toContainText("34 deg");
    await expect(page.getByLabel("3D camera zoom")).toContainText("50%");
    await page.locator(".three-host").focus();
    await page.keyboard.press("d");
    const travelStartHash = await canvasPixelHash(page, ".three-host canvas");
    await expect(page.getByLabel("3D travel")).toContainText("At Herb Garden");
    await page.waitForTimeout(260);
    await expect.poll(() => canvasPixelHash(page, ".three-host canvas")).not.toEqual(travelStartHash);
    await page.keyboard.press("a");
    await expect(page.getByLabel("3D travel")).toContainText("At Village Square");
    await expect(page.getByRole("button", { name: "Go Herb Garden" })).toBeVisible();
    await page.getByRole("button", { name: "Go Herb Garden" }).click();
    await expect(page.getByLabel("3D travel")).toContainText("At Herb Garden");
    await hoverThreeTarget(page, "Talk Mira");
    await expect(page.getByRole("button", { name: "Interact with Mira" })).toBeEnabled();
    await page.getByRole("button", { name: "Interact with Mira" }).click();
    await expect(page.locator(".dialogue-panel")).toContainText("Mira");
    await page.getByRole("button", { name: "Close" }).click();
    await page.screenshot({ path: join(ARTIFACT_DIR, "03-three-world.png") });

    const mobile = await browser.newPage({ viewport: { width: 390, height: 720 } });
    try {
      await mobile.goto(BASE_URL);
      await mobile.waitForLoadState("domcontentloaded");
      await expect(mobile.getByRole("button", { name: "3D" })).toHaveClass(/active/);
      await expect(mobile.locator(".three-host canvas")).toBeVisible();
      await expect.poll(() => nonBlankCanvasPixels(mobile, ".three-host canvas")).toBeGreaterThan(40);
      await expectWithinViewport(mobile, ".header-actions");
      await expectNoVerticalOverlap(mobile, ".header-actions", ".ambience-toggle");
      await expect(mobile.getByLabel("3D travel")).toContainText("At Herb Garden");
      await expect(mobile.getByRole("button", { name: "Go Village Square" })).toBeVisible();
      await mobile.getByRole("button", { name: "Go Village Square" }).click();
      await expect(mobile.getByLabel("3D travel")).toContainText("At Village Square");
      await expect(mobile.getByRole("button", { name: "Go Herb Garden" })).toBeVisible();
      await mobile.getByRole("button", { name: "Go Herb Garden" }).click();
      await expect(mobile.getByLabel("3D travel")).toContainText("At Herb Garden");
      await expectNoVerticalOverlap(mobile, ".view-toggle", ".three-overlay");
      await expectNoVerticalOverlap(mobile, ".three-overlay", ".objective-tracker");
      await mobile.screenshot({ path: join(ARTIFACT_DIR, "04-three-world-mobile.png") });
    } finally {
      await mobile.close();
    }

    await page.getByRole("button", { name: "Sound on" }).click();
    await expect(page.getByRole("button", { name: "Sound" })).toHaveAttribute("aria-pressed", "false");
    stopProcess(api);
    allowRecoverableNetworkError = true;
    await page.getByRole("button", { name: "Wait" }).click();
    await expect(page.getByLabel("Recoverable app error")).toContainText("Action failed");
    await expect(page.getByRole("heading", { name: "Ashbend Village" })).toBeVisible();
    await expect(page.locator(".three-host canvas")).toBeVisible();
    await page.screenshot({ path: join(ARTIFACT_DIR, "05-recoverable-error.png") });
    await page.getByRole("button", { name: "Dismiss" }).click();
    await expect(page.getByLabel("Recoverable app error")).toHaveCount(0);
    await expect(errors, errors.join("\n")).toEqual([]);
  } finally {
    await page.close();
    await browser.close();
  }
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

async function autonomousTickCount(page: Page): Promise<number> {
  const text = await page.getByLabel("Agent loop controls").innerText();
  const match = /(\d+) autonomous ticks/.exec(text);
  return match ? Number(match[1]) : 0;
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

async function expectNoHorizontalOverlap(page: Page, leftSelector: string, rightSelector: string): Promise<void> {
  const boxes = await page.evaluate(({ leftSelector, rightSelector }) => {
    const left = document.querySelector(leftSelector)?.getBoundingClientRect();
    const right = document.querySelector(rightSelector)?.getBoundingClientRect();
    return left && right ? { leftRight: left.right, rightLeft: right.left } : null;
  }, { leftSelector, rightSelector });
  expect(boxes).not.toBeNull();
  expect(boxes!.rightLeft).toBeGreaterThanOrEqual(boxes!.leftRight + 6);
}

async function expectWithinViewport(page: Page, selector: string): Promise<void> {
  const box = await page.evaluate((selector) => {
    const node = document.querySelector(selector)?.getBoundingClientRect();
    return node ? { left: node.left, right: node.right, top: node.top, bottom: node.bottom, width: window.innerWidth, height: window.innerHeight } : null;
  }, selector);
  expect(box).not.toBeNull();
  expect(box!.left).toBeGreaterThanOrEqual(0);
  expect(box!.right).toBeLessThanOrEqual(box!.width);
  expect(box!.top).toBeGreaterThanOrEqual(0);
  expect(box!.bottom).toBeLessThanOrEqual(box!.height);
}

async function openAgentsPanel(page: Page): Promise<void> {
  const agents = page.locator("details").filter({ has: page.locator("summary", { hasText: "Agents" }) });
  if (await agents.getAttribute("open") === null) {
    await agents.locator("summary").click();
  }
}

async function choosePlayableCharacter(page: Page, name: string, travelText: string): Promise<void> {
  const interact = page.locator("details").filter({ has: page.locator("summary", { hasText: "Interact" }) });
  if (await interact.getAttribute("open") === null) {
    await interact.locator("summary").click();
  }
  await interact.getByRole("combobox").first().selectOption({ label: name });
  await interact.getByRole("button", { name: "Choose" }).click();
  await expect(interact.locator(".hint").filter({ hasText: name })).toBeVisible();
  await expect(page.getByLabel("3D travel")).toContainText(travelText);
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
