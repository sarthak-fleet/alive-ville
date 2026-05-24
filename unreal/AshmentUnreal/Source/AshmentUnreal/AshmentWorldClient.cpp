#include "AshmentWorldClient.h"

#include "Components/StaticMeshComponent.h"
#include "Components/TextRenderComponent.h"
#include "Engine/StaticMeshActor.h"
#include "HttpModule.h"
#include "Interfaces/IHttpResponse.h"
#include "Json.h"
#include "Materials/MaterialInstanceDynamic.h"

AAshmentWorldClient::AAshmentWorldClient()
{
    PrimaryActorTick.bCanEverTick = false;

    CubeMesh = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube"));
    SphereMesh = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Sphere.Sphere"));
    CylinderMesh = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
    BaseMaterial = LoadObject<UMaterialInterface>(nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
}

void AAshmentWorldClient::BeginPlay()
{
    Super::BeginPlay();
    FetchState();
}

void AAshmentWorldClient::FetchState()
{
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
    FString BaseUrl = ServerBaseUrl;
    BaseUrl.RemoveFromEnd(TEXT("/"));
    const FString StateUrl = BaseUrl + TEXT("/api/unreal/state");
    UE_LOG(LogTemp, Display, TEXT("Ashment Unreal fetching bridge state from %s"), *StateUrl);
    Request->SetURL(StateUrl);
    Request->SetVerb(TEXT("GET"));
    Request->SetHeader(TEXT("Accept"), TEXT("application/json"));
    Request->OnProcessRequestComplete().BindUObject(this, &AAshmentWorldClient::OnStateResponse);
    Request->ProcessRequest();
}

void AAshmentWorldClient::OnStateResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSucceeded)
{
    if (!bSucceeded || !Response.IsValid() || Response->GetResponseCode() < 200 || Response->GetResponseCode() >= 300)
    {
        UE_LOG(LogTemp, Error, TEXT("Ashment Unreal state request failed: %s"), Response.IsValid() ? *Response->GetContentAsString() : TEXT("no response"));
        return;
    }

    TSharedPtr<FJsonObject> Root;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Response->GetContentAsString());
    if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid())
    {
        UE_LOG(LogTemp, Error, TEXT("Ashment Unreal state was not valid JSON."));
        return;
    }

    RenderState(Root);
}

void AAshmentWorldClient::RenderState(const TSharedPtr<FJsonObject>& Root)
{
    ClearSpawned();

    int32 LocationCount = 0;
    int32 ActorCount = 0;
    int32 ItemCount = 0;
    int32 PropCount = 0;
    int32 ObjectiveCount = 0;

    const TArray<TSharedPtr<FJsonValue>>* Locations = nullptr;
    if (Root->TryGetArrayField(TEXT("locations"), Locations))
    {
        for (const TSharedPtr<FJsonValue>& Value : *Locations)
        {
            const TSharedPtr<FJsonObject> Object = Value->AsObject();
            if (!Object.IsValid()) continue;

            const FVector Center = ReadVector(Object->GetObjectField(TEXT("center")));
            const FVector Size = ReadVector(Object->GetObjectField(TEXT("size")));
            const FLinearColor Ground = ReadColor(Object->GetObjectField(TEXT("groundColor")), FLinearColor(0.1f, 0.18f, 0.16f));
            const bool bActive = Object->GetBoolField(TEXT("active"));
            const FString Name = Object->GetStringField(TEXT("name"));
            const FVector Location(Center.X, Center.Y, Size.Z * 0.5f * LocationHeightScale);
            const FVector Scale(FMath::Max(Size.X / 100.f, 1.f), FMath::Max(Size.Y / 100.f, 1.f), FMath::Max(Size.Z / 100.f, 0.35f));

            SpawnPrimitive(CubeMesh, Name, Location, Scale, bActive ? Ground + FLinearColor(0.12f, 0.12f, 0.04f) : Ground);
            SpawnLabel(Name, FVector(Center.X, Center.Y, Size.Z + 140.f), bActive ? 42.f : 34.f, bActive ? FLinearColor(1.f, 0.84f, 0.18f) : FLinearColor(0.68f, 0.74f, 0.84f));
            ++LocationCount;
        }
    }

    const TArray<TSharedPtr<FJsonValue>>* Actors = nullptr;
    if (Root->TryGetArrayField(TEXT("actors"), Actors))
    {
        for (const TSharedPtr<FJsonValue>& Value : *Actors)
        {
            const TSharedPtr<FJsonObject> Object = Value->AsObject();
            if (!Object.IsValid()) continue;
            const FVector Position = ReadVector(Object->GetObjectField(TEXT("position")));
            const bool bPlayer = Object->GetBoolField(TEXT("player"));
            const bool bQuest = Object->GetBoolField(TEXT("quest"));
            const FString Name = Object->GetStringField(TEXT("name"));
            const FLinearColor Color = bPlayer ? FLinearColor(0.2f, 0.55f, 1.f) : bQuest ? FLinearColor(0.72f, 0.9f, 0.55f) : FLinearColor(0.95f, 0.45f, 0.32f);
            SpawnPrimitive(SphereMesh, Name, Position, FVector(0.82f), Color);
            SpawnLabel(Name, Position + FVector(0.f, 0.f, 110.f), bPlayer ? 30.f : 24.f, Color);
            ++ActorCount;
        }
    }

    const TArray<TSharedPtr<FJsonValue>>* Items = nullptr;
    if (Root->TryGetArrayField(TEXT("items"), Items))
    {
        for (const TSharedPtr<FJsonValue>& Value : *Items)
        {
            const TSharedPtr<FJsonObject> Object = Value->AsObject();
            if (!Object.IsValid()) continue;
            const FVector Position = ReadVector(Object->GetObjectField(TEXT("position")));
            const FLinearColor Color = ReadColor(Object->GetObjectField(TEXT("emissiveColor")), FLinearColor(1.f, 0.84f, 0.25f));
            SpawnPrimitive(CylinderMesh, Object->GetStringField(TEXT("name")), Position, FVector(0.34f, 0.34f, 0.2f), Color);
            ++ItemCount;
        }
    }

    const TArray<TSharedPtr<FJsonValue>>* Props = nullptr;
    if (Root->TryGetArrayField(TEXT("props"), Props))
    {
        for (const TSharedPtr<FJsonValue>& Value : *Props)
        {
            const TSharedPtr<FJsonObject> Object = Value->AsObject();
            if (!Object.IsValid()) continue;
            const FVector Position = ReadVector(Object->GetObjectField(TEXT("position")));
            SpawnPrimitive(CubeMesh, Object->GetStringField(TEXT("name")), Position, FVector(0.35f, 0.35f, 0.55f), FLinearColor(0.55f, 0.5f, 0.42f));
            ++PropCount;
        }
    }

    const TArray<TSharedPtr<FJsonValue>>* Objectives = nullptr;
    if (Root->TryGetArrayField(TEXT("objectives"), Objectives))
    {
        for (const TSharedPtr<FJsonValue>& Value : *Objectives)
        {
            const TSharedPtr<FJsonObject> Object = Value->AsObject();
            if (!Object.IsValid()) continue;
            const FVector Position = ReadVector(Object->GetObjectField(TEXT("position")));
            const bool bPrimary = Object->GetBoolField(TEXT("primary"));
            SpawnPrimitive(SphereMesh, Object->GetStringField(TEXT("questTitle")), Position + FVector(0.f, 0.f, 120.f), bPrimary ? FVector(0.42f) : FVector(0.28f), FLinearColor(1.f, 0.84f, 0.18f));
            SpawnLabel(Object->GetStringField(TEXT("actionLabel")), Position + FVector(0.f, 0.f, 205.f), bPrimary ? 30.f : 22.f, FLinearColor(1.f, 0.84f, 0.18f));
            ++ObjectiveCount;
        }
    }

    UE_LOG(
        LogTemp,
        Display,
        TEXT("Ashment Unreal rendered bridge state: %d locations, %d actors, %d items, %d props, %d objectives, %d spawned actors"),
        LocationCount,
        ActorCount,
        ItemCount,
        PropCount,
        ObjectiveCount,
        SpawnedActors.Num()
    );
}

void AAshmentWorldClient::ClearSpawned()
{
    for (AActor* Actor : SpawnedActors)
    {
        if (IsValid(Actor)) Actor->Destroy();
    }
    SpawnedActors.Reset();
}

AActor* AAshmentWorldClient::SpawnPrimitive(UStaticMesh* Mesh, const FString& Name, const FVector& Location, const FVector& Scale, const FLinearColor& Color)
{
    if (!Mesh) return nullptr;
    AStaticMeshActor* Actor = GetWorld()->SpawnActor<AStaticMeshActor>(Location, FRotator::ZeroRotator);
    if (!Actor) return nullptr;
#if WITH_EDITOR
    Actor->SetActorLabel(Name);
#endif
    UStaticMeshComponent* MeshComponent = Actor->GetStaticMeshComponent();
    MeshComponent->SetMobility(EComponentMobility::Movable);
    MeshComponent->SetStaticMesh(Mesh);
    MeshComponent->SetWorldScale3D(Scale);
    if (BaseMaterial)
    {
        UMaterialInstanceDynamic* Material = UMaterialInstanceDynamic::Create(BaseMaterial, Actor);
        Material->SetVectorParameterValue(TEXT("Color"), Color);
        MeshComponent->SetMaterial(0, Material);
    }
    SpawnedActors.Add(Actor);
    return Actor;
}

void AAshmentWorldClient::SpawnLabel(const FString& Text, const FVector& Location, float Size, const FLinearColor& Color)
{
    AActor* LabelActor = GetWorld()->SpawnActor<AActor>(Location, FRotator(60.f, 0.f, 0.f));
    if (!LabelActor) return;
    UTextRenderComponent* TextComponent = NewObject<UTextRenderComponent>(LabelActor);
    LabelActor->SetRootComponent(TextComponent);
    TextComponent->SetText(FText::FromString(Text));
    TextComponent->SetTextRenderColor(Color.ToFColor(true));
    TextComponent->SetHorizontalAlignment(EHTA_Center);
    TextComponent->SetWorldSize(Size);
    TextComponent->RegisterComponent();
    SpawnedActors.Add(LabelActor);
}

FVector AAshmentWorldClient::ReadVector(const TSharedPtr<FJsonObject>& Object)
{
    if (!Object.IsValid()) return FVector::ZeroVector;
    return FVector(
        static_cast<float>(Object->GetNumberField(TEXT("x"))),
        static_cast<float>(Object->GetNumberField(TEXT("y"))),
        static_cast<float>(Object->GetNumberField(TEXT("z")))
    );
}

FLinearColor AAshmentWorldClient::ReadColor(const TSharedPtr<FJsonObject>& Object, const FLinearColor& Fallback)
{
    if (!Object.IsValid()) return Fallback;
    const FString Hex = Object->GetStringField(TEXT("hex")).RightChop(1);
    if (Hex.Len() != 6) return Fallback;
    const int32 R = FParse::HexDigit(Hex[0]) * 16 + FParse::HexDigit(Hex[1]);
    const int32 G = FParse::HexDigit(Hex[2]) * 16 + FParse::HexDigit(Hex[3]);
    const int32 B = FParse::HexDigit(Hex[4]) * 16 + FParse::HexDigit(Hex[5]);
    return FLinearColor(R / 255.f, G / 255.f, B / 255.f, 1.f);
}
