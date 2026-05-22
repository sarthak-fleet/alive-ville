import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, normalize } from "node:path";
import { gzipSync } from "node:zlib";

const FIRST_LOAD_JS_MAX_BYTES = 325 * 1024;
const FIRST_LOAD_CSS_MAX_BYTES = 32 * 1024;
const FIRST_LOAD_TOTAL_MAX_BYTES = 370 * 1024;
const FIRST_LOAD_GZIP_MAX_BYTES = 110 * 1024;
const LAZY_THREE_WORLD_MAX_BYTES = 575 * 1024;
const LAZY_THREE_WORLD_GZIP_MAX_BYTES = 150 * 1024;
const LAZY_PHASER_MAX_BYTES = 1_450 * 1024;
const LAZY_PHASER_GZIP_MAX_BYTES = 390 * 1024;
const LAZY_MISC_JS_MAX_BYTES = 90 * 1024;
const LAZY_MISC_GZIP_MAX_BYTES = 40 * 1024;

export interface AssetSize {
  path: string;
  bytes: number;
  gzipBytes: number;
}

export interface BundleBudgetReport {
  passed: boolean;
  firstLoadAssets: AssetSize[];
  lazyAssets: AssetSize[];
  failures: string[];
}

export function bundleBudgetReport(rootDir = process.cwd()): BundleBudgetReport {
  const distDir = join(rootDir, "dist", "web");
  const indexPath = join(distDir, "index.html");
  if (!existsSync(indexPath)) {
    return {
      passed: false,
      firstLoadAssets: [],
      lazyAssets: [],
      failures: ["missing dist/web/index.html; run pnpm build first"],
    };
  }

  const indexHtml = readFileSync(indexPath, "utf8");
  const firstLoadPaths = firstLoadAssetPaths(indexHtml);
  const firstLoadAssets = firstLoadPaths.map((path) => assetSize(distDir, path));
  const firstLoadSet = new Set(firstLoadAssets.map((asset) => normalize(asset.path)));
  const lazyAssets = allBuiltAssets(distDir)
    .filter((asset) => !firstLoadSet.has(normalize(asset.path)))
    .filter((asset) => asset.path.endsWith(".js") || asset.path.endsWith(".css"));
  const failures = budgetFailures(firstLoadAssets, lazyAssets);
  return { passed: failures.length === 0, firstLoadAssets, lazyAssets, failures };
}

export function assertBundleBudget(report = bundleBudgetReport()): void {
  if (!report.passed) throw new Error(report.failures.join("; "));
}

function firstLoadAssetPaths(indexHtml: string): string[] {
  const sources = [
    ...indexHtml.matchAll(/<script[^>]+src="([^"]+)"[^>]*><\/script>/g),
    ...indexHtml.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/g),
  ];
  return sources.map((match) => stripPublicPrefix(match[1] ?? "")).filter(Boolean);
}

function stripPublicPrefix(path: string): string {
  return path.replace(/^\//, "");
}

function assetSize(distDir: string, path: string): AssetSize {
  const fullPath = join(distDir, path);
  const bytes = statSync(fullPath).size;
  const contents = readFileSync(fullPath);
  return { path, bytes, gzipBytes: gzipSync(contents).length };
}

function allBuiltAssets(distDir: string): AssetSize[] {
  const assetDir = join(distDir, "assets");
  if (!existsSync(assetDir)) return [];
  return readdirSync(assetDir)
    .map((name) => join("assets", name))
    .filter((path) => statSync(join(distDir, path)).isFile())
    .map((path) => assetSize(distDir, path));
}

function budgetFailures(firstLoadAssets: AssetSize[], lazyAssets: AssetSize[]): string[] {
  const jsBytes = sum(firstLoadAssets.filter((asset) => asset.path.endsWith(".js")).map((asset) => asset.bytes));
  const cssBytes = sum(firstLoadAssets.filter((asset) => asset.path.endsWith(".css")).map((asset) => asset.bytes));
  const totalBytes = sum(firstLoadAssets.map((asset) => asset.bytes));
  const totalGzipBytes = sum(firstLoadAssets.map((asset) => asset.gzipBytes));
  return [
    jsBytes > FIRST_LOAD_JS_MAX_BYTES ? `first-load JS ${formatBytes(jsBytes)} exceeds ${formatBytes(FIRST_LOAD_JS_MAX_BYTES)}` : null,
    cssBytes > FIRST_LOAD_CSS_MAX_BYTES ? `first-load CSS ${formatBytes(cssBytes)} exceeds ${formatBytes(FIRST_LOAD_CSS_MAX_BYTES)}` : null,
    totalBytes > FIRST_LOAD_TOTAL_MAX_BYTES ? `first-load total ${formatBytes(totalBytes)} exceeds ${formatBytes(FIRST_LOAD_TOTAL_MAX_BYTES)}` : null,
    totalGzipBytes > FIRST_LOAD_GZIP_MAX_BYTES ? `first-load gzip ${formatBytes(totalGzipBytes)} exceeds ${formatBytes(FIRST_LOAD_GZIP_MAX_BYTES)}` : null,
    ...lazyAssets.flatMap(lazyAssetFailures),
  ].filter((failure): failure is string => Boolean(failure));
}

function lazyAssetFailures(asset: AssetSize): Array<string | null> {
  if (asset.path.endsWith(".css")) return [asset.bytes > FIRST_LOAD_CSS_MAX_BYTES ? `lazy CSS ${asset.path} ${formatBytes(asset.bytes)} exceeds ${formatBytes(FIRST_LOAD_CSS_MAX_BYTES)}` : null];
  if (!asset.path.endsWith(".js")) return [];
  if (asset.path.includes("ThreeWorld-")) {
    return [
      asset.bytes > LAZY_THREE_WORLD_MAX_BYTES ? `lazy ThreeWorld ${formatBytes(asset.bytes)} exceeds ${formatBytes(LAZY_THREE_WORLD_MAX_BYTES)}` : null,
      asset.gzipBytes > LAZY_THREE_WORLD_GZIP_MAX_BYTES ? `lazy ThreeWorld gzip ${formatBytes(asset.gzipBytes)} exceeds ${formatBytes(LAZY_THREE_WORLD_GZIP_MAX_BYTES)}` : null,
    ];
  }
  if (asset.path.includes("PhaserGame-")) {
    return [
      asset.bytes > LAZY_PHASER_MAX_BYTES ? `lazy PhaserGame ${formatBytes(asset.bytes)} exceeds ${formatBytes(LAZY_PHASER_MAX_BYTES)}` : null,
      asset.gzipBytes > LAZY_PHASER_GZIP_MAX_BYTES ? `lazy PhaserGame gzip ${formatBytes(asset.gzipBytes)} exceeds ${formatBytes(LAZY_PHASER_GZIP_MAX_BYTES)}` : null,
    ];
  }
  return [
    asset.bytes > LAZY_MISC_JS_MAX_BYTES ? `lazy JS ${asset.path} ${formatBytes(asset.bytes)} exceeds ${formatBytes(LAZY_MISC_JS_MAX_BYTES)}` : null,
    asset.gzipBytes > LAZY_MISC_GZIP_MAX_BYTES ? `lazy JS gzip ${asset.path} ${formatBytes(asset.gzipBytes)} exceeds ${formatBytes(LAZY_MISC_GZIP_MAX_BYTES)}` : null,
  ];
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function formatBytes(bytes: number): string {
  return `${Math.round(bytes / 1024)} KiB`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = bundleBudgetReport();
  console.info("First-load assets:");
  for (const asset of report.firstLoadAssets) {
    console.info(`  ${asset.path}: ${formatBytes(asset.bytes)} raw, ${formatBytes(asset.gzipBytes)} gzip`);
  }
  const largestLazy = report.lazyAssets.sort((a, b) => b.bytes - a.bytes).slice(0, 3);
  if (largestLazy.length > 0) {
    console.info("Largest lazy assets:");
    for (const asset of largestLazy) {
      console.info(`  ${asset.path}: ${formatBytes(asset.bytes)} raw, ${formatBytes(asset.gzipBytes)} gzip`);
    }
  }
  assertBundleBudget(report);
  console.info("PASS bundle budget");
}
