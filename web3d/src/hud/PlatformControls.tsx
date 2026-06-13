import { useEffect, useState } from "react";

import { clipSupported, isRecording, startClip, stopClip } from "../platform/clip.ts";
import { loadSession, opfsSupported, saveSession } from "../platform/opfs-save.ts";
import { vrSupported, xrStore } from "../platform/xr.ts";
import { useWorldStore } from "../store/world.ts";

/** Frontier utility chips: OPFS local save + canvas clip recording. */
export function PlatformControls(): React.ReactElement | null {
  const world = useWorldStore((state) => state.world);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [vrOk, setVrOk] = useState(false);

  useEffect(() => {
    if (!opfsSupported()) return;
    void (async () => {
      const snapshot = await loadSession();
      if (snapshot) setSavedAt(snapshot.savedAt);
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      setVrOk(await vrSupported());
    })();
  }, []);

  if (!world) return null;

  const save = async (): Promise<void> => {
    if (!opfsSupported()) return;
    const now = new Date().toISOString();
    await saveSession({
      worldId: world.id,
      savedAt: now,
      playerName: world.player.name ?? "Wanderer",
      locationId: world.player.locationId,
      level: world.player.growth?.level ?? 1,
    });
    setSavedAt(now);
  };

  const toggleRecord = (): void => {
    if (isRecording()) {
      stopClip();
      setRecording(false);
    } else if (startClip()) {
      setRecording(true);
    }
  };

  const savedLabel = savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString()}` : "Save (OPFS)";

  return (
    <>
      {opfsSupported() ? (
        <button type="button" className="chip" title="Persist a local session snapshot to OPFS" onClick={() => void save()}>
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
      {vrOk ? (
        <button type="button" className="chip" title="Enter the town in VR (WebXR)" onClick={() => void xrStore.enterVR()}>
          🥽 VR
        </button>
      ) : null}
    </>
  );
}
