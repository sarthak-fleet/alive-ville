#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "AshmentWorldClient.generated.h"

class UMaterialInterface;
class UStaticMesh;

UCLASS()
class ASHMENTUNREAL_API AAshmentWorldClient : public AActor
{
    GENERATED_BODY()

public:
    AAshmentWorldClient();

    UPROPERTY(EditAnywhere, Category = "Ashment")
    FString ServerBaseUrl = TEXT("http://127.0.0.1:5174");

    UPROPERTY(EditAnywhere, Category = "Ashment")
    float LocationHeightScale = 1.0f;

    UFUNCTION(BlueprintCallable, Category = "Ashment")
    void FetchState();

protected:
    virtual void BeginPlay() override;

private:
    UPROPERTY()
    TArray<AActor*> SpawnedActors;

    UPROPERTY()
    UStaticMesh* CubeMesh;

    UPROPERTY()
    UStaticMesh* SphereMesh;

    UPROPERTY()
    UStaticMesh* CylinderMesh;

    UPROPERTY()
    UMaterialInterface* BaseMaterial;

    void OnStateResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSucceeded);
    void RenderState(const TSharedPtr<FJsonObject>& Root);
    void ClearSpawned();
    AActor* SpawnPrimitive(UStaticMesh* Mesh, const FString& Name, const FVector& Location, const FVector& Scale, const FLinearColor& Color);
    void SpawnLabel(const FString& Text, const FVector& Location, float Size, const FLinearColor& Color);
    static FVector ReadVector(const TSharedPtr<FJsonObject>& Object);
    static FLinearColor ReadColor(const TSharedPtr<FJsonObject>& Object, const FLinearColor& Fallback);
};
