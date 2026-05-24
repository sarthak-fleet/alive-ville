using UnrealBuildTool;

public class AshmentUnreal : ModuleRules
{
    public AshmentUnreal(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        PublicDependencyModuleNames.AddRange(new[]
        {
            "Core",
            "CoreUObject",
            "Engine",
            "InputCore",
            "AIModule",
            "NavigationSystem",
            "HTTP",
            "Json",
            "JsonUtilities"
        });
    }
}
