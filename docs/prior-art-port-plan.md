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
   `embed()` now defaults to `@cf/baai/bge-base-en-v1.5` + sends `project_id`.
   **Now strictly opt-in (`MEMORY_SEMANTIC_RECALL=1`); the default is pure
   lexical+structured recall — zero server/network.** The scorer lives in a pure
   browser-safe module (`src/memory-score.ts`), and the **in-browser local-LLM
   dialogue now ranks NPC memories client-side** (`web3d/src/ai/npc-prompt.ts`) with
   no server. Optional next: a *local* WebGPU embedder (transformers.js, reuse
   `capabilities.ts`) for semantic recall with no server.
2. ~~**Sleep-time consolidation (Letta)**~~ **SHIPPED (2026-06-14).** `src/consolidation.ts`
   distils each NPC's player-related memories + reflections into a standing
   `npc.playerImpression`, injected into the dialogue "STANDING BELIEFS" block. Runs
   deterministically in offline catch-up (`catch-up.ts` — the literal "sleep"); LLM
   version (`consolidatePlayerImpression`) ready to wire into the live loop next to
   reflection. Tests in `tests/consolidation.test.ts`. Letta pattern (Apache-2.0).
3. ~~**mem0 atomic fact extraction**~~ **SHIPPED (lightweight variant, 2026-06-14).** Did the
   *deterministic, no-LLM* version: `memoryMetaFromText` (`agents.ts`) now gives graduated
   importance (high-stakes + conflict + consequence signals) instead of binary 7/4. Keeps it
   lightweight/browser-friendly; the LLM fact-extraction variant remains optional.
4. ~~**Relational/causal memory layer**~~ **SHIPPED (2026-06-14).** `src/memory-relational.ts`
   (pure, browser-safe): `memoriesAbout` (entity-centric recall), `entitiesInText`,
   `relationalContext` — "what you remember about <the player / a named NPC>", independent of
   keyword overlap. Wired into BOTH server dialogue (`dialogue.ts`) and the **in-browser**
   local dialogue (`npc-prompt.ts`). Tests in `tests/memory-relational.test.ts`. This is the
   lightweight, no-graph-DB version of the Graphiti idea (#6 below subsumed for now).
5. **Hierarchical planning (Stanford `plan.py`)** — NOT done. Bigger, different axis
   (behavior, not memory), and quality is LLM/playtest-gated. Good next steal if you want
   deeper autonomy.
6. **A\* movement** — NOT done; marginal (Dijkstra works).
7. **Local WebGPU embedder (transformers.js)** — DEcided AGAINST for now: it adds a heavy
   model dependency and **contradicts the "lightweight + in-browser" principle** we set, and
   embeddings aren't the recall bottleneck at game scale (structured + lexical + synthesis
   wins). Revisit only if a playtest shows semantic recall is genuinely needed client-side.

## Future — BOTC multiplayer (north-star)
- **Referee owns ground truth**, exposes only per-player views (AvalonBench/Werewolf
  studies) — extends the existing engine-validates-actions pattern.
- **Phase state machine** (night/discussion/vote) with per-phase legal actions.
- **ReCon recursive theory-of-mind** for bluffing — route to the cloud tier (small
  models bluff weakly).

## The non-stealable part (the moat)
Research surfaced **almost nothing to steal for world-extraction-from-fandom-ingest** —
which confirms it's the genuine differentiator. Build it; there's no shortcut to copy.
