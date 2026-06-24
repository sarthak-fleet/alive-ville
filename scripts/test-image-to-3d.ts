/**
 * Spike client for `docs/experiments/image-to-3d-bakeoff.md`.
 *
 * Reads the Saitama portrait, base64-encodes it, POSTs to whichever Modal
 * image-to-3D endpoint we point at, and saves the returned GLB to
 * `tmp/experiments/<label>-saitama.glb`. Times the call.
 *
 * Usage:
 *   TRELLIS_URL=https://...modal.run/generate \
 *     tsx scripts/test-image-to-3d.ts trellis
 *
 *   HUNYUAN3D_URL=https://...modal.run/generate \
 *     tsx scripts/test-image-to-3d.ts hunyuan3d
 *
 * Mirrors the manual-303 dance used by `src/portraits.ts` because Node's
 * fetch keeps the POST method when following 303, which Modal's polling
 * endpoint rejects.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PORTRAIT = join(ROOT, 'web3d/public/assets/portraits/opm-z-city-mira.png');
const OUT_DIR = join(ROOT, 'tmp/experiments');

type Label = 'trellis' | 'hunyuan3d';

function urlFor(label: Label): string {
  if (label === 'trellis') return process.env['TRELLIS_URL'] ?? '';
  return process.env['HUNYUAN3D_URL'] ?? '';
}

async function followAndGet(initialUrl: string, body: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30 * 60_000); // 30 min hard cap
  try {
    let response = await fetch(initialUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      signal: controller.signal,
      redirect: 'manual',
    });
    while (response.status === 303 || response.status === 302) {
      const loc = response.headers.get('location');
      if (!loc) throw new Error('redirect without location');
      response = await fetch(loc, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'manual',
      });
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  const label = (process.argv[2] ?? '') as Label;
  if (label !== 'trellis' && label !== 'hunyuan3d') {
    console.error('usage: tsx scripts/test-image-to-3d.ts <trellis|hunyuan3d>');
    process.exit(2);
  }
  const url = urlFor(label);
  if (!url) {
    console.error(`missing env var ${label === 'trellis' ? 'TRELLIS_URL' : 'HUNYUAN3D_URL'}`);
    process.exit(2);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const png = readFileSync(PORTRAIT);
  const image_b64 = png.toString('base64');
  const payload = JSON.stringify({ image_b64, seed: 1 });

  console.info(`[${label}] POST ${url} (image ${png.byteLength} bytes b64=${image_b64.length})`);
  const t0 = Date.now();
  const response = await followAndGet(url, payload);
  const dt = ((Date.now() - t0) / 1000).toFixed(1);

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.error(`[${label}] FAIL ${response.status} in ${dt}s: ${text.slice(0, 500)}`);
    process.exit(1);
  }

  const buf = Buffer.from(await response.arrayBuffer());
  const outPath = join(OUT_DIR, `${label}-saitama.glb`);
  writeFileSync(outPath, buf);
  console.info(`[${label}] OK in ${dt}s → ${outPath} (${buf.byteLength} bytes)`);
}

void main();
