#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "AshmentUnrealGameMode.generated.h"

UCLASS()
class ASHMENTUNREAL_API AAshmentUnrealGameMode : public AGameModeBase
{
    GENERATED_BODY()

public:
    AAshmentUnrealGameMode();

protected:
    virtual void BeginPlay() override;
};
