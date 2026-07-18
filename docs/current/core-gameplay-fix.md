---
title: "Aliveville Core-Gameplay Fix Plan: Make It a Game First"
description: "Capped milestone plan: make Aliveville a game first. The gate for north-star work."
---

# Aliveville Core-Gameplay Fix Plan: Make It a Game First

**Status**: Capped milestone closed under product-owner deferment; no human fun verdict recorded — 2026-07-13
**Owner**: Engineering (fleet)
**Goal in one line**: Turn "an impressive sandbox you wander" into "a game with a loop that pulls you forward and stakes you feel" — *before* any frontier-tech work.
**Gate**: This blocks `docs/archive/future-prd-deferred-north-star-2026-06-12.md`
and any XL content/lifelikeness work. (Web-frontier capability code shipped
2026-06-14 — see `docs/archive/web-frontier-prd-shipped-2026-06-14.md`.)
**Related (do not duplicate)**:
- `docs/architecture/web3d-client.md` — current client modules
- `tests/gameplay-loop.test.ts` + `worlds/village.json` — the current "first playable" loop
- `src/probes/` + `pnpm probe:lifelikeness` — eval harness (extend for fun, not just lifelikeness)
- `docs/archive/future-prd-deferred-north-star-2026-06-12.md` — content/lifelikeness north-star (deferred until this gate clears)

---

## 1. Diagnosis: built inside-out

The parts exist; they aren't a game. Grounded in the code:

- **Combat feel primitives are already there** — `hitstop`, `addCameraShake`,
  `playerFlash`, sfx (`hitImpact/hurt/deathThud/victorySting`), VFX
  (`spark/damage/telegraph/dust`), enemy stance/strafe/telegraph
  (`combat/store.ts`, `combat/pacing.ts`).
- **A quest spine exists** — `accept_quest → move → pickup → give → done` with
  relationship deltas (`tests/gameplay-loop.test.ts`, `src/simulation.ts`),
  `QuestTracker` HUD, objective markers on the minimap.
- **Progression scaffolding exists** — `playerLevel`, `setPlayerGrowth`, XP on
  spar win.
- **A rich consequence engine exists** — autonomous agents, rumors, arcs,
  director cutscenes, story-pressure-driven city mood (M2–M4).

**So why does it feel bad?** The simulation and the player loop are
**disconnected**. The canonical loop is *one fetch quest* (return Mira's shears)
bolted on top of a simulation the player cannot perceive or affect in the moment.
There is no goal hierarchy, no win/lose, no visible growth, and the moment-to-moment
isn't tuned. The player gets a tech demo to walk around in, not a game.

**The fix is mostly wiring + tuning, not new systems.** Connect the sim's
consequence engine to a legible player loop, tune the feel knobs that already
exist, and prove it on ONE scenario.

## 2. Philosophy: one vertical slice, fun before features

When everything feels off, do **not** fix four dimensions across the whole game
in parallel — that's how it stays mediocre everywhere. Build **one scenario
polished to "I'd keep playing this" quality**, then expand outward from proof.

The loop every game needs, and Aliveville lacks as a *felt* thing:

> **Goal** (why am I here) → **Action** (tight, responsive) → **Feedback**
> (the game reacts, juicily) → **Consequence** (the world changed because of me)
> → **next Goal** (raised stakes).

Aliveville's unique edge is the **Consequence** step — the AI sim can make the
world visibly change. Today that change is invisible background. The slice's job
is to pull it into the loop.

## 3. The four broken dimensions → concrete fixes (in this codebase)

### A. Core loop / goals
- Add a **goal hierarchy** on top of the existing quest system: *session goal*
  (stop the rival's plan) → *current objective* (the next quest step) → *next
  action* (the HUD always answers "what do I do right now").
- Add a **win/lose condition** for the slice using the existing director
  villain-plan stages + story-pressure meter (M4): win = stop the plan; lose =
  pressure maxes out. Stakes the whole session.

### B. Game feel / juice
**Correction (2026-06-14, from reading the code) — combat is NOT the gap.** It is
already a complete, client-authoritative, animated action system: `player-fsm.ts`
runs a 3-hit combo with input buffering, dodge i-frames, lock-on, lunge and
level scaling; `performHit` lands on the active frame and `damageEnemy`
(`combat/store.ts`) fires hitstop + camera shake + spark + floating damage +
knockback + sfx *immediately*; attacks animate via `trigger()` tweens
(`VrmCharacter`/`ArchetypeCharacter`); enemies run a full
`approach→telegraph→strike→recover→strafe→retreat` AI with hit-reactions. The
"chip attack + HP floor" model (`pacing.ts`) only governs enemy→player damage —
not the feel of the player's own hits.
- **Do NOT refactor the damage authority model** — it already predicts locally
  then reconciles. The earlier "biggest single fix" framing here was wrong.
- Real remaining feel work is **tuning + polish, confirmed by playtest**: quality
  of the procedural swing tweens (stiff/unreadable?), enemy engagement *density*
  (does enough fight back, with clear tells?), and damage/timing balance.
- Movement snappiness pass on `PlayerController.tsx` only if a playtest flags it.

### C. Progression / stakes
- Make the existing XP/level loop **visible and consequential**: defeat/spar →
  XP → level → unlock a move or stat → the rival's enemies get harder. Show the
  growth (level-up flourish already has `questChime`).
- **Something to lose**: the rival's plan escalates if ignored — the town
  visibly worsens (mood shift already wired in M4). Loss has a face.

### D. Onboarding / UX
- Replace any text-dump onboarding with a **guided first 60 seconds**: one forced
  tiny objective that teaches move → talk → fight → see-a-consequence, each
  gated so the player can't get lost. Teach by doing, not by reading.

## 4. The recommended vertical slice: "The Rival"

One named rival NPC with a goal that conflicts with the player's, in one district.
This fuses all four fixes AND showcases the AI edge inside the core loop:

1. **Goal** — intro cutscene (M4 exists): the rival announces a plan; you get a
   clear session goal + a pressure meter.
2. **Action** — reach the rival through tight, retuned combat against their
   allies (dimension B); talk-or-fight choices use existing dialogue + combat.
3. **Feedback** — every hit/choice is crisp and juicy; the pressure meter and
   rival relationship move *visibly*.
4. **Consequence** — your actions change the rival and the town in front of you
   (rumors spread about what you did; mood shifts) — the sim, made legible.
5. **next Goal** — win (stop the plan) or lose (pressure maxes); either way the
   chronicle records *your* causal story, seeding the next session.

This is ~one rich scenario, not a new engine. It reuses combat, quests, dialogue,
director, arcs, rumors, chronicle, mood — wired into a loop and tuned.

## 5. Acceptance bar: is it fun?

Ship-the-slice criteria (extend `src/probes/` + `tests/` to enforce what's testable):
- A new player completes the guided 60s without confusion (playtest).
- At every moment the HUD answers "what do I do next" (objective spine).
- Combat is client-responsive: hit feedback fires on the same frame as input
  (already true today — just don't regress it).
- The session has a clear win AND lose state, both reachable.
- At least one player action produces a **visible** world consequence within the
  session (rumor/mood/relationship the player can point to).
- Verdict is a **playtest call**, not a green test suite. "Tests pass" ≠ "fun."

## 6. Closure status (2026-07-13)

What's **built + tested** (the safely-buildable spine):
- **Stakes / progression** (dim C) — coin economy + lose 25% of coins on defeat.
  `src/simulation.ts`, `tests/currency.test.ts`.
- **Objective spine** (dim A) — `nextObjective()` (`src/outcome.ts`) guarantees the
  HUD always answers "what do I do next"; wired into `Hud.tsx`. Tested.
- **Win / lose** (dim A/C) — `sessionOutcome()` derives won (arc complete / dawn
  phase) / lost (director pressure maxes) and shows a HUD banner. Tested.
- **Combat feel** — confirmed already complete; not touched (see §3B).
- **The Rival scenario** (§4) — `worlds/rival-duel.json` provides Kael, Marta,
  Claim Boss Verna, three quests, authored pressure, reachable win/lose paths,
  and finite tension data. `tests/rival-duel.test.ts` covers the content contract.
- **Guided first minute** (dim D) — `rival_duel` now uses a persisted,
  non-modal move → talk to Kael → fight Kael → consequence guide instead of the
  static controls dump. Each step advances only from observed client state.
- **Fair first minute** — the Rival agent loop and pressure clock stay stopped
  through world/character selection and the guide, then resume when the player
  acknowledges completion. Other worlds keep normal autostart.
- **Local readiness evidence** — `pnpm verify:readiness` passes (62 files / 463
  tests, lint/typecheck, production 3D build); strict OpenSpec validation passes;
  headless desktop and 390×844 Rival runs advance the guide, verify loop
  pause/resume, and finish with zero browser errors.

What's **deferred — needs a playtest before expansion resumes (your verdict, per §5), not more code**:
- A human must start a fresh Rival session, complete the guide and the session
  without developer help, and record whether the next action remained clear,
  combat felt responsive/readable, and at least one world consequence was
  obvious.
- The same human must record a clear **fun** or **not fun** verdict. If it is not
  fun, capture the concrete combat-balance, animation, enemy-density, pacing, or
  consequence-legibility failures before implementing tuning.

**This PRD's local implementation is complete. On 2026-07-13, the product owner
closed the capped milestone for now and deferred the human playtest.** No
playtest was conducted and this is NOT a claim that "the game is now good."
That judgment remains unknown until a future human session.

If feature expansion resumes, this human playtest and explicit verdict are the
first gate before work from the deferred future PRD.
