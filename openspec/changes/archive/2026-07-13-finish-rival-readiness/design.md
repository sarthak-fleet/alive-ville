## Context

The `rival_duel` world already supplies Kael, a combat path, an objective spine, win/lose logic, Chronicle evidence, and visible HUD feedback. The remaining first-minute experience is `Onboarding.tsx`, a centered list of seven controls that is disconnected from player actions. The guide can observe the existing UI, combat, and world stores; it does not need a simulation or schema change.

The checked-in status also claims four `buildVariation` failures. A clean locked install and the full Vitest suite pass all 451 tests, including `web3d-identity.test.ts`, so readiness work must verify rather than rewrite that intentionally uniform-height identity behavior.

## Goals / Non-Goals

**Goals:**

- Guide a first-time Rival player through move → talk to Kael → fight Kael → see the resulting consequence.
- Advance only from observed actions/state, keep each current instruction visible without blocking play, and persist progress locally.
- Keep the generic controls card unchanged for all non-Rival worlds.
- Make the progression rules deterministic and independently testable.
- Prove the repository's local readiness gate and correct stale status claims.

**Non-Goals:**

- Changing combat balance, NPC AI, the Rival world schema, simulation APIs, or win/lose rules.
- Claiming that the scenario is fun or visually tuned without the required human playtest.
- Deploying, changing the marketing site, or resuming the deferred north-star roadmap.

## Decisions

1. **Use a Rival-only state machine alongside the existing generic card.** `Onboarding.tsx` will select the guided experience only when `world.id === "rival_duel"`; other worlds keep the existing one-time controls card. This limits closure work to the PRD's named vertical slice. A global onboarding redesign was rejected because it would expand scope without evidence for other worlds.

2. **Observe existing client state instead of adding tutorial flags to the world.** Movement is demonstrated by a non-repeating WASD keydown while play is active. Talking is demonstrated when the Kael dialogue opens. Fighting is demonstrated when Kael becomes hostile or takes client-side damage. Consequence is demonstrated when Kael is defeated in client or authoritative world state, or the session reaches a terminal outcome. These signals already power visible game feedback and avoid simulation coupling. Adding a tutorial quest or server fields was rejected because it would alter persistence and game rules solely for UI guidance.

3. **Keep transition and persistence logic pure.** A small `rival-onboarding.ts` module will define steps, validated storage records, and monotonic transitions. The React component will only gather signals and render. This allows Vitest to prove ordering, invalid-storage recovery, and completion without a DOM test framework.

4. **Render a compact, non-modal mission card.** The Rival guide will sit at the top-left below the main HUD, expose step count, one action prompt, one context line, and a live-status region. It will not capture pointer input during action steps. Once the consequence is observed, it will show a final acknowledgement button; only then is the guide permanently dismissed. A centered tutorial modal was rejected because it obscures the world the player is meant to read.

5. **Treat readiness output as authoritative.** No identity code will change unless a focused or full check reproduces a defect. `PROJECT_STATUS.md` and the gameplay PRD will distinguish local acceptance from the still-open human fun verdict.

6. **Start the Rival clock after teaching, not on the title screen.** Client initialization will inspect the versioned Rival guide record before applying the existing agent-loop autostart policy. An undismissed or invalid record keeps the Rival loop stopped; the completion acknowledgement starts it. A valid dismissed record and every non-Rival world keep existing autostart. Merely slowing the pressure curve was rejected because it would retune the authored game and still spend the deadline during character selection.

7. **Close the capped milestone under an explicit owner deferment.** On 2026-07-13, the product owner chose to call the Rival-readiness milestone done for now without conducting the human playtest. This administrative closure does not manufacture a fun verdict: the verdict remains unknown and a fresh human playtest is still required before deferred expansion resumes.

## Risks / Trade-offs

- **[A keydown can occur while movement is temporarily blocked by the intro cinematic]** → ignore typing targets and repeating keys; the next prompt remains spatially grounded, and the human playtest still judges confusion and pacing.
- **[A player may choose a non-combat dialogue route]** → the guide remains on the fight prompt and does not alter game rules; this slice specifically teaches the authored showdown path.
- **[Local completion can outlive a reset Rival save]** → this is intentional one-time teaching, namespaced and versioned so a later onboarding redesign can invalidate the record.
- **[A stopped loop can make the world appear inert during teaching]** → the hold is limited to the four first-minute gates; explicit player actions still update state, and acknowledgement resumes the autonomous loop immediately.
- **[Automated checks cannot prove fun or visual feel]** → retain the human Rival playtest as the exact final gate and make no stronger status claim.
