# Performance Notes — web3d client

**Status**: 2026-06-14. Honest framing: "smoothness" is a runtime/GPU property
that must be measured **on a real device** — it cannot be verified headlessly
(the smoke harness runs software-rendered swiftshader at ~8 fps, which says
nothing about real hardware). This page records the structural findings + a
profiling plan so the tuning can be done with a profiler open.

"Latest tech" does **not** imply smooth: the game renders via **WebGL** (R3F /
Three) — the WebGPU work is inference/compute/an isolated demo, none of it on
the game's render path. Frame cost is unchanged by the frontier layer.

## Applied (safe, verified by build)
- `controls/PlayerController.tsx`: hoisted the per-frame `new THREE.Vector3(0,1,0)`
  up-axis to a module constant (`UP_AXIS`). Removes one allocation per movement frame.

## NOT applied (need device profiling first — don't guess)
Per-frame allocations remain in the hot loops (`new THREE.Vector3` / `.clone()`):
`controls/PlayerController.tsx` (~10), `characters/RiggedCharacter.tsx` (~10),
`characters/Npc.tsx` (~8, ×N NPCs/frame). These are computed scratch vectors
entangled with frame logic; hoisting them to reusable temporaries is a real
optimization but risks subtle aliasing bugs that a screenshot can't catch.
**Do these with a profiler + visual confirmation**, one file at a time.

## Likely highest-leverage levers (measure before/after)
1. **devicePixelRatio** — `<Canvas dpr={[1, 1.5]}>` (`scene/GameWorld.tsx`). On a
   2× display this renders ~2.25× pixels. Try `dpr={[1, 1.25]}` or a quality
   toggle; fragment-bound scenes gain the most. (Visual tradeoff — needs your eyes.)
2. **Shadows** — `<Canvas shadows>` + per-light shadow maps are expensive. Check
   shadow-map resolution and how many lights cast; consider a low setting.
3. **Post-processing** — Bloom + Vignette + ACES + FXAA run every frame. The
   `?nofx` URL param already disables the chain — A/B with it to measure its cost.
4. **NPC draw calls** — each NPC is procedural geometry; with many NPCs, look at
   instancing / merging and whether off-screen NPCs can skip per-frame work.
5. **React re-renders** — audit zustand selectors that might re-render large
   subtrees on every tick (the sim streams over SSE).

## Profiling plan (with a real device)
1. Chrome DevTools → Performance: record 10 s of play, look at scripting vs
   rendering vs GPU, and the frame chart for long frames.
2. Add an on-screen stats panel (e.g. `r3f-perf` or three's `WebGLRenderer.info`)
   to watch draw calls / triangles / programs live; the existing FrontierHud
   already shows FPS.
3. A/B the levers above (dpr, `?nofx`, shadows) and record fps deltas.
4. Only then refactor the hot-loop allocations, verifying movement/combat still
   feel right after each change.
