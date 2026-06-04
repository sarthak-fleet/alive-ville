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
    await page.evaluate(() => window.localStorage.clear());
    await expect(page.locator(".phaser-host canvas")).toHaveCount(1);
    await expect(page.locator(".app-shell")).toHaveClass(/view-2d/);
    await expect(page.locator(".app-shell")).toHaveClass(/focus-mode/);
    await expect(page.getByLabel("Player status")).toBeVisible();
    await expect(page.getByLabel("AI agent pulse")).toBeVisible();
    await page.getByLabel("Open hero roster").click();
    await expect(page.getByLabel("Hero roster")).toBeVisible();
    await page.getByLabel("Close roster").click();
    await expectObjective(page, "Recover Saitama's grocery coupon");
    await expect(page.getByRole("button", { name: "2D" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "3D" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "HUD" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Focus" })).toHaveCount(0);
    await expect.poll(async () => {
      const box = await page.locator(".hud-panel").boundingBox();
      return Math.round(box?.width ?? 0);
    }, { message: "2D journal rail should stay compact until opened" }).toBeLessThanOrEqual(340);
    await expectObjective(page, "Recover Saitama's grocery coupon");
    await page.keyboard.press("Enter");
    await expectObjective(page, "Talk to Saitama");
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
    await expect(page.getByLabel("Combat encounter")).toContainText("Speed-o'-Sound Sonic");
    await expect(page.getByLabel("Combat style")).toContainText("Psychic style");
    await expect(page.getByLabel("Combat style")).toContainText("Style rank C");
    await expect(page.getByLabel("Combat style")).toContainText("FinisherLocked");
    await expect(page.getByLabel("Encounter moves")).toContainText("Telekinetic Barrage");
    await expect(page.getByLabel("Encounter moves").getByRole("button", { name: "Psychic Seal" })).toBeDisabled();
    await expect(page.getByLabel("Encounter moves")).toContainText("Build opening");
    await clickCombatMove(page, "Telekinetic Barrage");
    await expect(page.getByLabel("Combat encounter")).toContainText("58/100", { timeout: 18_000 });
    await expectWitnessAssistRecorded();
    await expect(page.getByLabel("Combat style")).toContainText("Mumen assist");
    await expect(page.getByLabel("Combat style")).toContainText("Sonic counters are reduced");
    await expect(page.getByLabel("Combat style")).toContainText("Style rank B");
    await expectObjective(page, "Confront the Overpass Challenger");
    await pressCombatShortcut(page, "3");
    await expect(page.getByLabel("Combat encounter")).toContainText("40/100", { timeout: 18_000 });
    await expect(page.getByLabel("Combat style")).toContainText("Style rank A");
    await expect(page.getByLabel("Combat style")).toContainText("FinisherReady");
    await page.screenshot({ path: join(ARTIFACT_DIR, "09-z-city-combat-style.png") });
    await clickCombatMove(page, "Psychic Seal");
    await expect(page.locator(".fight-cinematic")).toContainText("Psychic Seal");
    await expect(page.locator(".fight-cinematic")).toContainText("Speed-o'-Sound Sonic");
    await expect(page.locator(".fight-cinematic-meters")).toContainText("Posture");
    await expectLoadedImages(page.locator(".fight-cinematic .fight-portrait-image img"), 2);
    await expectObjective(page, "Z-City alert cleared");
    await expect(page.getByLabel("Route complete")).toContainText("Z-City Patrol Cleared", { timeout: 18_000 });
    await expect(page.locator(".app-shell")).toHaveClass(/route-clear-mode/);
    await expect(page.getByLabel("Route complete")).toContainText("Patrol rank");
    await expect(page.getByLabel("Route complete")).toContainText("Rank");
    await expect(page.getByLabel("Episode rewards")).toContainText("Hero title");
    await expect(page.getByLabel("Episode rewards")).toContainText("S-Rank Tatsumaki");
    await expect(page.getByLabel("Episode rewards")).toContainText("Psychic Specialist");
    await expect(page.getByLabel("Episode rewards")).toContainText("AI aftermath");
    await expect(page.getByLabel("Episode record")).toContainText("Best rank");
    await expect(page.getByLabel("Episode record")).toContainText("S");
    await expect(page.getByLabel("Episode record")).toContainText("Clears");
    await expect(page.getByLabel("Episode record")).toContainText("1");
    await expect(page.getByLabel("Episode record")).toContainText("Last hero");
    await expect(page.getByLabel("Episode record")).toContainText("Tatsumaki");
    await expect(page.getByLabel("Route complete")).toContainText("agent memories recorded");
    await expect(page.getByLabel("Route epilogue")).toContainText("Speed-o'-Sound Sonic");
    await expect(page.getByLabel("Route epilogue")).toContainText("Defeated");
    await expect(page.getByLabel("Combat result")).toHaveCount(0);
    await expect(page.getByLabel("Combat encounter")).toHaveCount(0);
    await page.screenshot({ path: join(ARTIFACT_DIR, "10-z-city-cleared.png") });
    await clickButton(page, "Let agents react");
    await expect(page.getByLabel("Episode record").locator("div").filter({ hasText: "Clears" })).toHaveText(/Clears\s*1/);
    await expect(page.getByLabel("Route complete")).toContainText("Z-City Patrol Cleared");
    await clickButton(page, "Replay episode");
    await expectObjective(page, "Recover Saitama's grocery coupon");
    await expect(page.locator(".app-shell")).not.toHaveClass(/route-clear-mode/);
    await expect(page.getByLabel("Route complete")).toHaveCount(0);
    await page.screenshot({ path: join(ARTIFACT_DIR, "11-z-city-replay.png") });
    await expect(errors, errors.join("\n")).toEqual([]);
  } catch (error) {
    if (errors.length > 0) console.error(errors.join("\n"));
    throw error;
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
    artifactPrefix: string;
  }
): Promise<void> {
  const currentObjective = await objective(page).innerText().catch(() => "");
  if (currentObjective.includes(quest.title)) {
    await expectObjective(page, quest.title);
  } else {
    await expectObjective(page, `Talk to ${quest.acceptNpc}`);
  }
  await travelToObjectiveAction(page, "Start");
  await expectObjective(page, `Talk to ${quest.acceptNpc}`);
  await clickObjective(page, "Start");
  await page.screenshot({ path: join(ARTIFACT_DIR, `${quest.artifactPrefix}-01-started.png`) });
  await expectObjective(page, quest.itemText);
  await expectObjective(page, "Hint");
  await expectObjective(page, quest.activeHint);

  await travelToObjectiveAction(page, "Pick up");
  await expectObjective(page, "Pick up");
  await clickObjective(page, "Pick up");
  await expectObjective(page, quest.returnText);

  await expectObjective(page, quest.returnText);
  await travelToObjectiveAction(page, "Hand over");
  await clickObjective(page, "Hand over");
  await expect(page.locator(".outcome-toast")).toContainText(quest.completedText);
  if (quest.nextTitle) await expectObjective(page, quest.nextTitle);
  await closeCutsceneIfVisible(page);
  await enableFocusMode(page);
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

async function travelToObjectiveAction(page: Page, label: string, maxHops = 12): Promise<void> {
  for (let hop = 0; hop <= maxHops; hop += 1) {
    const target = objective(page).getByRole("button", { name: label });
    const targetCount = await target.count();
    if (targetCount === 1) {
      return;
    }
    if (targetCount > 1) throw new Error(`Expected one ${label} button, found ${targetCount}`);
    const travel = objective(page).getByRole("button", { name: "Go" });
    const travelCount = await travel.count();
    if (travelCount !== 1) break;
    await expect(travel).toBeVisible({ timeout: 18_000 });
    await travel.dispatchEvent("click");
    await page.waitForTimeout(500);
  }
  const text = await objective(page).innerText().catch(() => "(objective unavailable)");
  await captureObjectiveDebug(page, `missing-objective-${slug(label)}`);
  throw new Error(`Could not reach objective action ${label}. Current objective: ${text}`);
}

async function clickButton(page: Page, label: string): Promise<void> {
  await clickUnique(page.getByRole("button", { name: label }));
}

async function clickCombatMove(page: Page, label: string): Promise<void> {
  await expect(page.locator(".combat-turn-lock")).toHaveCount(0, { timeout: 18_000 });
  try {
    await expect(page.getByLabel("Combat encounter")).toContainText("Speed-o'-Sound Sonic", { timeout: 18_000 });
    await expect(page.getByLabel("Combat encounter")).not.toContainText("No hostile target nearby", { timeout: 18_000 });
  } catch (error) {
    await captureCombatDebug(page, `missing-target-${slug(label)}`);
    throw error;
  }
  const moves = page.getByLabel("Encounter moves");
  try {
    await expect(moves).toBeVisible({ timeout: 18_000 });
  } catch (error) {
    await captureCombatDebug(page, `missing-moves-${slug(label)}`);
    throw error;
  }
  const move = moves.getByRole("button", { name: label });
  await expect.poll(async () => {
    if ((await move.count()) !== 1) return false;
    return move.isEnabled().catch(() => false);
  }, { message: `${label} should be ready for the next combat beat`, timeout: 18_000 }).toBe(true);
  await move.evaluate((element) => (element as HTMLElement).click());
}

async function pressCombatShortcut(page: Page, key: string): Promise<void> {
  await expect(page.locator(".combat-turn-lock")).toHaveCount(0, { timeout: 18_000 });
  await expect(page.getByLabel("Encounter moves")).toBeVisible({ timeout: 18_000 });
  await page.keyboard.press(key);
}

async function captureCombatDebug(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(ARTIFACT_DIR, `${name}.png`), fullPage: true }).catch(() => undefined);
  const state = await fetch(`http://127.0.0.1:${API_PORT}/api/state`)
    .then((res) => res.json())
    .catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
  const combat = await page.getByLabel("Combat encounter").innerText().catch(() => "(no combat encounter)");
  const objectiveText = await objective(page).innerText().catch(() => "(no objective)");
  console.error(JSON.stringify({ name, objective: objectiveText, combat, state: summarizeDebugState(state) }, null, 2));
}

async function captureObjectiveDebug(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(ARTIFACT_DIR, `${name}.png`), fullPage: true }).catch(() => undefined);
  const state = await fetch(`http://127.0.0.1:${API_PORT}/api/state`)
    .then((res) => res.json())
    .catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
  const objectiveText = await objective(page).innerText().catch(() => "(no objective)");
  const bodyText = await page.locator("body").innerText().catch(() => "(no body)");
  console.error(JSON.stringify({ name, objective: objectiveText, body: bodyText.slice(0, 1200), state: summarizeDebugState(state) }, null, 2));
}

function summarizeDebugState(state: unknown): unknown {
  if (!state || typeof state !== "object") return state;
  const world = state as { tick?: unknown; storyProgress?: { phase?: unknown }; player?: unknown; npcs?: Array<{ id?: unknown; name?: unknown; locationId?: unknown; combat?: unknown }> };
  return {
    tick: world.tick,
    phase: world.storyProgress?.phase,
    player: world.player,
    npcs: world.npcs?.map((npc) => ({ id: npc.id, name: npc.name, locationId: npc.locationId, combat: npc.combat })),
  };
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function expectWitnessAssistRecorded(): Promise<void> {
  await expect.poll(async () => {
    const state = await fetch(`http://127.0.0.1:${API_PORT}/api/state`).then((res) => res.json()) as {
      npcs?: Array<{ id?: string; memories?: Array<{ text?: string }> }>;
    };
    const witness = state.npcs?.find((npc) => npc.id === "lena");
    return witness?.memories?.some((memory) => /Witness assist: overpass civilians clear/i.test(memory.text ?? "")) ?? false;
  }, { message: "Mumen Rider witness assist should be recorded in world state", timeout: 18_000 }).toBe(true);
}

async function expectLoadedImages(locator: Locator, expectedCount: number): Promise<void> {
  await expect(locator).toHaveCount(expectedCount, { timeout: 18_000 });
  await expect.poll(async () => locator.evaluateAll((images) =>
    images.every((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)
  ), { message: "portrait images should load" }).toBe(true);
}

async function enableFocusMode(page: Page): Promise<void> {
  await expect(page.locator(".app-shell")).toHaveClass(/focus-mode/);
}

async function clickUnique(locator: Locator): Promise<void> {
  await expect(locator).toHaveCount(1, { timeout: 18_000 });
  await expect(locator).toBeVisible({ timeout: 18_000 });
  await locator.dispatchEvent("click");
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
