## Why

Aliveville's Rival slice has a playable scenario and objective spine, but a new player still receives a static controls dump instead of being guided through the first move, conversation, fight, and visible consequence. The local readiness gate is also documented as failing, so the product cannot honestly reach its human fun-verdict gate until the first-minute path is implemented and the repository's automated checks are green.

## What Changes

- Replace the Rival slice's controls dump with a compact, state-driven first-minute guide that advances as the player moves, talks to the intended resident, enters combat, and observes a world consequence.
- Keep the active objective visible throughout the guide, with contextual control prompts and a way to dismiss the guide after the player demonstrates the core loop.
- Hold Rival world simulation pressure while the guide is active, then resume the normal autonomous loop when the player acknowledges completion.
- Preserve the lightweight one-time controls card for non-Rival worlds so this closure slice does not redesign unrelated experiences.
- Add deterministic tests for progression, persistence, and completion of the Rival guide.
- Reproduce and repair genuine local readiness failures, including the cited procedural identity checks, without restoring visual behavior that the current product intentionally removed.
- Leave the final "is it fun?" verdict and feel tuning to a human Rival playtest; no deploy is included.

## Capabilities

### New Capabilities

- `rival-guided-onboarding`: State-driven, first-session guidance for the Rival scenario's move → talk → fight → consequence loop.

### Modified Capabilities

None.

## Impact

- Affects the 3D HUD, UI/client world state observation, Rival-only agent-loop startup, focused onboarding and identity tests, and the durable Rival closure documentation.
- Does not change the simulation API, persistence format, world schema, production dependencies, deployment configuration, or the marketing site.
- The human playtest remains a required product gate after local acceptance passes.
