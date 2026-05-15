import { useRef, useState } from "react";

import { timeOfDay } from "../../../src/types.ts";
import { Badge } from "../atoms/Badge.tsx";
import { Button } from "../atoms/Button.tsx";
import { useWorldStore } from "../store/world.ts";

export function AppHeader() {
  const world = useWorldStore((s) => s.world);
  const send = useWorldStore((s) => s.send);
  const saveSnapshot = useWorldStore((s) => s.saveSnapshot);
  const restoreFromJson = useWorldStore((s) => s.restoreFromJson);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"" | "saving" | "loading">("");
  const [toast, setToast] = useState<string | null>(null);

  if (!world) return <header><h1>Ashbend Village</h1></header>;

  function flash(message: string): void {
    setToast(message);
    setTimeout(() => setToast(null), 2400);
  }

  async function handleSave(): Promise<void> {
    setBusy("saving");
    try {
      const snapshot = await saveSnapshot();
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `ashbend-day${snapshot.world.clock.day}-tick${snapshot.world.tick}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      flash("Saved.");
    } catch (err) {
      flash(`Save failed: ${(err as Error).message}`);
    } finally {
      setBusy("");
    }
  }

  function handleLoadClick(): void {
    fileInputRef.current?.click();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy("loading");
    try {
      const text = await file.text();
      await restoreFromJson(text);
      flash("Restored.");
    } catch (err) {
      flash(`Restore failed: ${(err as Error).message}`);
    } finally {
      setBusy("");
    }
  }

  const tod = timeOfDay(world.clock);
  return (
    <header>
      <h1>Ashbend Village</h1>
      <Badge>Day {world.clock.day} · {world.clock.hour.toString().padStart(2, "0")}:00 · {tod}</Badge>
      <span className="grow" />
      {toast && <span className="header-toast">{toast}</span>}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={(e) => void handleFile(e)}
        style={{ display: "none" }}
      />
      <Button onClick={() => void handleSave()} disabled={busy !== ""} title="Download a JSON save of the current world">
        {busy === "saving" ? "Saving…" : "Save"}
      </Button>
      <Button onClick={handleLoadClick} disabled={busy !== ""} title="Restore the world from a saved JSON file">
        {busy === "loading" ? "Loading…" : "Load"}
      </Button>
      <Button variant="primary" onClick={() => void send(null)}>Wait</Button>
    </header>
  );
}
