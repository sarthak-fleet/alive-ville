#include "AshmentStrategyUnit.h"

#include "AIController.h"
#include "Components/SphereComponent.h"
#include "GameFramework/CharacterMovementComponent.h"

AAshmentStrategyUnit::AAshmentStrategyUnit()
{
    PrimaryActorTick.bCanEverTick = false;
    AutoPossessAI = EAutoPossessAI::PlacedInWorldOrSpawned;

    InteractionRange = CreateDefaultSubobject<USphereComponent>(TEXT("InteractionRange"));
    InteractionRange->SetupAttachment(RootComponent);
    InteractionRange->SetSphereRadius(120.f);
    InteractionRange->SetCollisionProfileName(TEXT("OverlapAllDynamic"));

    UCharacterMovementComponent* CharacterMovement = GetCharacterMovement();
    CharacterMovement->MaxAcceleration = 1200.f;
    CharacterMovement->BrakingFrictionFactor = 1.f;
    CharacterMovement->BrakingDecelerationWalking = 1200.f;
    CharacterMovement->bUseFlatBaseForFloorChecks = true;
    CharacterMovement->RotationRate = FRotator(0.f, 640.f, 0.f);
    CharacterMovement->bOrientRotationToMovement = true;
    CharacterMovement->bConstrainToPlane = true;
    CharacterMovement->bSnapToPlaneAtStart = true;
}

void AAshmentStrategyUnit::NotifyControllerChanged()
{
    Super::NotifyControllerChanged();

    CachedAIController = Cast<AAIController>(Controller);
    if (CachedAIController)
    {
        if (UPathFollowingComponent* PathFollowing = CachedAIController->GetPathFollowingComponent())
        {
            PathFollowing->OnRequestFinished.AddUObject(this, &AAshmentStrategyUnit::OnMoveFinished);
        }
    }
}

void AAshmentStrategyUnit::StopMoving()
{
    GetCharacterMovement()->StopMovementImmediately();
}

bool AAshmentStrategyUnit::MoveToLocation(const FVector& Location, float AcceptanceRadius)
{
    if (!CachedAIController)
    {
        CachedAIController = Cast<AAIController>(Controller);
    }

    if (!CachedAIController)
    {
        return false;
    }

    FAIMoveRequest MoveRequest;
    MoveRequest.SetGoalLocation(Location);
    MoveRequest.SetAcceptanceRadius(AcceptanceRadius);
    MoveRequest.SetAllowPartialPath(true);
    MoveRequest.SetUsePathfinding(true);
    MoveRequest.SetProjectGoalLocation(true);
    MoveRequest.SetRequireNavigableEndLocation(true);
    MoveRequest.SetNavigationFilter(CachedAIController->GetDefaultNavigationFilterClass());
    MoveRequest.SetCanStrafe(false);

    FNavPathSharedPtr FollowedPath;
    const FPathFollowingRequestResult Result = CachedAIController->MoveTo(MoveRequest, &FollowedPath);
    if (Result.Code == EPathFollowingRequestResult::AlreadyAtGoal)
    {
        OnMoveCompleted.Broadcast(this);
        return true;
    }

    return Result.Code == EPathFollowingRequestResult::RequestSuccessful;
}

void AAshmentStrategyUnit::OnMoveFinished(FAIRequestID RequestID, const FPathFollowingResult& Result)
{
    OnMoveCompleted.Broadcast(this);
}
