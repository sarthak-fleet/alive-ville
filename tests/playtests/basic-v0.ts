import { type ChildProcess,spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { chromium, expect, type Locator, type Page } from "@playwright/test";

const API_PORT = Number(process.env["PLAYTEST_API_PORT"] ?? 5374);
const WEB_PORT = Number(process.env["PLAYTEST_WEB_PORT"] ?? 5375);
const BASE_URL = `http://127.0.0.1:${WEB_PORT}`;
const ARTIFACT_DIR = process.env["PLAYTEST_ARTIFACT_DIR"] ?? "tmp/playtest-artifacts/basic-v0";
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
    await runBasicV0Playtest();
  } finally {
    stopProcess(web);
    stopProcess(api);
  }
}

async function runBasicV0Playtest(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  try {
    await page.goto(BASE_URL);
    await page.waitForLoadState("domcontentloaded");
    await expect(objective(page)).toContainText("Return the pruning shears");
    await openScenesPanel(page);
    await expect(sceneRow(page, "Forge Rekindled").getByRole("button", { name: "Locked" })).toBeDisabled();
    await expect(sceneRow(page, "Lantern Shadow").getByRole("button", { name: "Locked" })).toBeDisabled();
    await page.screenshot({ path: join(ARTIFACT_DIR, "01-start.png") });

    await completeQuest(page, {
      title: "Return the pruning shears",
      acceptNpc: "Mira",
      itemText: "Find Pruning shears",
      returnText: "Bring Pruning shears to Mira",
      completeButton: "Complete: Give Pruning shears",
      completedText: "Return the pruning shears is complete",
      nextTitle: "Rekindle the old forge",
      artifactPrefix: "shears",
    });
    await expect(sceneRow(page, "Mira's Garden").getByRole("button", { name: "Play" })).toBeEnabled();

    await completeQuest(page, {
      title: "Rekindle the old forge",
      acceptNpc: "Tomas",
      itemText: "Find Dry bellows leather",
      returnText: "Bring Dry bellows leather to Tomas",
      completeButton: "Complete: Give Dry bellows leather",
      completedText: "Rekindle the old forge is complete",
      nextTitle: "Listen at the old bridge",
      artifactPrefix: "forge",
    });

    await completeQuest(page, {
      title: "Listen at the old bridge",
      acceptNpc: "Lena",
      itemText: "Find Cold blue ember",
      returnText: "Bring Cold blue ember to Lena",
      completeButton: "Complete: Give Cold blue ember",
      completedText: "Listen at the old bridge is complete",
      nextTitle: null,
      artifactPrefix: "bridge",
    });

    await expect(objective(page)).toContainText("Go to Lantern Inn before nightfall");
    await expect(page.locator(".cutscene-player")).toContainText("Bridge Whisper", { timeout: 5_000 });
    await clickButton(page, "Continue");
    await expect(page.locator(".cutscene-player")).toContainText("Lantern Shadow", { timeout: 5_000 });
    await clickButton(page, "Continue");
    await expect(sceneRow(page, "Lantern Shadow").getByRole("button", { name: "Play" })).toBeEnabled();

    await clickObjective(page, "Go");
    await expect(objective(page)).toContainText("Confront the Lantern Shadow");
    await clickObjective(page, "Confront");
    await expect(objective(page)).toContainText("Nightfall held");
    await closeCutsceneIfVisible(page);
    await expect(sceneRow(page, "Dawn Over Ashbend").getByRole("button", { name: "Play" })).toBeEnabled();
    await expect(objective(page).getByText("Nightfall held")).toBeVisible();
    await page.screenshot({ path: join(ARTIFACT_DIR, "10-nightfall-resolved.png") });
  } finally {
    await page.close();
    await browser.close();
  }
}

async function completeQuest(
  page: Page,
  quest: {
    title: string;
    acceptNpc: string;
    itemText: string;
    returnText: string;
    completeButton: string;
    completedText: string;
    nextTitle: string | null;
    artifactPrefix: string;
  }
): Promise<void> {
  await expect(objective(page)).toContainText(quest.title);
  await clickObjective(page, "Go");
  await expect(objective(page)).toContainText(`Talk to ${quest.acceptNpc}`);
  await clickObjective(page, "Talk");
  await clickButton(page, "Accept task");
  await expect(objective(page)).toContainText(quest.itemText);
  await page.screenshot({ path: join(ARTIFACT_DIR, `${quest.artifactPrefix}-01-accepted.png`) });

  await clickObjective(page, "Go");
  await expect(objective(page)).toContainText("Pick up");
  await clickObjective(page, "Pick up");
  await expect(objective(page)).toContainText(quest.returnText);
  await page.screenshot({ path: join(ARTIFACT_DIR, `${quest.artifactPrefix}-02-item-held.png`) });

  await clickObjective(page, "Go");
  await expect(objective(page)).toContainText("Talk");
  await clickObjective(page, "Talk");
  await clickButton(page, quest.completeButton);
  await expect(page.locator(".outcome-toast")).toContainText(quest.completedText);
  if (quest.nextTitle) {
    await expect(objective(page)).toContainText(quest.nextTitle);
  }
  if (quest.nextTitle) await closeCutsceneIfVisible(page);
  await page.screenshot({ path: join(ARTIFACT_DIR, `${quest.artifactPrefix}-03-complete.png`) });
}

function objective(page: Page): Locator {
  return page.locator(".objective-tracker");
}

function sceneRow(page: Page, title: string): Locator {
  return page.locator(".cutscene-list li").filter({ hasText: title });
}

async function openScenesPanel(page: Page): Promise<void> {
  const scenes = page.locator("details").filter({ has: page.locator("summary", { hasText: "Scenes" }) });
  if (await scenes.getAttribute("open") === null) {
    await scenes.locator("summary").click();
  }
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

async function closeCutsceneIfVisible(page: Page, waitForGone = true): Promise<void> {
  const player = page.locator(".cutscene-player");
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if ((await player.count()) === 0) break;
    await page.getByRole("button", { name: "Continue" }).click();
    if (!waitForGone) return;
    await page.waitForTimeout(100);
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
