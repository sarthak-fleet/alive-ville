#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "Navigation/PathFollowingComponent.h"
#include "AshmentStrategyUnit.generated.h"

class AAIController;
class USphereComponent;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnAshmentUnitMoveCompleted, AAshmentStrategyUnit*, Unit);

UCLASS()
class ASHMENTUNREAL_API AAshmentStrategyUnit : public ACharacter
{
    GENERATED_BODY()

public:
    AAshmentStrategyUnit();

    virtual void NotifyControllerChanged() override;

    UFUNCTION(BlueprintCallable, Category = "Ashment|Strategy")
    void StopMoving();

    UFUNCTION(BlueprintCallable, Category = "Ashment|Strategy")
    bool MoveToLocation(const FVector& Location, float AcceptanceRadius = 80.f);

    UPROPERTY(BlueprintAssignable, Category = "Ashment|Strategy")
    FOnAshmentUnitMoveCompleted OnMoveCompleted;

private:
    UPROPERTY(VisibleAnywhere, Category = "Components")
    TObjectPtr<USphereComponent> InteractionRange;

    UPROPERTY()
    TObjectPtr<AAIController> CachedAIController;

    void OnMoveFinished(FAIRequestID RequestID, const FPathFollowingResult& Result);
};
