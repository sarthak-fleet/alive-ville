import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { chromium, expect, type Page } from "@playwright/test";

const API_PORT = Number(process.env["PLAYTEST_API_PORT"] ?? 5674);
const WEB_PORT = Number(process.env["PLAYTEST_WEB_PORT"] ?? 5675);
const BASE_URL = `http://127.0.0.1:${WEB_PORT}`;
const ARTIFACT_DIR = process.env["PLAYTEST_ARTIFACT_DIR"] ?? "tmp/playtest-artifacts/world-ingest";
const TSX = new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url).pathname;
const VITE = new URL("../../node_modules/vite/bin/vite.js", import.meta.url).pathname;
const SERVER = new URL("../../src/server.ts", import.meta.url).pathname;
const WORLD = new URL("../../worlds/village.json", import.meta.url).pathname;
const SKYFRONT = new URL("../../fixtures/worlds/skyfront-source.json", import.meta.url).pathname;
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
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  try {
    await page.goto(BASE_URL);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: "Ashbend Village" })).toBeVisible();

    await importSource(page, SKYFRONT);
    await expect(page.getByRole("heading", { name: "Skyfront Couriers Playable Slice" })).toBeVisible();
    await expect(page.locator(".objective-tracker")).toContainText("Recover Route token for Mara");
    await expect(page.getByRole("button", { name: "3D" })).toHaveClass(/active/);
    await expect(page.locator(".three-host canvas")).toBeVisible();
    await expect.poll(() => nonBlankCanvasPixels(page, ".three-host canvas")).toBeGreaterThan(40);
    await page.screenshot({ path: join(ARTIFACT_DIR, "01-skyfront-3d.png") });

    await importSource(page, OPM);
    await expect(page.getByRole("heading", { name: "One Punch Man Playable Slice" })).toBeVisible();
    await expect(page.locator(".objective-tracker")).toContainText("Recover Grocery coupon for Saitama");
    await page.screenshot({ path: join(ARTIFACT_DIR, "02-opm-source.png") });
    await expect(errors, errors.join("\n")).toEqual([]);
  } finally {
    await page.close();
    await browser.close();
  }
}

async function importSource(page: Page, sourcePath: string): Promise<void> {
  await page.locator("input[aria-label='World source JSON']").setInputFiles(sourcePath);
  await expect(page.locator(".header-toast")).toContainText("World source imported", { timeout: 8_000 });
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
