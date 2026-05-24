#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "AshmentStrategyPawn.generated.h"

class UCameraComponent;
class UFloatingPawnMovement;

UCLASS()
class ASHMENTUNREAL_API AAshmentStrategyPawn : public APawn
{
    GENERATED_BODY()

public:
    AAshmentStrategyPawn();

    virtual void BeginPlay() override;
    virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;

    UCameraComponent* GetCamera() const { return Camera; }

private:
    UPROPERTY(EditAnywhere, Category = "Camera")
    FVector InitialWorldCenter = FVector(3300.f, 2400.f, 0.f);

    UPROPERTY(VisibleAnywhere, Category = "Components")
    TObjectPtr<USceneComponent> Root;

    UPROPERTY(VisibleAnywhere, Category = "Components")
    TObjectPtr<UCameraComponent> Camera;

    UPROPERTY(VisibleAnywhere, Category = "Components")
    TObjectPtr<UFloatingPawnMovement> Movement;

    UPROPERTY(EditAnywhere, Category = "Camera")
    float MinZoom = 2600.f;

    UPROPERTY(EditAnywhere, Category = "Camera")
    float MaxZoom = 9200.f;

    UPROPERTY(EditAnywhere, Category = "Camera")
    float ZoomStep = 380.f;

    void MoveForward(float Value);
    void MoveRight(float Value);
    void Zoom(float Value);
};
