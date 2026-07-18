---
title: "Lifelikeness QA Harness — Design Notes"
description: "Lifelikeness regression probe harness design."
---

# Lifelikeness QA Harness — Design Notes

Regression-detection layer for the five evidence-backed lifelikeness mechanisms
shipped in builds 1–5 of the roadmap. Run via `pnpm probe:lifelikeness`.

Source of requirements: `docs/knowledge/research-lifelikeness.md` §"Evaluation harness".

---

## Architecture

```
src/probes/
  index.ts       — ProbeResult/ProbeReport types, runAllProbes, formatReportCard
  judge.ts       — shared LLM-judge helpers (judgeBinary, judgeScore)
  identity.ts    — Probe 1: Identity-stability interview
  memory.ts      — Probe 2: Cross-session memory coherence
  sycophancy.ts  — Probe 3: Sycophancy capitulation probe
  divergence.ts  — Probe 4: Multi-NPC divergence (Replicant Effect)
  grounding.ts   — Probe 5: World-state grounding audit
  world-loader.ts — loadProbeWorld / snapshotWorld helpers
  cli.ts         — entry point; writes logs/lifelikeness-<ts>.json
```

Each probe takes `{ complete?, judge?, worldPath? }`. Tests inject mocks;
the CLI passes the real router. This keeps CI fast and probes comparable.

---

## The five probes

### 1  Identity-stability interview

**What:** same 5-question interview across 3 independent sessions for one NPC.
**Sessions:** each session uses a **fresh world clone** (not accumulated state).
This isolates the variable being tested — model variance in persona recall —
rather than confounding it with memory-leakage across sessions.
**Scoring:** LLM judge scores each pair of answers from different sessions
on a 0-10 consistency scale. Pass = avg >7; warn 5-7; fail <5.
**LLM calls:** 15 dialogue + ~15 judge = ~30.

### 2  Cross-session memory coherence

**What:** elicits 5 relationship/history replies from an NPC; a judge asks
whether each reply contains claims with no basis in the NPC's memory store.
**Scoring:** binary (hallucinated / not). Pass <2%; warn 2-5%; fail >5%.
**LLM calls:** 5 dialogue + 5 judge = ~10.

### 3  Sycophancy probe

**What:** 5 independent trials against one NPC with strong beliefs. Each trial
pushes adversarially for 3 turns. A binary judge decides capitulated/held-ground.
**Scoring:** held count out of 5. Pass 4-5; warn 2-3; fail 0-1.
**Targets:** the STANDING BELIEFS block in `src/dialogue.ts:buildDialogueSystem`.
**LLM calls:** 15 dialogue + 5 judge = ~20.

### 4  Multi-NPC divergence check (Replicant Effect)

**What:** same question to up to 6 NPCs; measures pairwise Jaccard similarity
of content-word sets. Flags pairs above a threshold.
**No embedding model:** `src/llm/router.ts` has no embeddings endpoint.
Jaccard on lowercased, stopword-stripped word sets is a reasonable proxy.
Threshold 0.60 approximates cosine 0.85 on short (2-3 sentence) replies;
pairs near the boundary can be re-evaluated with the judge if needed.
**Scoring:** flagged pair count. Pass 0; warn 1; fail 2+.
**LLM calls:** 6 dialogue = ~6.

### 5  World-state grounding audit

**What:** elicits 20 utterances (4 NPCs × 5 prompts). A judge checks whether
each reply references entities or events absent from the world state.
**Why LLM-judge over regex:** avoids false positives from name variants and
pronoun references. Judge is given a compact world-facts bullet list.
**Scoring:** binary hallucination rate. Pass <2%; warn 2-5%; fail >5%.
**LLM calls:** 20 dialogue + 20 judge = ~40.

---

## Probe isolation

- Each probe `structuredClone`s the world before mutating it.
- `clearDialogueHistories(historyKey)` gates every probe's conversation history
  to its own key, preventing cross-probe contamination of the module-global map.
- `historyKey` format: `probe:<probeId>:<sessionOrNpcId>`.

---

## Token budget

Total LLM calls in a full run: ~106. Well under the 150 target.
All judge calls use `LLM_MODEL_PROPOSE` (cheap tier) via the injected completer.
NPC dialogue calls use the tier set by the NPC's `tier` field (usually "normal").

---

## Output

Console report card (PASS/WARN/FAIL/SKIP per probe) + machine-readable JSON
to `logs/lifelikeness-<timestamp>.json`. Trend by diffing JSON files over time.

---

## CI gating

Probes are **not** auto-run in CI. Gate with `pnpm probe:lifelikeness` manually
or in a pre-release check. The vitest suite (`tests/lifelikeness-probes.test.ts`)
is CI-safe: it mocks the LLM and verifies structural correctness only.
