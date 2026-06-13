# Spike: animated NPC dialogue close-ups via SadTalker

**Status:** Blocked on auth-key recovery. Half-completed: Parler-TTS works,
SadTalker reachable but `/generateVideo` returns 401.

## What we want

Replace the static portrait shown in the dialogue HUD with a short animated
talking-head clip on the first line of a conversation. Each line: NPC
portrait + dialogue text → TTS → talking-head MP4 → render inline above the
text box. Falls back to static portrait if the video isn't ready in time.

Why care: static portraits are fine but a 3-5s lip-synced close-up sells
"this NPC is actually alive" much harder than a still image. Especially for
named characters in the OPM Z-City world.

## Existing infra (already deployed, idle since 2025-11)

Both apps were already deployed on Modal. No new deploys made.

| App                       | App ID                       | Function | URL |
|---------------------------|------------------------------|----------|------|
| sadtalker-avatar-service  | `ap-JbrbkAitPeHquJ4R3Wyffo` | `api` (FastAPI) | `https://sarthakagrawal927--sadtalker-avatar-service-api.modal.run` |
| parler-tts-news           | `ap-fpW6f6heXQxUTtyaC6oNfZ` | `fastapi_app` | `https://sarthakagrawal927--parler-tts-news-fastapi-app.modal.run` |

Endpoint signatures discovered via the deployed FastAPI's `/openapi.json`:

- **Parler-TTS** — `POST /tts` JSON `{text, description?, max_chars?}` →
  `{sampling_rate, chunks: string[]}` where each chunk is a base64-encoded
  WAV blob. `parler-tts/parler-tts-mini-v1.1`, runs on CUDA.
- **SadTalker** — `POST /generateVideo` multipart `{face, audio}` plus
  optional header `x-api-key`. The key is enforced — without it the
  server returns `401 {"detail":"unauthorized"}`.

## Methodology

Probe at [`scripts/spike-sadtalker.ts`](../../scripts/spike-sadtalker.ts).

1. Generate a Saitama-flavored line ("Just one punch. That's all it takes.")
   via Parler-TTS with description "calm, flat male voice".
2. Save WAV to `tmp/experiments/saitama-voice.wav`.
3. POST `(face=opm-z-city-mira.png, audio=saitama-voice.wav)` multipart to
   SadTalker `/generateVideo`.
4. Save MP4 to `tmp/experiments/saitama-talking.mp4`.

## Results

| Step | Outcome | Wall-clock | Output |
|------|---------|------------|--------|
| Parler-TTS cold/warm | OK (warm — health check loaded model already) | 6.5s | 259KB WAV, 3.01s mono 44.1kHz int16 |
| SadTalker cold/warm  | **Blocked at auth** — 401 before any GPU work | ~0.2s | — |
| End-to-end           | Not measured                              | —     | — |

### Why blocked

`/generateVideo` requires `x-api-key`. The expected value lives in Modal
secret `custom-secret` (`st-UdfqWfMhJGGv8oMSZGnT2l`, created
2025-11-01 17:43 IST, same minute as the SadTalker app). Modal's API
deliberately does not expose secret values to clients — `modal secret list`
shows metadata only. The key is also not stored anywhere in this repo, the
neighbouring fleet repos, or the local `.env`.

This means the spike cannot complete without the user authorizing one of:

1. **Recover the original key** from wherever it was generated in
   2025-11 (1Password, browser autofill, original deploy script).
2. **Rotate the secret** with `modal secret create custom-secret
   --force …` and redeploy SadTalker so the new value takes effect.
3. **Redeploy SadTalker** with the auth check removed (cheapest if the key
   was only ever a "don't get scraped" guard, not a billing protection).

All three are out of scope per the spike's hard constraints (no secret
edits, no `.env` edits, no redeploys).

## Sample artifacts

- Input portrait: [`web3d/public/assets/portraits/opm-z-city-mira.png`](../../web3d/public/assets/portraits/opm-z-city-mira.png) (a Mira portrait; the task brief labelled this as Saitama but the file is Mira — the audio script is Saitama-flavoured regardless)
- Generated audio: [`tmp/experiments/saitama-voice.wav`](../../tmp/experiments/saitama-voice.wav) (3.0s, 259KB)
- Generated video: **does not exist** — SadTalker call was rejected

## Cost projection (assuming revival)

SadTalker on Modal typically runs on an A10G (~$1.10/hr) and takes ~30s
for a 5s clip on warm containers (rough community benchmark — the deployed
version may differ). For a 50-NPC OPM world × 5 dialogue lines each = 250
clips:

- One-time bake (pre-generate every line): 250 × 30s = 125 min GPU = ~$2.30
- Plus Parler-TTS audio: ~6s × 250 = 25 min on A10G = ~$0.46
- **Total bake: ~$3 + R2 storage for ~250 small MP4s (negligible).**

Live generation per-call (cold-start factored in for an idle container)
would be ~60-90s for the first line of a session and ~30s for subsequent
lines until the container scales to zero. Not viable for interactive
dialogue — must be pre-baked or generated speculatively during the
dialogue intro animation.

## Integration sketch (~150 words)

Modify `web3d/src/hud/Dialogue.tsx`: when a conversation opens, take the
NPC id + first line and POST to a Worker endpoint `/dialogue-clip` that
(a) checks R2 cache `dialogue-clips/{worldId}/{npcId}/{lineHash}.mp4`,
(b) on miss, calls Parler-TTS → SadTalker → uploads MP4 → returns signed
URL. The HUD shows the static portrait until the URL arrives, then
swaps to a `<video autoplay muted playsinline>` element with the
clip on loop or one-shot. Audio is the dialogue line itself, so muted
on the video tag and use a separate `<audio>` element for accessibility
(captions still visible). On any error fall back to the existing static
portrait — no regression. Cache key includes voice description so an
NPC's accent change re-bakes.

## Alternatives if SadTalker quality fails

Anime portraits are SadTalker's known weak spot — its landmark detector
was trained on photo-real faces and tends to mis-place the mouth on
stylised drawings. Even if we recover the key, the output may be
unusable. OSS competitors worth trying:

| Project   | License       | Notes |
|-----------|---------------|-------|
| Hallo3    | MIT-ish       | Diffusion-based, strong on stylised faces; needs ~10GB VRAM, ~45s/clip on A10G |
| EMO       | research      | Microsoft, no public weights — not actually deployable |
| V-Express | Apache-2.0    | Tencent, good identity preservation, mid quality on anime |
| AniPortrait | Apache-2.0 | Tencent, specifically tuned for stylised portraits — **best first pick if SadTalker output is bad** |
| LivePortrait | MIT (with research-only caveats on some weights) | Driven by a driver video rather than audio — wrong shape for our use case |

## Quality verdict

Cannot give one — no MP4 was generated. **The honest read is that even if
we revive SadTalker, the anime-portrait failure mode is well-documented;
plan on AniPortrait as the second probe before sinking effort into a
production pipeline.**

## Recommendation

**Skip for v2 in current form.** Two-step plan if the user wants to keep
this alive:

1. **Authorize a small follow-up:** recover or rotate `custom-secret` so
   the spike can re-run end-to-end with one clip. ~15 min of work.
2. **If that one clip looks bad on the anime portrait,** redirect the
   experiment to AniPortrait rather than fighting SadTalker.

Until that follow-up runs, dialogue close-ups should stay as static
portraits with the existing typewriter effect — both Parler-TTS for
voice and SadTalker for animation are deployed and idle, so cost of
inaction is zero.
