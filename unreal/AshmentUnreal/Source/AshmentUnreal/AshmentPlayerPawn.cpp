#include "AshmentPlayerPawn.h"

#include "Camera/CameraComponent.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/SpringArmComponent.h"

AAshmentPlayerPawn::AAshmentPlayerPawn()
{
    PrimaryActorTick.bCanEverTick = true;

    Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
    SetRootComponent(Root);

    SpringArm = CreateDefaultSubobject<USpringArmComponent>(TEXT("SpringArm"));
    SpringArm->SetupAttachment(Root);
    SpringArm->TargetArmLength = 900.f;
    SpringArm->SetRelativeRotation(FRotator(-42.f, -36.f, 0.f));
    SpringArm->bDoCollisionTest = false;

    Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
    Camera->SetupAttachment(SpringArm);

    Movement = CreateDefaultSubobject<UFloatingPawnMovement>(TEXT("Movement"));
    Movement->MaxSpeed = 1600.f;
    Movement->Acceleration = 4200.f;
    Movement->Deceleration = 5200.f;

    AutoPossessPlayer = EAutoReceiveInput::Player0;
}

void AAshmentPlayerPawn::BeginPlay()
{
    Super::BeginPlay();
    SetActorLocation(FVector(3300.f, 2400.f, 1100.f));
}

void AAshmentPlayerPawn::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
    Super::SetupPlayerInputComponent(PlayerInputComponent);
    PlayerInputComponent->BindAxis(TEXT("MoveForward"), this, &AAshmentPlayerPawn::MoveForward);
    PlayerInputComponent->BindAxis(TEXT("MoveRight"), this, &AAshmentPlayerPawn::MoveRight);
    PlayerInputComponent->BindAxis(TEXT("MoveUp"), this, &AAshmentPlayerPawn::MoveUp);
    PlayerInputComponent->BindAxis(TEXT("Turn"), this, &AAshmentPlayerPawn::Turn);
    PlayerInputComponent->BindAxis(TEXT("LookUp"), this, &AAshmentPlayerPawn::LookUp);
}

void AAshmentPlayerPawn::MoveForward(float Value)
{
    if (!FMath::IsNearlyZero(Value)) AddMovementInput(GetActorForwardVector(), Value);
}

void AAshmentPlayerPawn::MoveRight(float Value)
{
    if (!FMath::IsNearlyZero(Value)) AddMovementInput(GetActorRightVector(), Value);
}

void AAshmentPlayerPawn::MoveUp(float Value)
{
    if (!FMath::IsNearlyZero(Value)) AddMovementInput(FVector::UpVector, Value);
}

void AAshmentPlayerPawn::Turn(float Value)
{
    if (!FMath::IsNearlyZero(Value)) AddControllerYawInput(Value);
}

void AAshmentPlayerPawn::LookUp(float Value)
{
    if (!FMath::IsNearlyZero(Value)) AddControllerPitchInput(Value);
}
