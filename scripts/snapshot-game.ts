/**
 * VRM baseline snapshot — boots the live game in headless Chromium,
 * takes three screenshots, and dumps console output for review.
 *
 * Usage: pnpm tsx scripts/snapshot-game.ts
 */
import { chromium, type ConsoleMessage } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const OUT_DIR = resolve(process.cwd(), "tmp/experiments");
mkdirSync(OUT_DIR, { recursive: true });

const GAME_URL = process.env.GAME_URL ?? "http://localhost:5175/game/";

const consoleLines: string[] = [];
const pageErrors: string[] = [];

function fmtConsole(msg: ConsoleMessage): string {
  const t = new Date().toISOString();
  return `[${t}] [${msg.type()}] ${msg.text()}`;
}

const browser = await chromium.launch({ headless: !process.env.HEADED });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

page.on("console", (msg) => consoleLines.push(fmtConsole(msg)));
page.on("pageerror", (err) => {
  pageErrors.push(String(err));
  consoleLines.push(`[pageerror] ${String(err)}`);
});

console.log(`navigating to ${GAME_URL} ...`);
await page.goto(GAME_URL, { waitUntil: "domcontentloaded" });

try {
  await page.waitForSelector("canvas", { timeout: 20000 });
  console.log("canvas mounted");
} catch (e) {
  console.error("canvas never mounted within 20s");
  consoleLines.push(`[snapshot] canvas selector timeout: ${String(e)}`);
}

// World-pick → character-pick flow. Prefer Continue card if present (uses autosave).
await page.waitForTimeout(1500);

async function clickIfVisible(selector: string, timeout = 8000): Promise<boolean> {
  try {
    const loc = page.locator(selector).first();
    await loc.waitFor({ state: "visible", timeout });
    // Use force click to bypass any pointer lock / overlay quirks.
    await loc.click({ force: true, timeout: 3000 });
    return true;
  } catch (e) {
    consoleLines.push(`[snapshot] click ${selector}: ${String(e).split("\n")[0]}`);
    return false;
  }
}

const clickedContinue = await clickIfVisible(".start-card.continue");
if (!clickedContinue) {
  console.log("no continue card → clicking first world card");
  await clickIfVisible(".start-card");
}
console.log("world card clicked:", clickedContinue ? "continue" : "first-world");

await page.waitForTimeout(2500);
const clickedPick = await clickIfVisible("button.char-pick");
console.log("char-pick clicked:", clickedPick);

// Allow GLB/VRM streaming + first frame after entering the world.
await page.waitForTimeout(10000);

// Make sure the start-flow overlay is gone before screenshotting.
const overlayGone = await page
  .locator(".start-flow")
  .waitFor({ state: "detached", timeout: 8000 })
  .then(() => true)
  .catch(() => false);
console.log("start overlay gone:", overlayGone);
consoleLines.push(`[snapshot] start overlay gone: ${overlayGone}`);

// Dismiss any "How to live here" tutorial modal.
async function dismissModals() {
  const candidates = [
    'button:has-text("Got it")',
    'button:has-text("Continue")',
    'button:has-text("Close")',
    'button:has-text("Dismiss")',
    'button[aria-label="close"]',
  ];
  for (const sel of candidates) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.count() > 0 && await btn.isVisible({ timeout: 500 })) {
        await btn.click({ force: true, timeout: 1500 });
        consoleLines.push(`[snapshot] dismissed modal via ${sel}`);
        await page.waitForTimeout(400);
      }
    } catch {
      /* ignore */
    }
  }
  // Last resort: press Escape.
  await page.keyboard.press("Escape").catch(() => {});
}
await dismissModals();
await page.waitForTimeout(800);

// --- Shot 1: spawn / behind-the-player camera ---
const shot1 = resolve(OUT_DIR, "vrm-baseline-1.png");
await page.screenshot({ path: shot1, fullPage: false });
console.log("saved", shot1);

// Try to focus the canvas so keyboard events route to the game loop.
try {
  await page.mouse.click(640, 400);
  await page.waitForTimeout(300);
} catch {
  /* ignore — pointer lock can throw in headless */
}

// --- Shot 2: close-up on the player to inspect VRM detail ---
// Mutate the exposed cameraState directly: lower distance + slight pitch down.
await page.evaluate(() => {
  const cs = (window as any).__game?.cameraState;
  if (cs) {
    cs.distance = 3.6;
    cs.pitch = -0.05;
  }
});
await page.waitForTimeout(800);
const shot2 = resolve(OUT_DIR, "vrm-baseline-2.png");
await page.screenshot({ path: shot2, fullPage: false });
console.log("saved", shot2);

// --- Shot 3: walk forward 3s with W (pull camera back out first) ---
await page.evaluate(() => {
  const cs = (window as any).__game?.cameraState;
  if (cs) {
    cs.distance = 7.5;
    cs.pitch = 0;
  }
});
await page.keyboard.down("KeyW");
await page.waitForTimeout(3000);
await page.keyboard.up("KeyW");
await page.waitForTimeout(500);
const shot3 = resolve(OUT_DIR, "vrm-baseline-3.png");
await page.screenshot({ path: shot3, fullPage: false });
console.log("saved", shot3);

// Pull whatever debug state the game exposes for the doc.
const debug = await page.evaluate(() => {
  const g = (window as any).__game ?? null;
  if (!g) return null;
  try {
    const pp = g.playerPosition;
    const npcReg = g.npcRegistry;
    const npcCount = npcReg && typeof npcReg.size === "number" ? npcReg.size : null;
    const cs = g.cameraState;
    const npcSample: any[] = [];
    if (npcReg && typeof npcReg.forEach === "function") {
      let i = 0;
      npcReg.forEach((actor: any, id: string) => {
        if (i++ >= 3) return;
        const p = actor?.position ?? actor?.group?.position;
        npcSample.push({
          id,
          pos: p ? { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) } : null,
          hasVrm: Boolean(actor?.vrm || actor?.gltf || actor?.group),
          isVrm: Boolean(actor?.vrm),
        });
      });
    }
    return {
      hasGame: true,
      camera: cs ? { yaw: cs.yaw, pitch: cs.pitch, distance: cs.distance, height: cs.height } : null,
      playerPos: pp ? { x: +pp.x.toFixed(2), y: +pp.y.toFixed(2), z: +pp.z.toFixed(2) } : null,
      npcCount,
      npcSample,
    };
  } catch (e) {
    return { hasGame: true, error: String(e) };
  }
});

consoleLines.push("--- end of capture ---");
consoleLines.push(`debug: ${JSON.stringify(debug, null, 2)}`);

const logPath = resolve(OUT_DIR, "vrm-baseline-console.log");
writeFileSync(logPath, consoleLines.join("\n") + "\n", "utf8");
console.log("saved", logPath);

if (pageErrors.length) {
  console.log("page errors:", pageErrors.length);
  for (const e of pageErrors.slice(0, 10)) console.log(" -", e);
}

console.log("debug:", JSON.stringify(debug, null, 2));
await browser.close();
