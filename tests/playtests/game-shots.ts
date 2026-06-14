/**
 * game-shots.ts — headless screenshots of the live 3D game so changes can be
 * eyeballed without a human. Connects to the running dev server (vite :5175),
 * clicks through the start flow, walks the player, and snaps a few frames.
 *
 * Run: pnpm exec tsx tests/playtests/game-shots.ts
 * Output: tmp/playtest-artifacts/game/*.png
 *
 * Caveat: headless WebGL is software-rendered (SwiftShader) so FPS + exact
 * shading differ from a real GPU, and WebGPU features (in-browser LLM, Kokoro)
 * don't run. Layout, models, placement, and composition DO render.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "@playwright/test";

const BASE_URL = process.env["GAME_URL"] ?? "http://localhost:5175/game/";
const OUT = process.env["GAME_SHOTS_DIR"] ?? "tmp/playtest-artifacts/game";

async function nonBlankPixels(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return -1;
    const gl = (canvas as HTMLCanvasElement).getContext("webgl2") ?? (canvas as HTMLCanvasElement).getContext("webgl");
    if (!gl) return -2;
    const w = 64, h = 64;
    const px = new Uint8Array(w * h * 4);
    (gl as WebGLRenderingContext).readPixels(0, 0, w, h, (gl as WebGLRenderingContext).RGBA, (gl as WebGLRenderingContext).UNSIGNED_BYTE, px);
    let nonblank = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i]! > 8 || px[i + 1]! > 8 || px[i + 2]! > 8) nonblank += 1;
    }
    return nonblank;
  });
}

async function reachable(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });

  // The vite client (:5175) must be serving the game page. (It proxies nothing;
  // the client talks to the sim API on :5174 directly — if that's down the
  // start-flow click below just logs and the shots show the load screen.)
  if (!(await reachable(BASE_URL))) {
    console.error(
      `\n✖ Game not reachable at ${BASE_URL}\n` +
        `  Start the dev servers first (two terminals, or background them):\n` +
        `    pnpm dev:server   # sim API on :5174\n` +
        `    pnpm dev          # vite client on :5175\n` +
        `  Then re-run: pnpm playtest:game\n`
    );
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
      "--enable-webgl",
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

  // suppress the one-time "How to live here" onboarding modal so shots are clean
  await page.addInitScript(() => {
    try { localStorage.setItem("aliveville_controls_seen", "1"); } catch { /* ignore */ }
  });

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

  // --- click through the start flow: world -> character -> playing ---
  try {
    await page.locator(".start-card").first().waitFor({ timeout: 20_000 });
    await page.locator(".start-card").first().click();
    await page.locator(".char-pick").first().waitFor({ timeout: 10_000 });
    await page.locator(".char-pick").first().click();
  } catch (e) {
    console.log(`[start-flow] ${(e as Error).message}`);
  }

  // dismiss the "How to live here" onboarding modal (may be multi-step)
  await page.waitForTimeout(1500);
  for (let i = 0; i < 4; i += 1) {
    const btn = page.getByRole("button", { name: /got it|next|start|begin|continue|skip|close/i }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(500);
    } else break;
  }

  // wait for the canvas to render real content (assets stream in)
  await page.waitForTimeout(2000);
  let pixels = -1;
  for (let i = 0; i < 20; i += 1) {
    pixels = await nonBlankPixels(page);
    if (pixels > 200) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(3000); // let buildings + characters finish

  await page.screenshot({ path: join(OUT, "01-spawn.png") });

  // walk forward into the town
  await page.mouse.move(720, 450);
  await page.keyboard.down("w");
  await page.waitForTimeout(1600);
  await page.keyboard.up("w");
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, "02-walked.png") });

  // orbit the camera (drag-orbit works when pointer isn't locked)
  await page.mouse.move(720, 450);
  await page.mouse.down();
  await page.mouse.move(980, 430, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, "03-orbit.png") });

  console.log(`\nnonblank canvas pixels (of 4096 sampled): ${pixels}`);
  console.log(`errors: ${errors.length ? "\n  " + errors.slice(0, 12).join("\n  ") : "none"}`);
  console.log(`shots written to ${OUT}/`);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
