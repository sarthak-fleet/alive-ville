import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { chromium, expect, type Page } from '@playwright/test';

const LANDING_DIR = new URL('../../astro-landing/', import.meta.url).pathname;
const PORT = Number(process.env['ASTRO_LANDING_PORT'] ?? 4323);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const ARTIFACT_DIR = process.env['PLAYTEST_ARTIFACT_DIR'] ?? 'tmp/playtest-artifacts/astro-landing';

async function main(): Promise<void> {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: LANDING_DIR,
    env: { ...process.env },
    stdio: 'inherit',
  });
  if (build.status !== 0) throw new Error(`Astro landing build failed with status ${build.status}`);

  const preview = spawn(
    'npm',
    ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(PORT)],
    {
      cwd: LANDING_DIR,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  try {
    await waitForHttp(BASE_URL);
    await runLandingSmoke();
  } finally {
    stopProcess(preview);
  }
}

async function runLandingSmoke(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  await blockExternalFonts(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() === 404) errors.push(`404 ${response.url()}`);
  });

  try {
    await page.goto(BASE_URL, { waitUntil: 'commit' });
    await expect(page).toHaveTitle('Ashment | Interactive AI World');
    await expect(page.getByRole('heading', { name: 'ASHMENT' }).first()).toBeVisible();
    await expect(page.locator('body')).toContainText('playable 3D RPG simulation');
    await expect(page.locator('body')).toContainText('World Ingest');
    await expect(page.locator('body')).toContainText('Long-Running Agents');
    await expect(page.locator('body')).toContainText('Use W A S D to explore the 3D world');
    await expect(page.locator('body')).toContainText('Import structured world source JSON');
    await expect(page.locator('#three-ambient canvas')).toBeVisible();
    await expect
      .poll(() => nonBlankCanvasPixels(page, '#three-ambient canvas'), {
        message: 'landing Three.js background should render nonblank pixels',
        timeout: 10_000,
      })
      .toBeGreaterThan(30);
    await page.screenshot({ path: join(ARTIFACT_DIR, '01-desktop.png'), fullPage: true });

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
    await blockExternalFonts(mobile);
    try {
      await mobile.goto(BASE_URL, { waitUntil: 'commit' });
      await expect(mobile.getByRole('heading', { name: 'ASHMENT' }).first()).toBeVisible();
      await expect(mobile.locator('#three-ambient canvas')).toBeVisible();
      await expect
        .poll(() => nonBlankCanvasPixels(mobile, '#three-ambient canvas'), {
          message: 'mobile landing Three.js background should render nonblank pixels',
          timeout: 10_000,
        })
        .toBeGreaterThan(30);
      const layout = await mobile.evaluate(() => ({
        bodyWidth: document.body.scrollWidth,
        viewportWidth: window.innerWidth,
      }));
      expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth + 2);
      await mobile.screenshot({ path: join(ARTIFACT_DIR, '02-mobile.png'), fullPage: true });
    } finally {
      await mobile.close();
    }

    await expect(errors, errors.join('\n')).toEqual([]);
  } finally {
    await page.close();
    await browser.close();
  }
}

async function blockExternalFonts(page: Page): Promise<void> {
  await page.route(/https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/, (route) => {
    void route.fulfill({ status: 200, contentType: 'text/css', body: '' });
  });
}

async function nonBlankCanvasPixels(page: Page, selector: string): Promise<number> {
  return page.locator(selector).evaluate((canvas) => {
    const source = canvas as HTMLCanvasElement;
    const probe = document.createElement('canvas');
    probe.width = 32;
    probe.height = 32;
    const ctx = probe.getContext('2d');
    if (!ctx || source.width === 0 || source.height === 0) return 0;
    ctx.drawImage(source, 0, 0, probe.width, probe.height);
    const pixels = ctx.getImageData(0, 0, probe.width, probe.height).data;
    let visible = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i] ?? 0;
      const g = pixels[i + 1] ?? 0;
      const b = pixels[i + 2] ?? 0;
      const a = pixels[i + 3] ?? 0;
      if (a > 8 || r + g + b > 8) visible += 1;
    }
    return visible;
  });
}

async function waitForHttp(url: string, timeoutMs = 12_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // keep polling while preview boots
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function stopProcess(child: ChildProcess): void {
  if (!child.killed) child.kill('SIGTERM');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
