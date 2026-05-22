import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium, expect, type Page } from "@playwright/test";

const API_PORT = Number(process.env["PLAYTEST_API_PORT"] ?? 5874);
const BASE_URL = `http://127.0.0.1:${API_PORT}`;
const ARTIFACT_DIR = process.env["PLAYTEST_ARTIFACT_DIR"] ?? "tmp/playtest-artifacts/production-build";
const SERVER = new URL("../../dist/server/server.js", import.meta.url).pathname;
const WEB_ROOT = new URL("../../dist/web/", import.meta.url).pathname;
const WORLD = new URL("../../worlds/village.json", import.meta.url).pathname;
const CHECKPOINT_FILE = join(ARTIFACT_DIR, "agent-loop-checkpoints.json");
const REQUIRED_ASSETS = [
  "/assets/cc0/russpuppy/open_tileset_16.png",
  "/assets/cutscenes/ashment_intro_square.mp4",
  "/assets/cutscenes/ashment_intro_square.jpg",
  "/assets/cutscenes/bridge_whisper.mp4",
];

async function main(): Promise<void> {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  assertBuiltWebApp();

  const api = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      PORT: String(API_PORT),
      WEB_ROOT,
      WORLD_FILE: WORLD,
      LLM_API_KEY: "",
      LLM_BASE_URL: "",
      AGENT_LOOP_INTERVAL_MS: "500",
      AGENT_LOOP_CHECKPOINT_FILE: CHECKPOINT_FILE,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForHttp(`${BASE_URL}/api/state`);
    await waitForHttp(BASE_URL);
    await assertRuntimeAssets();
    await runProductionPlaytest();
  } finally {
    stopProcess(api);
  }
}

function assertBuiltWebApp(): void {
  const required = [
    join(WEB_ROOT, "index.html"),
    join(WEB_ROOT, "assets", "cc0", "russpuppy", "open_tileset_16.png"),
    join(WEB_ROOT, "assets", "cutscenes", "ashment_intro_square.mp4"),
    join(WEB_ROOT, "assets", "cutscenes", "bridge_whisper.jpg"),
    SERVER,
  ];
  const missing = required.filter((path) => !existsSync(path));
  if (missing.length > 0) {
    throw new Error(`Production build is missing runtime assets. Run pnpm build. Missing: ${missing.join(", ")}`);
  }
}

async function assertRuntimeAssets(): Promise<void> {
  for (const asset of REQUIRED_ASSETS) {
    const response = await fetch(`${BASE_URL}${asset}`);
    if (!response.ok) throw new Error(`Production asset failed: ${asset} HTTP ${response.status}`);
    const type = response.headers.get("content-type") ?? "";
    if (!type.startsWith(asset.endsWith(".mp4") ? "video/mp4" : "image/")) {
      throw new Error(`Production asset has wrong content-type: ${asset} ${type}`);
    }
  }
}

async function runProductionPlaytest(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() === 404) errors.push(`404 ${response.url()}`);
  });

  try {
    await page.goto(BASE_URL);
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveTitle("Ashment Village");
    await expect(page.getByRole("heading", { name: "Ashment Village" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "3D" })).toHaveClass(/active/);
    await expect(page.locator(".three-host canvas")).toBeVisible();
    await expect.poll(() => nonBlankCanvasPixels(page, ".three-host canvas"), {
      message: "production 3D canvas should render nonblank pixels",
      timeout: 10_000,
    }).toBeGreaterThan(40);
    const desktopStatusCard = await page.locator(".three-status-card").boundingBox();
    expect(desktopStatusCard?.x ?? 0).toBeGreaterThan(120);
    expect(desktopStatusCard?.width ?? 999).toBeLessThanOrEqual(480);
    const desktopInteract = await page.locator(".three-interact-button").boundingBox();
    expect(desktopInteract?.width ?? 999).toBeLessThan(220);
    const villageStartHash = await canvasPixelHash(page, ".three-host canvas");
    await expect(page.getByLabel("3D travel")).toContainText("At Village Square");
    await page.getByRole("button", { name: "Go Herb Garden" }).click();
    await expect(page.getByLabel("3D travel")).toContainText("At Herb Garden");

    const before = await canvasPixelHash(page, ".three-host canvas");
    await openAgentsPanel(page);
    await page.getByLabel("Agent loop controls").getByRole("button", { name: "Step" }).click();
    await expect(page.getByLabel("Agent loop controls")).toContainText("1 autonomous ticks", { timeout: 10_000 });
    await expect.poll(() => canvasPixelHash(page, ".three-host canvas"), {
      message: "production agent step should visibly update 3D scene",
      timeout: 10_000,
    }).not.toEqual(before);
    await page.screenshot({ path: join(ARTIFACT_DIR, "01-production-3d.png") });
    await importProductionWorldSource(page, villageStartHash);

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
    try {
      await mobile.goto(BASE_URL);
      await mobile.waitForLoadState("domcontentloaded");
      await expect(mobile.locator(".app-shell")).toHaveClass(/focus-mode/);
      await expect(mobile.getByRole("button", { name: "HUD" })).toHaveAttribute("aria-pressed", "true");
      await expect(mobile.getByLabel("3D travel")).toContainText("At Rain Market");
      await expect(mobile.getByLabel("3D target")).toContainText("Talk Reva");
      await expect(mobile.getByRole("button", { name: "Interact with Reva" })).toBeEnabled();
      await expect(mobile.locator(".three-host canvas")).toBeVisible();
      await expect.poll(() => nonBlankCanvasPixels(mobile, ".three-host canvas"), {
        message: "production mobile imported 3D canvas should render nonblank pixels",
        timeout: 10_000,
      }).toBeGreaterThan(40);
      const layout = await mobile.evaluate(() => ({ bodyWidth: document.body.scrollWidth, viewportWidth: window.innerWidth }));
      expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth + 2);
      await mobile.screenshot({ path: join(ARTIFACT_DIR, "02-production-mobile.png") });
    } finally {
      await mobile.close();
    }

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
      if (r + g + b > 8) visible += 1;
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

async function openAgentsPanel(page: Page): Promise<void> {
  const agents = page.locator("details").filter({ has: page.locator("summary", { hasText: "Agents" }) });
  if (await agents.getAttribute("open") === null) await agents.locator("summary").click();
}

async function importProductionWorldSource(page: Page, villageStartHash: string): Promise<void> {
  await page.getByRole("button", { name: "Worlds" }).click();
  const gallery = page.getByRole("dialog", { name: "Reviewed sample worlds" });
  await expect(gallery).toBeVisible();
  await expect(gallery).toContainText("Skyfront");
  await expect(gallery).toContainText("Abyssal");
  await page.screenshot({ path: join(ARTIFACT_DIR, "00-production-world-gallery.png") });
  await gallery.getByRole("button", { name: /Neon Noir/ }).click();
  await expect(page.locator(".header-toast")).toContainText("Neon Noir imported.", { timeout: 8_000 });
  await expect(page.getByRole("heading", { name: "Neon Nocturne Playable Slice" })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".objective-tracker")).toContainText("Recover Witness badge for Reva");
  await expect(page.getByLabel("3D travel")).toContainText("At Rain Market");
  await expect(page.locator(".three-host canvas")).toBeVisible();
  await expect.poll(() => nonBlankCanvasPixels(page, ".three-host canvas"), {
    message: "production imported noir 3D canvas should render nonblank pixels",
    timeout: 10_000,
  }).toBeGreaterThan(40);
  await expect.poll(() => canvasPixelHash(page, ".three-host canvas"), {
    message: "production noir 3D canvas should visually differ from village",
    timeout: 10_000,
  }).not.toEqual(villageStartHash);
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.locator(".header-toast")).toContainText("Package healthy.", { timeout: 5_000 });
  const review = page.getByRole("dialog", { name: "Story package review" });
  await expect(review).toBeVisible();
  await expect(review).toContainText("Neon Nocturne: World Ingest Slice");
  await expect(review).toContainText("No structural issues found.");
  await page.screenshot({ path: join(ARTIFACT_DIR, "03-production-noir-import.png") });
  await page.getByRole("button", { name: "Close package review" }).click();
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
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function stopProcess(child: ChildProcess): void {
  if (!child.killed) child.kill();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
