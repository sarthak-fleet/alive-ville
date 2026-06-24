/**
 * Spike: animated NPC dialogue close-ups via existing Modal apps.
 *
 *   1. Generate audio with the deployed Parler-TTS app.
 *   2. Send portrait + audio to the deployed SadTalker app.
 *   3. Save both artifacts to tmp/experiments/ and print timing.
 *
 * No new Modal deploys.  Existing endpoints discovered via the
 * Modal gRPC layout (AppGetLayout):
 *   - Parler-TTS:  POST /tts                       → base64 wav chunks
 *   - SadTalker:   POST /generateVideo  multipart {face, audio}
 *                  Requires `x-api-key` header.  The expected value lives in
 *                  Modal secret `custom-secret`.  As of 2026-06-13 the secret
 *                  was rotated and the app re-cold-started so the new key
 *                  takes effect — see docs/experiments/sadtalker-dialogue.md.
 *                  Pass via `SADTALKER_API_KEY` env var; if unset the script
 *                  falls back to unauth which will 401.
 *
 * Usage:  SADTALKER_API_KEY=... tsx scripts/spike-sadtalker.ts
 */
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PARLER_URL = 'https://sarthakagrawal927--parler-tts-news-fastapi-app.modal.run/tts';
const SADTALKER_URL =
  'https://sarthakagrawal927--sadtalker-avatar-service-api.modal.run/generateVideo';

// Saitama-flavored dialogue line.  Calm, flat male voice.
const TTS_TEXT = "Just one punch.  That's all it takes.";
const TTS_VOICE_DESCRIPTION =
  'A calm, flat male voice speaks slowly and clearly with very little emotion. Studio quality recording, almost no background noise.';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const OUT_DIR = resolve(REPO_ROOT, 'tmp/experiments');
const PORTRAIT_PATH = resolve(REPO_ROOT, 'web3d/public/assets/portraits/opm-z-city-mira.png');
const AUDIO_OUT = resolve(OUT_DIR, 'saitama-voice.wav');
const VIDEO_OUT = resolve(OUT_DIR, 'saitama-talking.mp4');

mkdirSync(OUT_DIR, { recursive: true });

function fmt(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

async function followRedirects(initial: Response, init: RequestInit): Promise<Response> {
  let resp = initial;
  let hops = 0;
  while (resp.status === 303 && hops < 10) {
    const loc = resp.headers.get('location');
    if (!loc) throw new Error('303 with no Location');
    hops += 1;
    // GET on follow per 303 semantics
    resp = await fetch(loc, { method: 'GET' });
  }
  void init;
  return resp;
}

async function generateAudio(): Promise<{
  bytes: Buffer;
  ms: number;
  meta: Record<string, unknown>;
}> {
  const body = {
    text: TTS_TEXT,
    description: TTS_VOICE_DESCRIPTION,
    max_chars: 400,
  };
  const t0 = Date.now();
  const initial = await fetch(PARLER_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
    redirect: 'manual',
  });
  const resp = await followRedirects(initial, {});
  const ms = Date.now() - t0;
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Parler-TTS ${resp.status}: ${txt.slice(0, 300)}`);
  }
  const json = (await resp.json()) as {
    chunks?: string[];
    audio_base64?: string;
    sample_rate?: number;
    duration_s?: number;
    [k: string]: unknown;
  };
  const chunks: string[] =
    Array.isArray(json.chunks) && json.chunks.length > 0
      ? json.chunks
      : json.audio_base64
        ? [json.audio_base64]
        : [];
  if (chunks.length === 0) {
    throw new Error(`Parler returned no audio. Keys: ${Object.keys(json).join(',')}`);
  }
  // chunks are base64-WAV.  For a single chunk just decode it.  For multiple
  // chunks we naive-concat the raw PCM after the first header; here we
  // expect a single chunk for a 6-word line.
  const bufs = chunks.map((c) => Buffer.from(c, 'base64'));
  const bytes = bufs.length === 1 ? bufs[0] : Buffer.concat(bufs);
  return { bytes, ms, meta: json };
}

async function generateTalkingHead(
  facePath: string,
  audioPath: string
): Promise<{ bytes: Buffer; ms: number }> {
  const fs = await import('node:fs/promises');
  const faceBytes = await fs.readFile(facePath);
  const audioBytes = await fs.readFile(audioPath);
  const form = new FormData();
  form.append('face', new Blob([faceBytes], { type: 'image/png' }), 'face.png');
  form.append('audio', new Blob([audioBytes], { type: 'audio/wav' }), 'audio.wav');
  const apiKey = process.env.SADTALKER_API_KEY ?? '';
  const headers: Record<string, string> = {};
  if (apiKey) headers['x-api-key'] = apiKey;
  const t0 = Date.now();
  const initial = await fetch(SADTALKER_URL, {
    method: 'POST',
    headers,
    body: form,
    redirect: 'manual',
  });
  const resp = await followRedirects(initial, {});
  const ms = Date.now() - t0;
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`SadTalker ${resp.status}: ${txt.slice(0, 400)}`);
  }
  const ctype = resp.headers.get('content-type') || '';
  if (ctype.includes('application/json')) {
    const json = (await resp.json()) as Record<string, unknown>;
    const b64 =
      (json.video_b64 as string | undefined) ??
      (json.video_base64 as string | undefined) ??
      (json.video as string | undefined) ??
      (json.mp4_base64 as string | undefined);
    if (!b64) {
      throw new Error(`SadTalker JSON had no video field. Keys: ${Object.keys(json).join(',')}`);
    }
    return { bytes: Buffer.from(b64, 'base64'), ms };
  }
  const ab = await resp.arrayBuffer();
  return { bytes: Buffer.from(ab), ms };
}

async function main() {
  statSync(PORTRAIT_PATH); // throws if missing
  console.info(`Portrait: ${PORTRAIT_PATH}`);

  console.info('→ Parler-TTS …');
  const tts = await generateAudio();
  writeFileSync(AUDIO_OUT, tts.bytes);
  console.info(
    `  OK ${fmt(tts.ms)} | ${tts.bytes.length} bytes | meta keys: ${Object.keys(tts.meta).join(
      ','
    )}`
  );

  console.info('→ SadTalker …');
  const vid = await generateTalkingHead(PORTRAIT_PATH, AUDIO_OUT);
  writeFileSync(VIDEO_OUT, vid.bytes);
  console.info(`  OK ${fmt(vid.ms)} | ${vid.bytes.length} bytes`);

  console.info('');
  console.info(`Wrote audio  → ${AUDIO_OUT}`);
  console.info(`Wrote video  → ${VIDEO_OUT}`);
  console.info(`Total wall-clock (TTS + SadTalker): ${fmt(tts.ms + vid.ms)}`);
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exit(1);
});
