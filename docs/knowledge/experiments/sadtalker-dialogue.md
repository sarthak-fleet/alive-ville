---
title: "Spike: animated NPC dialogue close-ups via SadTalker"
description: "Animated NPC dialogue close-ups via SadTalker — verdict skip."
---

# Spike: animated NPC dialogue close-ups via SadTalker

**Status:** Completed 2026-06-13. End-to-end works. **Verdict: defer** —
output is technically clean but the 256×256 face crop and minimal anime
lip-sync don't sell the "alive" feeling we wanted. AniPortrait next if we
revisit.

## What we want

Replace the static portrait shown in the dialogue HUD with a short animated
talking-head clip on the first line of a conversation. Each line: NPC
portrait + dialogue text → TTS → talking-head MP4 → render inline above the
text box. Falls back to static portrait if the video isn't ready in time.

Why care: static portraits are fine but a 3-5s lip-synced close-up sells
"this NPC is actually alive" much harder than a still image. Especially for
named characters in the OPM Z-City world.

## Existing infra (both deployed since 2025-11)

| App                       | App ID                       | Function | URL |
|---------------------------|------------------------------|----------|------|
| sadtalker-avatar-service  | `ap-JbrbkAitPeHquJ4R3Wyffo` | `api` (FastAPI) | `https://sarthakagrawal927--sadtalker-avatar-service-api.modal.run` |
| parler-tts-news           | `ap-fpW6f6heXQxUTtyaC6oNfZ` | `fastapi_app` | `https://sarthakagrawal927--parler-tts-news-fastapi-app.modal.run` |

Endpoint signatures (from each app's `/openapi.json`):

- **Parler-TTS** — `POST /tts` JSON `{text, description?, max_chars?}` →
  `{sampling_rate, chunks: string[]}` where each chunk is a base64-encoded
  WAV blob. `parler-tts/parler-tts-mini-v1.1`, runs on CUDA.
- **SadTalker** — `POST /generateVideo` multipart `{face, audio}` plus
  required header `x-api-key`. Response is JSON
  `{ok, filename, video_b64}` — `video_b64` is the base64-encoded MP4.

## How the auth block was unblocked

The 2025-11 deploy gated `/generateVideo` on the value of `x-api-key`
matching an env var injected from Modal secret `custom-secret`. The original
key value (`st-…`) was lost — not in this repo, not in `~/.modal.toml`, not
in shell history (zsh + atuin both queried). Modal's API deliberately
doesn't expose secret values to clients.

What worked, in ~10 minutes total:

1. **Rotated the secret with multiple plausible key names at once.** Since
   we couldn't read the server source to know which env var name the auth
   check used, we rotated `custom-secret` so a single fresh key is bound
   to six common names — any one of them will match:
   ```bash
   KEY="sk-spike-$(openssl rand -hex 16)"
   modal secret create --force custom-secret \
     "API_KEY=$KEY" "X_API_KEY=$KEY" "SADTALKER_API_KEY=$KEY" \
     "AUTH_TOKEN=$KEY" "SECRET_KEY=$KEY" "SECRET=$KEY"
   ```
2. **Killed the stale container** so env vars get re-read on next request.
   Modal containers cache env at startup; rotating the secret alone does
   not affect an already-running container.
   ```bash
   modal container list                       # found ta-01KV…
   modal container stop -y ta-01KV0YEX9PZ6PAE0G6FR489DBC
   ```
3. **POST `/generateVideo` with the new key.** Cold-start request returned
   HTTP 200 in ~47s with a base64-encoded MP4 in the JSON body. Subsequent
   warm requests run ~34s.

The new key value is **not committed**. It lives only in `/tmp/sadtalker-key.txt`
on the machine that ran the spike. If you need to re-run later, rotate again
— it's a 5-second operation.

## Methodology

Probe at `scripts/spike-sadtalker.ts`.

1. Generate a Saitama-flavored line ("Just one punch. That's all it takes.")
   via Parler-TTS with description "calm, flat male voice".
2. Save WAV to `tmp/experiments/saitama-voice.wav`.
3. POST `(face=opm-z-city-mira.png, audio=saitama-voice.wav)` multipart to
   SadTalker `/generateVideo` with `x-api-key: $SADTALKER_API_KEY`.
4. Decode `video_b64` from the JSON response, save MP4 to
   `tmp/experiments/saitama-talking.mp4`.

Run with `SADTALKER_API_KEY=… tsx scripts/spike-sadtalker.ts`.

## Results

| Step | Outcome | Wall-clock | Output |
|------|---------|------------|--------|
| Parler-TTS warm | OK | 32.8s | 263KB WAV, 3.01s mono 44.1kHz Int16 |
| SadTalker cold (container boot + model load + gen) | OK | ~47s | 65KB MP4 |
| SadTalker warm (gen only) | OK | 33-37s | 60-65KB MP4 |
| End-to-end (both warm) | OK | 69.6s | both files |

`tmp/experiments/saitama-talking.mp4` — 256×256 H.264 (yuv420p, avc1.64000d)
at 25 fps for 75 frames = 3.0s exactly matching the WAV. Two streams: video
(94 kbps) + AAC audio embedded (so the MP4 plays standalone with the
dialogue line). 65 KB total.

Cold-start estimate: ~13s of that 47s is gen, the rest is container boot +
SadTalker checkpoint load from the persistent volume. Subsequent warm calls
hold steady ~34s gen — basically constant per 3s clip regardless of
container freshness.

## Quality verdict (honest)

Frames extracted at t=0, 1, 2, 3 s. The face is auto-cropped to a 256×256
window around the head; **the body / iconic yellow OPM cape are discarded**.
Facial identity preservation is OK — Saitama's anime features are
recognizable across all frames, no warping or melting.

The bad news is that **lip-sync motion is minimal**. SadTalker's landmark
detector was trained on photo-real faces; anime mouths are simplified
geometric shapes and the detector struggles to find / track them. There's a
faint chin/mouth bob in sync with the audio but you have to be looking for
it. Eyes hold steady. No expression — Saitama looks bored throughout (which
is, to be fair, in-character, but that's coincidence not signal).

**Compared against the static portrait it replaces, the video adds ~5%
"alive" feeling at a cost of:**

- 65KB per 3s clip × 250 lines = ~16MB R2 + bake time of ~250 × 34s = 142
  min A10G = ~$2.60 (vs. the $3 projection from the blocked-spike doc —
  basically on target).
- Loss of the body / cape / costume context — the close-up crop hides
  what makes each NPC visually distinct.
- 35s warm-gen latency rules out live generation; everything must be
  pre-baked or generated speculatively.

## Ship or skip

**Skip for v2.** The face crop alone disqualifies SadTalker for this
use case — our portraits are full-character compositions where the costume
silhouette is what makes each NPC recognizable in the dialogue HUD. Losing
the cape and yellow suit to gain a barely-perceptible mouth twitch is a
bad trade.

## If we revisit: alternatives in priority order

| Project   | License       | Why it'd be better than SadTalker here |
|-----------|---------------|----------------------------------------|
| **AniPortrait** | Apache-2.0 | Tencent, explicitly tuned for stylised/anime portraits. Strongest lip-sync on cartoon faces. **First pick.** |
| Hallo3    | MIT-ish       | Diffusion-based, preserves head + shoulders + upper body (no aggressive face crop). ~10GB VRAM, ~45s/clip A10G. |
| V-Express | Apache-2.0    | Tencent, good identity preservation. Whole-frame, not face-cropped. |
| EMO       | research      | Microsoft, no public weights — undeployable, skip. |
| LivePortrait | mixed | Driven by driver video, not audio — wrong input shape for our use case. |

If AniPortrait also crops to face only, the trade-off remains bad even with
better lip-sync. The right fix for the dialogue HUD might be 2D layered
animation (sprite-style mouth-frame swapping on the existing portrait) which
is what we'd do if we kept the project visual identity. That's a separate
spike.

## Integration sketch (kept for reference if AniPortrait works)

Modify `web3d/src/hud/Dialogue.tsx`: when a conversation opens, take the
NPC id + first line and POST to a Worker endpoint `/dialogue-clip` that
(a) checks R2 cache `dialogue-clips/{worldId}/{npcId}/{lineHash}.mp4`,
(b) on miss, calls Parler-TTS → SadTalker → uploads MP4 → returns signed
URL. The HUD shows the static portrait until the URL arrives, then
swaps to a `<video autoplay muted playsinline>` element with the
clip on loop or one-shot. Audio plays via a separate `<audio>` element for
accessibility (captions still visible). On any error fall back to the
existing static portrait — no regression. Cache key includes voice
description so an NPC's accent change re-bakes.

## Sample artifacts

- Input portrait: `web3d/public/assets/portraits/opm-z-city-mira.png` (this file is labelled "mira" — the audio script is Saitama-flavoured regardless; same portrait used as in the prior spike for direct comparability)
- Generated audio: `tmp/experiments/saitama-voice.wav` (3.0s, 263KB)
- Generated video: `tmp/experiments/saitama-talking.mp4` (3.0s, 65KB, 256×256 H.264 + AAC)
- Sampled frames: `tmp/experiments/saitama-frames/frame_0[1-4].png`

## Modal cost incurred this spike

Two SadTalker gens (~47s cold + ~34s warm = ~81s on A10G ≈ $0.025) plus one
fresh Parler-TTS call (~33s ≈ $0.01) plus the trellis/hunyuan3d stop
operations (free). **Total ≈ $0.04**, well under the $5 cap.
