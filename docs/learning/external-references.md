# External References

One-line "what / why it matters here / link" entries. See `docs/archive/init.md`
§17 for the original full research bibliography with more context.

---

## R3F / Three.js

**React Three Fiber** — React renderer for Three.js; why: data-driven scenes
from world JSON without a visual editor.  
https://docs.pmnd.rs/react-three-fiber

**drei** — R3F helper collection (camera controls, postprocessing hooks, stats);
why: reduces boilerplate for controls and physics setup.  
https://github.com/pmndrs/drei

**@react-three/rapier** — WASM Rapier physics in R3F; why: kinematic character
controller + building colliders from worldgen geometry.  
https://github.com/pmndrs/react-three-rapier

**@react-three/postprocessing** — Effect composer for Bloom, Vignette, FXAA,
ToneMapping; why: the beauty pass (bloom on lit windows, ACES tonemapping).
Critical gotcha: always add `<ToneMapping>` explicitly or the scene renders dark.  
https://github.com/pmndrs/react-postprocessing

**Rapier physics docs** — kinematic controller API, collider shapes, sensor
colliders; why: reference for character step + slope config.  
https://rapier.rs/docs/

---

## Cloudflare Workers / Durable Objects

**Durable Objects docs** — actor model, hibernation API, SQLite storage,
migrations; why: one DO per session is the core isolation mechanism.  
https://developers.cloudflare.com/durable-objects/

**Workers Assets** — serving a static Vite build from the same Worker; why:
zero-config CDN for the 3D client alongside the DO backend.  
https://developers.cloudflare.com/workers/static-assets/

**Workers Service Bindings** — internal Worker-to-Worker calls without going
through the public internet; why: required to call the LLM gateway from within
a DO (same-account `workers.dev` URLs are blocked).  
https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/

**Wrangler CLI** — deploy, secret management, dev tunnels; why: the only deploy
path for Workers + DOs.  
https://developers.cloudflare.com/workers/wrangler/

---

## LLM agent patterns

**Generative Agents (Smallville)** — memory stream, retrieval (recency × importance
× relevance), reflection, planning, emergent social behavior; why: the canonical
academic reference for the NPC memory + reflection architecture. Reflection
ablation (d=8.16) is the strongest single-mechanism result in the field.  
https://arxiv.org/abs/2304.03442

**SHARP (sycophancy mitigation)** — character-anchored prompts with standing
beliefs reverse LLM sycophancy; why: direct justification for the anti-sycophancy
anchoring in `src/dialogue.ts`.  
TBD: locate the exact SHARP paper citation (referenced in `docs/research-lifelikeness.md`).

**PIANO / Cognitive Controller** — coherence enforcement as a bottleneck before
NPC speech; why: justification for the action-awareness coherence check.  
TBD: locate the PIANO paper citation.

**LIFELONG-SOTOPIA** — persistent memory without compression degrades believability
over long sessions; why: motivation for the reflection layer and memory importance
scoring.  
https://arxiv.org/abs/2310.11667 (SOTOPIA base; LIFELONG variant — TBD exact arXiv link)

**Player incoherence study (2512.07388)** — incoherent NPCs rate less intelligent
and believable in player studies; why: the coherence check pays off in perceived
NPC quality, not just consistency.  
https://arxiv.org/abs/2512.07388

**Sylvester "Simulation Dream"** — deep simulation fails unless condensed into
legible hints for the player; why: the Chronicle / causal-trace layer design.  
https://www.gamedeveloper.com/design/the-simulation-dream (Game Developer article)

---

## Phaser

**Phaser 3 docs** — tilemap, camera, input, scene lifecycle; why: used in the
now-retired 2D Phaser client (see `docs/archive/agent-town-handoff.md`). No
longer actively used; retained here as a reference for the archived track.  
https://phaser.io/docs/

---

## 3D assets and pipeline

**Quaternius Universal Animation Library (CC0)** — rigged mannequin + 45
animation clips; why: the animation base for all 3D characters.  
https://quaternius.com/packs/universalanimationlibrary.html

**VRM / three-vrm** — VRM 0.x + 1.0 loader plugin for Three.js; why: anime
avatar import with MToon toon shading and spring-bone physics.  
https://github.com/pixiv/three-vrm

**Kenney (CC0 game assets)** — Nature Kit and City Kit Suburban wired into the
scene; why: first step in the hybrid procedural + curated pipeline.  
https://kenney.nl/assets

**Poly Haven (CC0 PBR models)** — planned future source for hero props; why:
hyper-real PBR quality at zero licensing cost.  
https://polyhaven.com/models

**Kevin MacLeod / incompetech (CC BY 4.0 music)** — ambient tracks for village,
city, interior, combat, menu; why: direct-URL MP3s, clear attribution path.  
https://incompetech.com/

---

## AI dungeon competitive context

**AI Dungeon** — text-adventure platform with Story Cards, Memory Banks, multiplayer;
why: explicitly different lane — see `docs/ai-dungeon-differentiation.md` for
the full positioning doc.  
https://aidungeon.com/
