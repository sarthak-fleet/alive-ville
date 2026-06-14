import { useState } from "react";

import { clipSupported, isRecording, startClip, stopClip } from "../platform/clip.ts";
import { defaultSaveName, opfsSupported, writeSave } from "../platform/opfs-save.ts";
import { useWorldStore } from "../store/world.ts";

/** Frontier utility chips: OPFS local save + canvas clip recording. */
export function PlatformControls(): React.ReactElement | null {
  const world = useWorldStore((state) => state.world);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [recording, setRecording] = useState(false);

  if (!world) return null;

  const save = async (): Promise<void> => {
    if (!opfsSupported() || saveState === "saving") return;
    setSaveState("saving");
    const meta = await writeSave(world, defaultSaveName(world)).catch(() => null);
    setSaveState(meta ? "saved" : "idle");
    if (meta) window.setTimeout(() => setSaveState("idle"), 2200);
  };

  const toggleRecord = (): void => {
    if (isRecording()) {
      stopClip();
      setRecording(false);
    } else if (startClip()) {
      setRecording(true);
    }
  };

  const savedLabel = saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : "Save game";

  return (
    <>
      {opfsSupported() ? (
        <button
          type="button"
          className={`chip ${saveState === "saved" ? "on" : ""}`}
          title="Save the full world to your browser — resume it from the start screen"
          disabled={saveState === "saving"}
          onClick={() => void save()}
        >
          💾 {savedLabel}
        </button>
      ) : null}
      {clipSupported() ? (
        <button
          type="button"
          className={`chip ${recording ? "on" : ""}`}
          title="Record the game canvas to a downloadable clip"
          onClick={toggleRecord}
        >
          {recording ? "⏺ Stop clip" : "🎬 Clip"}
        </button>
      ) : null}
    </>
  );
}
