# Sample Base Notes

The final Unreal client should be sample-first, not blank-project-first. Cropout remains the preferred target once it is installed through Fab/Epic Launcher because it is a complete top-down Casual RTS sample with mobile/PC packaging, Common UI, Enhanced Input, Behavior Trees, EQS, Save/Load, Blueprint interfaces, and Unreal-only project asset use called out by Epic.

Fab listing: https://www.fab.com/listings/bd733d81-7c29-44fe-b53f-65b14d06a9e2

License caution: the listing marks the content as UE-only and says "Allows usage with AI: No." Treat that as safe for an Unreal-based sample study/project base, but do not use Cropout assets for AI training, image/model generation, or non-Unreal exports without an explicit license review.

## Interim Base Already Available

UE 5.7 ships an installed TopDown template at:

```text
/Users/Shared/Epic Games/UE_5.7/Templates/TP_TopDown
```

Useful local reference files:

- `Source/TP_TopDown/Variant_Strategy/StrategyPawn.*`: orthographic strategy camera pattern.
- `Source/TP_TopDown/Variant_Strategy/StrategyUnit.*`: AI-controlled unit movement pattern.
- `Source/TP_TopDown/Variant_Strategy/StrategyPlayerController.*`: selection and interaction flow.
- `Content/Variant_Strategy/LVL_Strategy.umap`: playable strategy variant map.

## Current Port

- `AshmentStrategyPawn` ports the orthographic camera and constrained XY movement pattern into the Ashment module.
- `AshmentStrategyUnit` ports the AI move-request shape into an Ashment-owned class for bridge-driven agents.
- `AshmentUnrealGameMode` now defaults to the top-down strategy pawn instead of the legacy free-fly debug pawn.

## Next Port Slice

1. Replace actor debug spheres in `AshmentWorldClient` with `AshmentStrategyUnit` instances.
2. Add a generated or authored navigation floor so `MoveToLocation` works in the runtime bridge map.
3. Port the TopDown strategy controller selection loop, then map click targets to `POST /api/unreal/action`.
4. Once Cropout is downloaded, compare its interaction/UI/plugin structure against this scaffold and migrate the bridge into the stronger base.
