using UnrealBuildTool;
using System.Collections.Generic;

public class AshmentUnrealEditorTarget : TargetRules
{
    public AshmentUnrealEditorTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Editor;
        DefaultBuildSettings = BuildSettingsVersion.V5;
        IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_4;
        ExtraModuleNames.Add("AshmentUnreal");
    }
}
