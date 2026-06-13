# Lessons Learned

Concrete, hard-won lessons from building Aliveville. Each entry names the
problem, what actually happened, and the fix or standing guard. Topics already
covered in other docs are linked rather than repeated.

---

## R3F + Rapier performance

**Per-lamp lights kill framerate.** The initial plan placed one point light per
courtyard lamp. This was the single worst performance offender: each dynamic
point light forces shadow map recalculation for nearby geometry. The fix was one
warm point light per district courtyard (not per lamp) and baking light color
into emissive materials for the lamp meshes. Target: ~120 fps on M-series at
1280 × 800 after the change.

**`EffectComposer` silently disables Three's default tone mapping.** Without an
explicit `<ToneMapping>` inside the effect chain, the scene renders flat and dark.
This took a full debugging session to find. Always add `<ToneMapping effect={ACESFilmicToneMapping}>` (or similar) when using `@react-three/postprocessing`.

**MSAA vs FXAA on M-series GPU.** Multisampling (`multisampling={4}` on
`EffectComposer`) is expensive on Apple Silicon GPUs. Prefer `FXAA` with
`multisampling={0}`. The visual difference at 1.5× dpr is negligible; the
framerate savings are real.

**NPC and player positions must be imperative, not React state.** Driving
character positions through the React `position` prop triggers R3F reconciliation
every frame, causing visible teleports and wasted reconcile budget. The right
pattern: `position` prop holds the initial spawn only; all subsequent movement
writes directly to `ref.current.position`. See `web3d-architecture.md` §"Sim ↔ client sync".

**`useFrame` + `structuredClone` of world state = dropped frames.** Cloning the
full world JSON in a `useFrame` callback to check for changes is too slow. Use
shallow field comparisons or zustand selectors to extract only the fields you
need, then let the R3F store invalidate selectively.

---

## Rapier physics specifics

**NPC actors have no rigid bodies — hit detection must be manual.** Rapier sensor
colliders would be ideal for melee hitboxes, but NPCs are visual-only (no Rapier
bodies). The alternative was cone checks against the live NPC position registry
at the attack's active frame. This is a deliberate deviation from the original
plan; it works because the registry is updated synchronously before each
`useFrame`. See `web3d-architecture.md` §"Combat".

**Building colliders must match worldgen geometry exactly.** If the collider
extents lag behind a worldgen refactor, the player clips through walls invisibly.
Keep the collider generation in `worldgen/` co-located with the mesh generation
— they should use the same dimension constants.

---

## Deterministic worldgen and reproducibility

**`mulberry32(hash(worldId:locationId:...))` is the single source of randomness.**
Every prop placement, building seed, facade color, and NPC spawn uses this
seeded PRNG. If any call order changes, the entire town layout shifts. Unit tests
in `tests/web3d-worldgen.test.ts` pin layout assertions; run them before touching
worldgen. The payoff: the same world JSON always produces the same town (tested).

**NavGraph connectivity must be tested per-exit.** A street A* that cuts through
foreign plot rectangles produces disconnected graphs. The test
`tests/web3d-worldgen.test.ts` asserts that no street point falls inside a plot
it did not originate from, and that `findDistrictPath` returns a valid path for
every exit pair. This caught a routing regression during the multi-district
streets rewrite.

---

## LLM agent loop pacing and cost

**The ambient proposal tier is the call-volume chokepoint.** `LLM_MODEL_PROPOSE`
fires for up to 10 NPCs per tick at the default 4 s interval. This is where cost
multiplies quickly. The mitigation: a cheap model tier (`cerebras-llama-8b`),
a per-tick NPC cap (`LLM_MAX_NPCS`), and smart-local mode that raises the cap
only when a free local backend is active. See `docs/local-llm.md`.

**Fixed-interval polling naturally self-throttles under model latency.** If an
LLM call takes 3 s, the loop misses that interval (the `stepping` flag blocks
re-entry) and resumes on the next. This prevents call stacking without any
explicit queue. The minimum interval is clamped to 250 ms to prevent runaway
calls in tests.

**Local model latency is 2–5 s per turn; never block player input on it.**
The rule from `docs/archive/init.md` §16 still holds: player movement and camera
rotation must never wait for an LLM call. The agent loop runs on its own timer
independent of the render loop; player actions (POST `/api/tick`) also do not
await the ongoing agent step.

**Director only fires on "quiet" ticks.** `src/simulation.ts` gates the director
on `actions.length === 0` — if NPCs were already busy, the director stands down.
This prevents beat spam during heavy social activity. The tradeoff is that beats
are suppressed during exciting stretches; the intention is that the director
amplifies lulls, not adds noise to peaks.

---

## Durable Object RPC patterns

**Same-account Worker-to-Worker calls over `workers.dev` are blocked.** The LLM
gateway is a separate Worker on the same account. Using its public `workers.dev`
URL from `GameSessionDO` fails silently (the call hangs or returns 403). The fix
is a service binding (`GATEWAY` in `wrangler.jsonc`) that routes the call
internally. This is a non-obvious Cloudflare platform constraint that costs ~1 h
of debugging if you don't know about it.

**DO hibernation means the DO constructor runs on every request after sleep.**
State that lives in JS instance fields is lost on hibernation; world state is
re-hydrated from DO SQLite storage via `ctx.storage.get()` on each request. The
`engine` field is initialized lazily so the first request after hibernation pays
a hydration cost (~20 ms for typical world JSON).

**Debounce the DO persist writes.** Writing world JSON to storage on every tick
(4 s) would saturate the DO's SQLite write budget and cause noticeable latency.
The `PERSIST_DEBOUNCE_MS = 5_000` pattern batches writes so only the latest
world snapshot persists if multiple ticks fire in a burst.

---

## Director event timing gotcha

**`performance.now()` starts near 0 on page load, so a 0 default for the last
beat timestamp would swallow all beats in the first 25 s.** The cooldown baseline
must be `-Infinity`, not `0`. This caused the director to silently suppress every
beat on a cold-load session before it was fixed. See `web3d-architecture.md`
§"Director events".

---

## Dialogue coherence and anti-sycophancy

**Without explicit belief re-injection per turn, LLM NPCs fold to player
framing.** SHARP-style sycophancy is the default failure mode of instruction-tuned
models in roleplay. The fix is to re-inject the NPC's standing beliefs, values,
and flaws in the system prompt on every dialogue turn. This was added as a
deliberate build step (`feat: NPC reflection + anti-sycophancy anchoring`,
2026-06-12); the lifelikeness probes catch regressions. See
`docs/research-lifelikeness.md` §3 "Sycophancy" and `docs/probes-design.md`.

**Duplicate `remember` actions loop the model.** Without deduplication, a model
that generates the same memory multiple times fills the NPC's memory store with
near-identical entries, which then get retrieved together and reinforce the
repetition. The engine rejects duplicate remember actions; the prompt also
includes an anti-loop instruction. See `web3d-architecture.md` §"LLM dialogue".

**Streamed dialogue must also pass coherence validation.** An early version ran
the coherence check only on non-streaming replies. Streaming bypassed it. The
fix was to collect the full streamed buffer before checking, then flush to the
typewriter at 4× normal pace so the coherence check is invisible to the player.

---

## Asset pipeline

**Canvas-generated facades and ground are fast and free but visually thin.** The
procedural approach served M1–M4 but needs augmentation for production fidelity.
Kenney City Kit and Nature Kit (CC0, pulled 2026-06-13) are now wired as Suspense
alternatives with the procedural canvas as the fallback. Track all new sources in
`docs/third-party-assets.md` — license hygiene is non-negotiable.

**VRM MToon materials must not be swapped to MeshToonMaterial.** VRM files ship
with MToon, the correct anime-toon shader. Swapping to Three's
`MeshToonMaterial` breaks the spring-bone physics and expression system. Kenney
and Quaternius GLBs use standard/basic materials and should be swapped; VRMs
should not. See `docs/third-party-assets.md` §"VRM Characters".

**Tone-mapping and emissive maps for night windows must be opt-in.** Night-lit
window effects require a separate emissive `DataTexture` uploaded alongside the
diffuse facade texture. Without it, lit-window emissive intensity has no effect
because the geometry's emissive color defaults to black. The emissive map seeds
window subsets from the same `mulberry32` hash so night patterns are stable
across reloads.

---

## Testing discipline

**Headless SwiftShader framerate numbers are meaningless for 3D perf.** Always
measure with a real headed browser on the target hardware. The Playwright smoke
tests use `window.__game` handles for logic assertions (dialogue, NPC position);
they do not assert FPS.

**Probe isolation requires per-probe `historyKey` namespacing.** The LLM
dialogue module has a module-global conversation history map. Without per-probe
keys, probes leak context into each other and produce false positives. See
`docs/probes-design.md` §"Probe isolation".
