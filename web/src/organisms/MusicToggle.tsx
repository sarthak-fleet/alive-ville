import { useEffect, useState } from "react";

import { isMusicEnabled, musicThemeName, setMusicEnabled, updateMusicMood } from "../audio.ts";
import { useWorldStore } from "../store/world.ts";

export function MusicToggle() {
  const world = useWorldStore((s) => s.world);
  const worldId = world?.id;
  const storyPhase = world?.storyProgress?.phase;
  const [enabled, setEnabled] = useState(isMusicEnabled());
  const theme = worldId ? musicThemeName(storyPhase ? { worldId, phase: storyPhase } : { worldId }) : "Music";

  useEffect(() => {
    if (!worldId) return;
    updateMusicMood(storyPhase ? { worldId, phase: storyPhase } : { worldId });
  }, [worldId, storyPhase]);

  function toggle(): void {
    if (!world) return;
    const next = !enabled;
    setEnabled(next);
    setMusicEnabled(next, world.storyProgress?.phase
      ? { worldId: world.id, phase: world.storyProgress.phase }
      : { worldId: world.id });
  }

  return (
    <button
      className={`music-toggle${enabled ? " active" : ""}`}
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      title={enabled ? `Music on: ${theme}` : `Music off: ${theme}`}
    >
      {enabled ? theme : "Music off"}
    </button>
  );
}
