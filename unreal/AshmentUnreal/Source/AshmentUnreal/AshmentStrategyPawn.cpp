#include "AshmentStrategyPawn.h"

#include "Camera/CameraComponent.h"
#include "GameFramework/FloatingPawnMovement.h"

AAshmentStrategyPawn::AAshmentStrategyPawn()
{
    PrimaryActorTick.bCanEverTick = false;

    Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
    SetRootComponent(Root);

    Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
    Camera->SetupAttachment(Root);
    Camera->SetRelativeLocation(FVector(0.f, 0.f, 3200.f));
    Camera->SetRelativeRotation(FRotator(-90.f, 0.f, 0.f));
    Camera->ProjectionMode = ECameraProjectionMode::Orthographic;
    Camera->OrthoWidth = 5600.f;
    Camera->AutoPlaneShift = 1.f;
    Camera->bUpdateOrthoPlanes = false;

    Movement = CreateDefaultSubobject<UFloatingPawnMovement>(TEXT("Movement"));
    Movement->MaxSpeed = 2600.f;
    Movement->Acceleration = 6200.f;
    Movement->Deceleration = 7200.f;
    Movement->bConstrainToPlane = true;
    Movement->SetPlaneConstraintNormal(FVector::UpVector);
    Movement->SetPlaneConstraintOrigin(FVector::ZeroVector);

    AutoPossessPlayer = EAutoReceiveInput::Player0;
}

void AAshmentStrategyPawn::BeginPlay()
{
    Super::BeginPlay();
    SetActorLocation(InitialWorldCenter);
}

void AAshmentStrategyPawn::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
    Super::SetupPlayerInputComponent(PlayerInputComponent);
    PlayerInputComponent->BindAxis(TEXT("MoveForward"), this, &AAshmentStrategyPawn::MoveForward);
    PlayerInputComponent->BindAxis(TEXT("MoveRight"), this, &AAshmentStrategyPawn::MoveRight);
    PlayerInputComponent->BindAxis(TEXT("MoveUp"), this, &AAshmentStrategyPawn::Zoom);
}

void AAshmentStrategyPawn::MoveForward(float Value)
{
    if (!FMath::IsNearlyZero(Value))
    {
        AddMovementInput(FVector::XAxisVector, Value);
    }
}

void AAshmentStrategyPawn::MoveRight(float Value)
{
    if (!FMath::IsNearlyZero(Value))
    {
        AddMovementInput(FVector::YAxisVector, Value);
    }
}

void AAshmentStrategyPawn::Zoom(float Value)
{
    if (!FMath::IsNearlyZero(Value))
    {
        Camera->SetOrthoWidth(FMath::Clamp(Camera->OrthoWidth - (Value * ZoomStep), MinZoom, MaxZoom));
    }
}
