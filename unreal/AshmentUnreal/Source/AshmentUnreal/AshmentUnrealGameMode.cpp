#include "AshmentUnrealGameMode.h"

#include "AshmentStrategyPawn.h"
#include "AshmentWorldClient.h"
#include "EngineUtils.h"

AAshmentUnrealGameMode::AAshmentUnrealGameMode()
{
    DefaultPawnClass = AAshmentStrategyPawn::StaticClass();
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
