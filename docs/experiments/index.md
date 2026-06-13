# Experiments

Each experiment is a focused 1-2 day spike to evaluate a candidate solution
before adopting it. Outputs are real (deployed services, generated artifacts,
measured numbers), not design speculation. The doc here is the durable
artifact — code may be discarded; the learnings stay.

## Index

- [Image-to-3D bake-off](./image-to-3d-bakeoff.md) — TRELLIS vs. Hunyuan3D-2
  on Modal for unique-per-NPC character meshes. Compares cold-start, warm-gen,
  GPU cost, output size, and rigging-gap effort vs. sticking with VRM.
- [VRM baseline snapshot](./vrm-baseline.md) — headless Playwright capture of
  the live game after the VRM character swap. Confirms VRM loaders fire and
  characters render, flags a repeating Kenney `colormap.png` texture-load
  failure and a one-off WebGL context loss; MToon cel-shading not visually
  confirmed at default camera distance.
- [SadTalker dialogue close-ups](./sadtalker-dialogue.md) — revive the idle
  SadTalker + Parler-TTS Modal apps for animated NPC dialogue. Parler-TTS half
  works (3s WAV from a Saitama-flavoured line). **Blocked** on SadTalker auth:
  `/generateVideo` is gated on `x-api-key` and the secret value is not
  retrievable via the Modal API or stored in this repo. Needs a separately
  authorized follow-up to recover or rotate the key.

## Conventions

- Modal endpoints recorded in the doc body, never `.env`.
- Sample outputs live in `tmp/experiments/` (git-ignored; regenerate from
  the recipe in the doc).
- Every experiment ends with an explicit verdict: adopt / reject / defer.
