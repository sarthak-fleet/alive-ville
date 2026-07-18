---
title: "Roadmap — 2026-06-13 paused"
description: "2026-06-13 paused roadmap snapshot."
---

# Roadmap — 2026-06-13 paused

> Status at the end of this session: 15 commits ahead of `origin/main`, all
> pushed. Working tree clean. Player has called the experience **not playable**
> in its current state — the foundation needs a real character pass before more
> features ship.

## Where we are

### What got built / fixed this session

| Area | Commit | State |
| ---- | ------ | ----- |
| Uniform NPC heights | `d177b5a` | ✅ shipped |
| Kenney prop scatter + colormap textures | `b7455c5` | ✅ shipped |
| Ambient music + manager + mute toggle | `58b6d24` | ✅ shipped |
| VRM anime characters via `@pixiv/three-vrm` | `ed296f9` | ⚠️ ships, but procedural anim looks T-pose-ish |
| Dialogue: NPC knows player character identity | `8665f9b` | ✅ shipped, LLM context only |
| Corpse despawn (6s timer) | `89cb51e` | ✅ shipped |
| Cross-faction quest filter in LLM context | `89cb51e` | ⚠️ ships but **HUD and arc generator bypass it** |
| Interior teleport camera snap | `c2c5248` | ✅ shipped |
| Raycast-down ground anchor | `48eb156` | ✅ shipped |
| Kenney Furniture Kit in interiors | `5fbf838` | ✅ shipped |
| VRMA reactions on dialogue open | `2702f37` → reverted in `5ee0151` | ❌ rolled back |

### Spikes documented (no code changes adopted)

- `docs/knowledge/experiments/image-to-3d-bakeoff.md` — TRELLIS vs Hunyuan3D-2. Verdict
  defer; OSS rigging gap is the actual blocker.
- `docs/knowledge/experiments/sadtalker-dialogue.md` — unblocked, sample MP4 generated.
  Verdict skip; SadTalker face-crop destroys per-NPC visual identity.
- `docs/knowledge/experiments/vrm-baseline.md` — Playwright snapshot of live state.
- `docs/knowledge/research/game-mechanics-audit.md` — full survey of AAA RPG basic
  mechanics vs Aliveville, OSS libraries to adopt, mechanic-by-mechanic plan.
  **Read this first when resuming.**

## What's actually broken (player-facing, observed)

1. **VRM characters look T-pose-ish** when standing still. Procedural bone
   writes only touch `rotation.x` (forward swing). VRM rest pose has arms out
   at sides; no `rotation.z` write means they never come down. No free VRMA
   locomotion pack exists — Mixamo retarget is the real fix (3–4 day swing).
2. **Quest list HUD shows hostile-faction quests.** The cross-faction filter
   only runs in `buildDialogueUser` (LLM prompt context). Three surfaces need
   the filter — HUD, LLM context (✅), and the arc/villain plan generator that
   gives Muzan a "train with Tanjiro" arc.
3. **Opening sequence is missing.** Player drops straight into the world with
   no title card, world hook, character-pick framing, or music swell. Single
   biggest "premium feel" gap.
4. **Snapshot script loads Ashment Village (autosave) only.** Doesn't observe
   the world the player is in. Visual verification has been the bottleneck —
   need a script that can target an arbitrary world.

## Two paths forward — pick one when resuming

### Path A — Polish to finished (1–2 focused days)

Goal: ship something coherent end-to-end at the current character-quality bar.

1. Fix the quest filter at **all three surfaces** — HUD list (read filter
   path), arc/villain plan generator, plus the existing LLM context fix.
2. Build a real opening sequence — title card → ~3-sentence narrated world
   hook → character-pick with portraits + role blurb → fade-in with music
   swell. Uses existing assets; no new tech.
3. Accept current character look. Frame the rough animation as a stylistic
   choice via the story framing.

When done: game shows to a friend without disclaimers.

### Path B — Multi-day character rebuild (3–5 days)

Goal: characters become genuinely animated and visually distinct per persona.

1. Mixamo auto-rigger pull (free with login). Retarget walk, idle, talk, wave,
   light attack onto the standard VRM humanoid via the `@pixiv/three-vrm`
   humanoid mapper.
2. Cherry-pick the reverted VRMA reactions commit (`2702f37`) back, but only
   after the procedural baseline actually looks right.
3. Consider TRELLIS pipeline for per-NPC unique bodies — accept static rig if
   that's what it takes for visual variety.
4. Quest filter still gets fixed, but as secondary.

When done: characters look like characters. Sets up everything else.

### Recommendation: Path A first

Path B done before A means more bugs, less story, same "not playable" verdict
at higher polish. Path A gets us to a stable demo floor, then B becomes the
deliberate upgrade rather than the rescue.

## What's running / how to resume

- Dev servers: were left running on `:5175` (vite) and `:5174` (api). They may
  have been killed by tab close — restart with `pnpm dev` and `pnpm dev:server`.
- Modal apps: 6/8 quota used (`aliveville-portraits`, `sadtalker`, `parler-tts`,
  `latte-video`, `sdxl-image`, `reel-maker`). The bake-off apps (`trellis`,
  `hunyuan3d`) were stopped at the end of the SadTalker spike.
- Latest portrait pregen: `tmp/experiments/saitama-talking.mp4` + frame
  samples in `saitama-frames/`. Reference for "what SadTalker outputs."
- SadTalker key rotated; lives at `/tmp/sadtalker-key.txt` (not in repo).
- Branch: `main`. Pushed to `origin`.

## Open follow-ups not in either path

- AniPortrait spike (full-frame talking head, replaces SadTalker if revisited)
- `@react-three/uikit` for in-canvas pause / inventory / quest-accept / death
- `leva` for `?dev=1` debug knobs
- Mobile virtual joystick (`nipplejs`)
- Save slot UI (autosave works; no UI surfaces it)
- Per-fight intro cutscene (camera dolly + letterbox + portrait flash)

Each one is in `docs/knowledge/research/game-mechanics-audit.md` with effort estimates.

## Honest notes for next-me

- 5 of 7 commits today shipped without visual verification. Don't repeat.
- Snapshot script needs to be world-aware before the next session.
- "Not playable" came after a sprint of features. Stabilise before adding.
- The audit's 1-day sprint was the right call for ambition; the execution missed
  the verification step. Same plan, slower delivery, would have caught the
  T-pose before the user did.
