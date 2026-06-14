# Prior-Art Steal List & Port Plan

**Status**: 2026-06-14. What to borrow from open-source agent projects, mapped to
**current** Aliveville state so nobody re-builds what already exists. All sources
below are permissively licensed (copyable WITH attribution).

## Sources & licenses
| Project | License | Use |
| --- | --- | --- |
| AI Town (`a16z-infra/ai-town`) | **MIT** | copy TS (memory, A*, tick loop) |
| Generative Agents / Smallville (`joonspk-research/generative_agents`) | **Apache-2.0** | port algorithms (reflection, planning, retrieval) |
| mem0 (`mem0ai/mem0`) | **Apache-2.0** | TS SDK; fact extraction |
| Letta / MemGPT (`letta-ai/letta`) | **Apache-2.0** | patterns (memory tiers, sleep-time consolidation) |
| Zep/Graphiti (`getzep/graphiti`) | **Apache-2.0** | concepts (edge invalidation, salience) |
| Hoodwinked / AvalonBench / ReCon | permissive | BOTC referee + ToM patterns |

## Already in the codebase — DO NOT rebuild
- **Reflection (Smallville mechanism #1)** — `src/reflection.ts` (`reflectionDue` +
  `reflectNpc` LLM + `reflectNpcScripted` fallback), wired into `server.ts`,
  `worker/src/session-do.ts`, `catch-up.ts`; 14 tests. *(The "no reflection layer"
  note in research-lifelikeness.md was stale — corrected.)*
- **Memory stream + importance** — `npc.memories[]`, heuristic importance scorer
  (`agents.ts`), `reflection`-tagged beliefs consumed by the dialogue prompt.
- **Engine-validated action vocabulary** — the "LLM proposes → engine validates →
  retry-with-hint" loop (`src/llm/`, `simulation.ts`). Stronger than AI Town/Smallville
  (they're talk-only); this is the BOTC-referee foundation.
- **Relationship axes** — `relationshipAxes` (trust/affection/respect/suspicion/fear/debt)
  updated on events + injected into dialogue ≈ Letta's "core-memory opinion of you."
- **Movement** — Dijkstra over a street waypoint graph (`web3d` worldgen/navgraph).
- **Planning (partial)** — `npc.plan`, `scheduledBlockFor`, `planAgentIntent`.
- **Tiered LLM router** — background/normal/quest tiers + local-ai/cloud fallback.

## Stolen this session
- **Memory retrieval scorer → Generative Agents formula** (`agents.ts` `scoreMemory`):
  replaced hand-rolled additive scoring with normalized **recency(exp-decay) ×
  importance × relevance**, weighted; returns top-k by combined score. Attributed;
  `tests/memory-retrieval.test.ts` (4 tests). Fills mechanism #3.

## Remaining steals — prioritized, genuinely missing
1. ~~**Embeddings for true relevance.**~~ **SHIPPED (2026-06-14).** `src/llm/embeddings.ts`
   (OpenAI-compatible `/embeddings` via the gateway, graceful null fallback) +
   `src/llm/cosine.ts`; `scoreMemory` now uses cosine relevance when vectors exist
   (else keyword); `retrieveMemoriesSemantic` (simulation.ts) embeds query + recent
   memories (cached on `meta.embedding`) and is wired into the dialogue prompt
   (`dialogue.ts`). Zero-regression: with no `/embeddings` endpoint it falls back to
   keyword. Tests in `tests/memory-retrieval.test.ts`. **Activates automatically once
   the gateway exposes `/embeddings` (set `LLM_MODEL_EMBED` if needed).** Pattern from
   AI Town `embeddingsCache.ts` (MIT). **Confirmed: the `free-ai` gateway DOES serve
   `/v1/embeddings`** (Workers AI `@cf/baai/bge-*`, Voyage, Gemini `text-embedding-004`);
   `embed()` now defaults to `@cf/baai/bge-base-en-v1.5` + sends `project_id`, so it
   activates against the live gateway. Next refinement: a *local* WebGPU embedder
   (transformers.js, reuse `capabilities.ts`) so recall works with no server.
2. ~~**Sleep-time consolidation (Letta)**~~ **SHIPPED (2026-06-14).** `src/consolidation.ts`
   distils each NPC's player-related memories + reflections into a standing
   `npc.playerImpression`, injected into the dialogue "STANDING BELIEFS" block. Runs
   deterministically in offline catch-up (`catch-up.ts` — the literal "sleep"); LLM
   version (`consolidatePlayerImpression`) ready to wire into the live loop next to
   reflection. Tests in `tests/consolidation.test.ts`. Letta pattern (Apache-2.0).
3. **mem0 single-pass atomic fact extraction** — replace the regex importance heuristic
   (`agents.ts:254`) with one cheap LLM call emitting atomic facts + importance. Steal the
   prompt shape; skip the graph store.
4. **Hierarchical planning (Stanford `plan.py`)** — upgrade partial planning to
   day→hourly→5-15min agendas + needs-driven replanning (mechanism #6, medium evidence).
5. **A\* movement (AI Town `movement.ts`)** — optional; current Dijkstra works. Marginal.
6. **Graphiti edge-invalidation** — beliefs that change with history (trust→betrayed).
   Concept-only (needs a graph store); reimplement lightly if/when needed.

## Future — BOTC multiplayer (north-star)
- **Referee owns ground truth**, exposes only per-player views (AvalonBench/Werewolf
  studies) — extends the existing engine-validates-actions pattern.
- **Phase state machine** (night/discussion/vote) with per-phase legal actions.
- **ReCon recursive theory-of-mind** for bluffing — route to the cloud tier (small
  models bluff weakly).

## The non-stealable part (the moat)
Research surfaced **almost nothing to steal for world-extraction-from-fandom-ingest** —
which confirms it's the genuine differentiator. Build it; there's no shortcut to copy.
