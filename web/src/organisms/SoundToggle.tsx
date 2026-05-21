import { useState } from "react";

import { isSoundEnabled, setSoundEnabled } from "../audio.ts";

export function SoundToggle() {
  const [enabled, setEnabled] = useState(isSoundEnabled());

  function toggle(): void {
    const next = !enabled;
    setEnabled(next);
    setSoundEnabled(next);
  }

  return (
    <button
      className={`sound-toggle${enabled ? " active" : ""}`}
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      title={enabled ? "Sound cues on" : "Sound cues off"}
    >
      {enabled ? "SFX on" : "SFX off"}
    </button>
  );
}
