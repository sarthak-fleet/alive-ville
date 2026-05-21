import { type ChildProcess,spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { chromium, expect, type Locator, type Page } from "@playwright/test";

const API_PORT = Number(process.env["PLAYTEST_API_PORT"] ?? 5274);
const WEB_PORT = Number(process.env["PLAYTEST_WEB_PORT"] ?? 5275);
const BASE_URL = `http://127.0.0.1:${WEB_PORT}`;
const ARTIFACT_DIR = process.env["PLAYTEST_ARTIFACT_DIR"] ?? "tmp/playtest-artifacts";
const TSX = new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url).pathname;
const VITE = new URL("../../node_modules/vite/bin/vite.js", import.meta.url).pathname;
const SERVER = new URL("../../src/server.ts", import.meta.url).pathname;
const WORLD = new URL("../../worlds/village.json", import.meta.url).pathname;

async function main(): Promise<void> {
  mkdirSync(ARTIFACT_DIR, { recursive: true });

  const api = spawn(process.execPath, [TSX, SERVER], {
    env: {
      ...process.env,
      PORT: String(API_PORT),
      LLM_API_KEY: "",
      LLM_BASE_URL: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const web = spawn(process.execPath, [VITE, "--host", "127.0.0.1", "--port", String(WEB_PORT), "--strictPort"], {
    env: {
      ...process.env,
      SERVER_PORT: String(API_PORT),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await Promise.all([
      waitForHttp(`http://127.0.0.1:${API_PORT}/api/state`),
      waitForHttp(BASE_URL),
    ]);
    await restoreWorld();
    await runBrowserPlaytest();
  } finally {
    stopProcess(web);
    stopProcess(api);
  }
}

async function runBrowserPlaytest(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  try {
    await page.goto(BASE_URL);
    await page.waitForLoadState("domcontentloaded");
    await expect(objective(page)).toContainText("Return the pruning shears");
    await page.screenshot({ path: join(ARTIFACT_DIR, "01-start.png") });

    await clickObjective(page, "Go");
    await expect(objective(page)).toContainText("Talk to Mira");
    await clickObjective(page, "Talk");
    await clickButton(page, "Accept task");
    await expect(objective(page)).toContainText("Find Pruning shears");
    await clickButton(page, "Slot Save");
    await expect(page.locator(".header-toast")).toContainText("Quick saved", { timeout: 5_000 });
    await page.screenshot({ path: join(ARTIFACT_DIR, "02-accepted.png") });

    await clickObjective(page, "Go");
    await expect(objective(page)).toContainText("Pick up");
    await clickObjective(page, "Pick up");
    await expect(objective(page)).toContainText("Bring Pruning shears to Mira");
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: "Ashbend Village" })).toBeVisible();
    await expect(page.getByRole("button", { name: "3D" })).toHaveClass(/active/);
    await expect(page.locator(".three-host canvas")).toBeVisible();
    await expect(objective(page)).toContainText("Bring Pruning shears to Mira");
    await clickButton(page, "Slot Load");
    await expect(objective(page)).toContainText("Find Pruning shears");
    await expect(page.getByLabel("3D travel")).toContainText("At Herb Garden");
    await clickObjective(page, "Go");
    await expect(objective(page)).toContainText("Pick up");
    await clickObjective(page, "Pick up");
    await expect(objective(page)).toContainText("Bring Pruning shears to Mira");
    await page.screenshot({ path: join(ARTIFACT_DIR, "03-picked-up.png") });

    await clickObjective(page, "Go");
    await expect(objective(page)).toContainText("Talk");
    await clickObjective(page, "Talk");
    await clickButton(page, "Complete: Give Pruning shears");
    await expect(objective(page)).toContainText("Rekindle the old forge");
    await expect(page.locator(".outcome-toast")).toContainText("Return the pruning shears is complete");
    await page.screenshot({ path: join(ARTIFACT_DIR, "04-complete.png") });
  } finally {
    await page.close();
    await browser.close();
  }
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

async function clickUnique(locator: Locator): Promise<void> {
  await expect(locator).toHaveCount(1);
  await locator.click();
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
