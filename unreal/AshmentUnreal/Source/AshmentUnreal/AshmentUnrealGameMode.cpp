#include "AshmentUnrealGameMode.h"

#include "AshmentPlayerPawn.h"
#include "AshmentWorldClient.h"
#include "EngineUtils.h"

AAshmentUnrealGameMode::AAshmentUnrealGameMode()
{
    DefaultPawnClass = AAshmentPlayerPawn::StaticClass();
}

void AAshmentUnrealGameMode::BeginPlay()
{
    Super::BeginPlay();

    for (TActorIterator<AAshmentWorldClient> It(GetWorld()); It; ++It)
    {
        return;
    }

    GetWorld()->SpawnActor<AAshmentWorldClient>(AAshmentWorldClient::StaticClass(), FVector::ZeroVector, FRotator::ZeroRotator);
}
