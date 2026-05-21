import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { chromium, expect, type Locator, type Page } from "@playwright/test";

const API_PORT = Number(process.env["PLAYTEST_API_PORT"] ?? 5574);
const WEB_PORT = Number(process.env["PLAYTEST_WEB_PORT"] ?? 5575);
const BASE_URL = `http://127.0.0.1:${WEB_PORT}`;
const ARTIFACT_DIR = process.env["PLAYTEST_ARTIFACT_DIR"] ?? "tmp/playtest-artifacts/opm-world";
const TSX = new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url).pathname;
const VITE = new URL("../../node_modules/vite/bin/vite.js", import.meta.url).pathname;
const SERVER = new URL("../../src/server.ts", import.meta.url).pathname;
const WORLD = new URL("../../worlds/one-punch-man.json", import.meta.url).pathname;

async function main(): Promise<void> {
  mkdirSync(ARTIFACT_DIR, { recursive: true });

  const api = spawn(process.execPath, [TSX, SERVER], {
    env: { ...process.env, PORT: String(API_PORT), WORLD_FILE: WORLD, LLM_API_KEY: "", LLM_BASE_URL: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const web = spawn(process.execPath, [VITE, "--host", "127.0.0.1", "--port", String(WEB_PORT), "--strictPort"], {
    env: { ...process.env, SERVER_PORT: String(API_PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await Promise.all([waitForHttp(`http://127.0.0.1:${API_PORT}/api/state`), waitForHttp(BASE_URL)]);
    await restoreWorld();
    await runOpmWorldPlaytest();
  } finally {
    stopProcess(web);
    stopProcess(api);
  }
}

async function runOpmWorldPlaytest(): Promise<void> {
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
    await expect(page.locator(".three-host canvas")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "3D" })).toHaveClass(/active/);
    await expect(page.getByRole("heading", { name: "Z-City Patrol" })).toBeVisible();
    await expectObjective(page, "Recover Saitama's grocery coupon");
    await page.screenshot({ path: join(ARTIFACT_DIR, "01-z-city-start.png") });

    await completeQuest(page, {
      title: "Recover Saitama's grocery coupon",
      acceptNpc: "Saitama",
      itemText: "Find Grocery coupon",
      returnText: "Bring Grocery coupon to Saitama",
      completeButton: "Complete: Give Grocery coupon",
      completedText: "Recover Saitama's grocery coupon is complete",
      nextTitle: "Recover Genos's spare cyborg core",
      activeHint: "Training Lot",
      inspectText: "torn coupon edge",
      artifactPrefix: "saitama-coupon",
    });

    await completeQuest(page, {
      title: "Recover Genos's spare cyborg core",
      acceptNpc: "Genos",
      itemText: "Find Spare cyborg core",
      returnText: "Bring Spare cyborg core to Genos",
      completeButton: "Complete: Give Spare cyborg core",
      completedText: "Recover Genos's spare cyborg core is complete",
      nextTitle: "Verify the overpass monster sign",
      activeHint: "Monster Alley",
      artifactPrefix: "genos-core",
    });

    await completeQuest(page, {
      title: "Verify the overpass monster sign",
      acceptNpc: "Mumen Rider",
      itemText: "Find Monster scale",
      returnText: "Bring Monster scale to Mumen Rider",
      completeButton: "Complete: Give Monster scale",
      completedText: "Verify the overpass monster sign is complete",
      nextTitle: null,
      activeHint: "Ruined Overpass",
      artifactPrefix: "mumen-proof",
    });

    await expectObjective(page, "Report to Hero Association before the next monster alert");
    await clickObjective(page, "Go");
    await expectObjective(page, "Confront the Overpass Challenger");
    await clickObjective(page, "Fight");
    await expect(page.locator(".fight-cinematic")).toContainText("Clean Finisher");
    await expect(page.locator(".fight-cinematic")).toContainText("Speed-o'-Sound Sonic");
    await expect(page.locator(".outcome-toast.combat")).toContainText("restrained finisher");
    await expectObjective(page, "Z-City alert cleared");
    await page.screenshot({ path: join(ARTIFACT_DIR, "10-z-city-cleared.png") });
    await expect(errors, errors.join("\n")).toEqual([]);
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
    activeHint: string;
    inspectText?: string;
    artifactPrefix: string;
  }
): Promise<void> {
  await expectObjective(page, quest.title);
  await clickObjective(page, "Go");
  await expectObjective(page, `Talk to ${quest.acceptNpc}`);
  await clickObjective(page, "Talk");
  await expect(page.locator(".dialogue-panel")).toContainText(quest.acceptNpc);
  await page.screenshot({ path: join(ARTIFACT_DIR, `${quest.artifactPrefix}-01-dialogue.png`) });
  await clickButton(page, "Accept task");
  await expectObjective(page, quest.itemText);
  await expectObjective(page, "Hint");
  await expectObjective(page, quest.activeHint);

  await clickObjective(page, "Go");
  await expectObjective(page, "Pick up");
  if (quest.inspectText) {
    await openInteractPanel(page);
    await clickUnique(page.locator("details").filter({ has: page.locator("summary", { hasText: "Interact" }) }).getByRole("button", { name: "Inspect" }));
    await expect(page.locator(".outcome-toast")).toContainText(quest.inspectText);
  }
  await clickObjective(page, "Pick up");
  await expectObjective(page, quest.returnText);

  await clickObjective(page, "Go");
  await expectObjective(page, "Talk");
  await clickObjective(page, "Talk");
  await clickButton(page, quest.completeButton);
  await expect(page.locator(".outcome-toast")).toContainText(quest.completedText);
  if (quest.nextTitle) await expectObjective(page, quest.nextTitle);
  await closeCutsceneIfVisible(page);
  await page.screenshot({ path: join(ARTIFACT_DIR, `${quest.artifactPrefix}-02-complete.png`) });
}

function objective(page: Page): Locator {
  return page.locator(".objective-tracker");
}

async function expectObjective(page: Page, text: string): Promise<void> {
  await expect(objective(page)).toContainText(text, { timeout: 18_000 });
}

async function clickObjective(page: Page, label: string): Promise<void> {
  await clickUnique(objective(page).getByRole("button", { name: label }));
}

async function clickButton(page: Page, label: string): Promise<void> {
  await clickUnique(page.getByRole("button", { name: label }));
}

async function openInteractPanel(page: Page): Promise<void> {
  const panel = page.locator("details").filter({ has: page.locator("summary", { hasText: "Interact" }) });
  await panel.evaluate((element) => element.setAttribute("open", ""));
}

async function clickUnique(locator: Locator): Promise<void> {
  await expect(locator).toHaveCount(1, { timeout: 18_000 });
  await locator.click();
}

async function closeCutsceneIfVisible(page: Page): Promise<void> {
  const player = page.locator(".cutscene-player");
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if ((await player.count()) === 0) break;
    await page.getByRole("button", { name: "Continue" }).click();
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
