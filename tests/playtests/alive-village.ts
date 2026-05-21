import { type ChildProcess,spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { chromium, expect, type Page } from "@playwright/test";

const API_PORT = Number(process.env["PLAYTEST_API_PORT"] ?? 5474);
const WEB_PORT = Number(process.env["PLAYTEST_WEB_PORT"] ?? 5475);
const BASE_URL = `http://127.0.0.1:${WEB_PORT}`;
const ARTIFACT_DIR = process.env["PLAYTEST_ARTIFACT_DIR"] ?? "tmp/playtest-artifacts/alive-village";
const TSX = new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url).pathname;
const VITE = new URL("../../node_modules/vite/bin/vite.js", import.meta.url).pathname;
const SERVER = new URL("../../src/server.ts", import.meta.url).pathname;
const WORLD = new URL("../../worlds/village.json", import.meta.url).pathname;

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
    await runAliveVillagePlaytest();
  } finally {
    stopProcess(web);
    stopProcess(api);
  }
}

async function runAliveVillagePlaytest(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  try {
    await page.goto(BASE_URL);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator(".objective-tracker")).toContainText("Return the pruning shears");
    await expect(page.locator(".three-host canvas")).toHaveCount(1);
    await expect(page.locator(".three-host canvas")).toBeVisible();
    await expect(page.getByRole("button", { name: "3D" })).toHaveClass(/active/);
    await expect.poll(() => nonBlankCanvasPixels(page, ".three-host canvas")).toBeGreaterThan(40);

    const sound = page.getByRole("button", { name: "Sound" });
    await expect(sound).toHaveCount(1);
    await sound.click();
    await expect(page.getByRole("button", { name: "Sound on" })).toHaveAttribute("aria-pressed", "true");
    await openAgentsPanel(page);
    await expect(page.getByLabel("Agent loop controls")).toContainText("idle");
    await page.getByLabel("Agent loop controls").getByRole("button", { name: "Step" }).click();
    await expect(page.getByLabel("Agent loop controls")).toContainText("1 autonomous ticks");
    await page.getByLabel("Agent loop controls").getByRole("button", { name: "Start" }).click();
    await expect(page.getByLabel("Agent loop controls")).toContainText("running");
    await page.getByLabel("Agent loop controls").getByRole("button", { name: "Stop" }).click();
    await expect(page.getByLabel("Agent loop controls")).toContainText("stopped");

    await page.screenshot({ path: join(ARTIFACT_DIR, "01-sound-on.png") });
    await page.waitForTimeout(7_500);
    await page.screenshot({ path: join(ARTIFACT_DIR, "02-ambient-wait.png") });

    await expect(page.getByLabel("3D travel")).toContainText("At Village Square");
    await expect(page.getByRole("button", { name: "Go Herb Garden" })).toBeVisible();
    await page.getByRole("button", { name: "Go Herb Garden" }).click();
    await expect(page.getByLabel("3D travel")).toContainText("At Herb Garden");
    await page.locator(".three-host canvas").click({ position: { x: 620, y: 320 } });
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
      await expectNoVerticalOverlap(mobile, ".view-toggle", ".three-overlay");
      await expectNoVerticalOverlap(mobile, ".three-overlay", ".objective-tracker");
      await mobile.screenshot({ path: join(ARTIFACT_DIR, "04-three-world-mobile.png") });
    } finally {
      await mobile.close();
    }

    await page.getByRole("button", { name: "Sound on" }).click();
    await expect(page.getByRole("button", { name: "Sound" })).toHaveAttribute("aria-pressed", "false");
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

async function expectNoVerticalOverlap(page: Page, upperSelector: string, lowerSelector: string): Promise<void> {
  const boxes = await page.evaluate(({ upperSelector, lowerSelector }) => {
    const upper = document.querySelector(upperSelector)?.getBoundingClientRect();
    const lower = document.querySelector(lowerSelector)?.getBoundingClientRect();
    return upper && lower ? { upperBottom: upper.bottom, lowerTop: lower.top } : null;
  }, { upperSelector, lowerSelector });
  expect(boxes).not.toBeNull();
  expect(boxes!.lowerTop).toBeGreaterThanOrEqual(boxes!.upperBottom + 6);
}

async function openAgentsPanel(page: Page): Promise<void> {
  const agents = page.locator("details").filter({ has: page.locator("summary", { hasText: "Agents" }) });
  if (await agents.getAttribute("open") === null) {
    await agents.locator("summary").click();
  }
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
