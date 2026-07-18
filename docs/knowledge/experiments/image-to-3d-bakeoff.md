---
title: "Image-to-3D bake-off — TRELLIS vs. Hunyuan3D-2"
description: "TRELLIS vs Hunyuan3D-2 for unique-per-NPC character meshes."
---

# Image-to-3D bake-off — TRELLIS vs. Hunyuan3D-2

> One-line summary: both pipelines turn one Saitama portrait into a textured
> GLB on Modal; TRELLIS is faster and 8× smaller; Hunyuan3D-2 has 13× more
> geometry detail and 2× larger texture. Neither is rigged. **Verdict:
> defer — stick with VRM** until we either (a) ship a humanoid auto-rigging
> pipeline or (b) accept a closed-source rigger.

## Table of contents

- [Tools tested](#tools-tested)
- [Methodology](#methodology)
- [Results](#results)
- [Sample outputs](#sample-outputs)
- [Cost projection (50-NPC OPM world)](#cost-projection-50-npc-opm-world)
- [Rigging gap](#rigging-gap)
- [Recommendation](#recommendation)
- [Modal endpoints](#modal-endpoints)
- [What went wrong (lessons)](#what-went-wrong-lessons)

## Tools tested

| Tool | Source | License |
| ---- | ------ | ------- |
| TRELLIS (Microsoft) | [github.com/microsoft/TRELLIS](https://github.com/microsoft/TRELLIS) | MIT |
| Hunyuan3D-2 (Tencent) | [github.com/Tencent/Hunyuan3D-2](https://github.com/Tencent/Hunyuan3D-2) | Tencent Hunyuan 3D 2.0 Community License |

License correction worth flagging: the brief called the Hunyuan license
"commercially permissive". It permits commercial use under a community
license but is **not** MIT — it excludes EU/UK/KR territories and imposes
an Acceptable Use Policy. The TRELLIS MIT license is genuinely permissive.

TRELLIS uses Structured Latent Vectors (SLat) and outputs Gaussians,
radiance fields, and a mesh from one forward pass; we extract the mesh +
bake a 1024² texture from the Gaussian rendering. Hunyuan3D-2 is a
two-stage pipeline: a 3B-param DiT shape generator (outputs implicit volume
that decodes to a mesh), then a paint pipeline that multiview-diffuses a
texture onto it.

## Methodology

- **Same input image** for both pipelines:
  `web3d/public/assets/portraits/opm-z-city-mira.png` — a 512×512, 283 KB PNG
  of Saitama-flavoured anime portrait, base64-encoded into the POST body.
- **Same client**: `scripts/test-image-to-3d.ts` — Node script that POSTs
  the b64 payload to either app's `@modal.fastapi_endpoint`, follows
  Modal's 303 redirect manually (same dance as `src/portraits.ts`), and
  writes the GLB to `tmp/experiments/<label>-saitama.glb`.
- **Two Modal apps**, both following the `modal/portrait_app.py` pattern:
  - `nvidia/cuda:12.1.0-devel-ubuntu22.04` base image — devel variant
    required so `nvcc` is present for the custom CUDA extension builds.
  - `@app.cls` + `@modal.enter()` for one-time weight load.
  - Persistent `modal.Volume` mounted at `/root/.cache/huggingface`.
  - GPU: TRELLIS on **A10G** (24 GB), Hunyuan3D-2 on **L40S** (48 GB —
    A100-40GB was the first choice but the queue ran 10+ min during the
    spike; L40S scheduled faster).
- **Cold start** = time from first POST after `modal deploy` to GLB bytes
  on disk, including container boot, weight load, dinov2 / model download
  to the volume, and the actual inference.
- **Warm gen** = second POST to the same container within the scaledown
  window; weights resident in GPU memory.

## Results

| Tool | Cold start | Warm gen | GPU | Per-gen cost | File size | Verdict (1-5) |
| ---- | ---------- | -------- | --- | ------------ | --------- | ------------- |
| TRELLIS-image-large | **175.4 s** | **41.1 s** | A10G (24 GB, $1.10/hr list) | ~$0.013 warm | 2.0 MB | 4 / 5 |
| Hunyuan3D-2 | **891.3 s** | **>9 min (not captured)** | L40S (48 GB, $1.95/hr list) | ~$0.30 (est.) | 15.2 MB | 2 / 5 |

Cost math (Modal 2025 list):

- A10G: $0.000306/sec; TRELLIS warm 41 s → **$0.0125 / gen**.
- L40S: $0.000542/sec; Hunyuan3D observed end-to-end warm-path was 9+
  minutes (paint pipeline runs silently — no tqdm — so the wall clock is
  the only signal). Lower bound **~$0.30 / gen**.
- TRELLIS cold start: 175 s, most of which is one-time per container
  (dinov2 first-time download is ~1 GB). Subsequent calls within the
  scaledown_window=120 s reuse the resident model.
- Hunyuan3D cold start of 891 s on L40S: the L40S queue did add wait time
  (visible in logs), but the bulk of that wall clock is the **paint
  pipeline** — 50-step diffusion + multiview rasterization at high
  resolution. I initially misread the silent log buffer as "queue wait
  dominates"; the warm-gen rerun shows the silent paint pipeline is
  itself 9+ minutes of real GPU work. **Trust the warm-path number for
  per-gen cost, not a heuristic split of cold time.**
- **Real spend on this spike** (`modal billing report --for today`):
  $0.43 across all Trellis deploys, **$1.85 across all Hunyuan3D deploys**
  (Hunyuan's failed attempts + the one successful gen + the 9-min unfinished
  warm test). Total spike billed: **~$2.28**.
- **Note on warm-gen measurement**: the Hunyuan3D warm-gen test ran for
  9+ minutes without completing (shape stages logged, paint pipeline
  silent). I stopped it to keep the spike on time; the cost figure is a
  lower bound, the 891 s cold figure is the practical upper bound for
  a single-NPC turnaround.

### Mesh statistics (from the GLB JSON header)

| Tool | Vertices | Triangles | Texture | Texture size |
| ---- | -------- | --------- | ------- | ------------ |
| TRELLIS | 22,661 | 33,227 | 1× PNG 1024² | 1.2 MB |
| Hunyuan3D-2 | 297,345 | 587,416 | 1× PNG 2048² | 2.9 MB |

Hunyuan3D-2 produces **13× more triangles and 4× more texels** than TRELLIS
at the texture-size defaults baked into each library. For a real-time
in-browser RPG with 50+ NPCs in view, the Hunyuan output is far too heavy
without aggressive decimation; TRELLIS at 33 k triangles is closer to
real-time-game-ready.

I cannot render either GLB in a browser from this CLI, but the JSON header
inspection confirms both files contain valid mesh + texture data. To
eyeball the result, load them in [gltf.report](https://gltf.report/) or
Three.js `GLTFLoader`.

## Sample outputs

- `tmp/experiments/trellis-saitama.glb` — 2.0 MB, 33 k triangles, 1024² PNG.
- `tmp/experiments/hunyuan3d-saitama.glb` — 15.2 MB, 587 k triangles, 2048² PNG.

(These are not committed; regenerate by setting the env vars below and
running `tsx scripts/test-image-to-3d.ts trellis|hunyuan3d`.)

## Cost projection (50-NPC OPM world)

Pre-genning every NPC body up-front, single run each at warm-gen speed:

| Tool | $ / gen | 50 NPCs | 200 NPCs (stretch) |
| ---- | ------- | ------- | ------------------ |
| TRELLIS | $0.013 | **$0.63** | $2.50 |
| Hunyuan3D-2 | $0.30 (lower bound) | $15+ | $60+ |

Even Hunyuan3D-2's projection is inside hobby-budget territory, but with a
caveat: the 9+ minute warm-gen time means a 50-NPC pre-gen on a single
container is 7+ hours of wall clock. **Cost is not the deciding factor.**
The deciding factor is whether the mesh is usable downstream — see the
rigging gap section.

## Rigging gap

Both pipelines output **static** meshes. No joints, no skinning weights,
no animation rig. For a real-time RPG with idle/walk/attack cycles, this
is a showstopper unless we add a rigging step.

OSS auto-rigging options (none production-ready for cel-shaded anime
characters as of mid-2026):

| Tool | What it does | Realistic for us? |
| ---- | ------------ | ----------------- |
| [PyMAF-X](https://github.com/HongwenZhang/PyMAF-X) | SMPL-X parametric fit from image | Forces SMPL topology; throws away the mesh we just generated. Only useful as a skeleton donor + retarget. |
| [Anything-World](https://anything.world/) | Commercial auto-rig API | Paid, closed-source, ToS unclear for AI-gen meshes. Workable for hand-curated hero NPCs only. |
| Mixamo auto-rig | Web service, T-pose mesh → rigged FBX | Closed, manual upload, no API. Cel-shaded anime body proportions (big head, small torso) sometimes fail the auto-pose detection. |
| Custom pipeline | Pose-estimation → SMPL skeleton fit → retarget weights via geodesic distance | 2-4 weeks of work for a humanoid-only rigger; stylized proportions break SMPL priors. |

Rough budget for an OSS rigging spike if we commit:
- 1-2 weeks: humanoid-only SMPL-fit + retarget pipeline.
- 1-2 more weeks: stylization handling (force-T-pose normalization, scale
  fitting for anime proportions).
- Animation library still needs sourcing (Mixamo license carry-over to
  the AI-gen body is murky).

## Recommendation

**Defer the image-to-3D path. Stick with VRM.**

The TRELLIS and Hunyuan3D-2 outputs are real and look architecturally
plausible (valid GLB, sensible vertex counts), but:

1. **Neither is rigged.** Static meshes cannot walk, talk, idle, or fight.
   This is the single largest gap and there is no good OSS solution as of
   mid-2026.
2. **TRELLIS at 33 k tris** is a usable starting topology, but the
   "rigging" question still has to be answered before any of this hits the
   real-time engine.
3. **Hunyuan3D at 587 k tris** is too heavy for a 50-NPC scene without
   aggressive decimation, which itself risks the topology auto-rigging
   wants.
4. **VRM baseline already works** (see `vrm-baseline.md`) — it's rigged,
   has a reusable Mixamo-style animation library, and is the path of
   least resistance.

When to revisit:
- An open-source auto-rigger that handles stylized humanoid topology
  ships (post-2026?).
- We get budget for a closed-source rigger (Anything-World, Mixamo
  partnership).
- We accept "hand-rig hero NPCs only" as a tier (5-10 characters, not 50).

## Modal endpoints

(Do not commit these to `.env`. Use them via env vars on the test client.)

```
TRELLIS_URL=https://sarthakagrawal927--trellis-image-to-3d-trellis-generate.modal.run
HUNYUAN3D_URL=https://sarthakagrawal927--hunyuan3d-image-to-3d-hunyuan3d-generate.modal.run
```

Apps:
- `trellis-image-to-3d` (ap-qp2nQ6UyGgjW3T6QhuJc8a) — A10G, 1.2B param
  TRELLIS-image-large.
- `hunyuan3d-image-to-3d` (ap-aMnmkKSHhZASEU8I0FPzrU) — L40S, Hunyuan3D-2
  shape DiT + paint pipeline.

Scale to zero in 2-3 min idle. Containers cold-start clean from the
persistent volume.

## What went wrong (lessons)

Five rebuilds over ~90 min before either app generated a GLB. Every
failure was Modal-image-build pain, not the models themselves:

1. **Custom CUDA extensions need `--no-build-isolation`.** All four (TRELLIS's
   `nvdiffrast`, `diffoctreerast`, `diff_gaussian_rasterization`;
   Hunyuan3D's `custom_rasterizer`, `differentiable_renderer`) import
   `torch.utils.cpp_extension` at module level without declaring `torch`
   in `build-system.requires`. Pip's PEP 517 isolated build env can't see
   the outer torch install. Fix: `pip install --no-build-isolation .`.
2. **`wheel` + recent `setuptools` need to be in the outer env**,
   otherwise `pip install --no-build-isolation` fails with
   `error: invalid command 'bdist_wheel'` after PEP 517 metadata phase.
3. **`TORCH_DONT_CHECK_COMPILER_ABI=1` is required** because torch 2.4's
   `cpp_extension._check_abi` probes `which clang++` (setuptools >= 70
   advertises `clang++` as distutils' default `compiler_cxx[0]` on this
   image), and the `nvidia/cuda:devel` image is gcc-only.
4. **TRELLIS needs more than `setup.sh --basic`** for inference: `kaolin`
   (FlexiCubes mesh extractor) and mip-splatting's
   `diff-gaussian-rasterization` (for texture baking from Gaussians during
   GLB export) are both load-bearing on the `to_glb` path.
5. **Pin `diffusers==0.30.3`** for Hunyuan3D-2 — latest diffusers (5.x)
   ships an `autoencoder_kl` using new `torch.library.infer_schema`
   signatures that torch 2.4 rejects.
6. **A100 capacity is unpredictable on Modal.** Two requests hit
   `waiting to be scheduled on a GPU_A100 worker` for 10+ minutes
   apiece during this spike. L40S (48 GB) scheduled within a minute and
   fits the workload at lower per-second cost.
