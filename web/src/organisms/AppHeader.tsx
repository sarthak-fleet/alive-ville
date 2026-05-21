import { useRef, useState } from "react";

import type { StoryPackage, StoryPackageIssue } from "../../../src/story-package.ts";
import { timeOfDay } from "../../../src/types.ts";
import { Badge } from "../atoms/Badge.tsx";
import { Button } from "../atoms/Button.tsx";
import type { QuickSaveSlot } from "../save-slots.ts";
import { describeQuickSlot, loadQuickSlot, saveQuickSlot } from "../save-slots.ts";
import { useWorldStore } from "../store/world.ts";

export function AppHeader() {
  const world = useWorldStore((s) => s.world);
  const send = useWorldStore((s) => s.send);
  const saveSnapshot = useWorldStore((s) => s.saveSnapshot);
  const exportStoryPackage = useWorldStore((s) => s.exportStoryPackage);
  const restoreFromJson = useWorldStore((s) => s.restoreFromJson);
  const importWorldSourceFromJson = useWorldStore((s) => s.importWorldSourceFromJson);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const worldSourceInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"" | "saving" | "loading">("");
  const [toast, setToast] = useState<string | null>(null);
  const [quickSlot, setQuickSlot] = useState<QuickSaveSlot | null>(() => initialQuickSlot());
  const [packageReview, setPackageReview] = useState<{ package: StoryPackage; issues: StoryPackageIssue[] } | null>(null);

  if (!world) return <header><h1>AI World Simulator</h1></header>;

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
      anchor.download = `${snapshot.world.id}-day${snapshot.world.clock.day}-tick${snapshot.world.tick}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      flash("Saved.");
    } catch (err) {
      flash(`Save failed: ${(err as Error).message}`);
    } finally {
      setBusy("");
    }
  }

  async function handleQuickSave(): Promise<void> {
    setBusy("saving");
    try {
      const snapshot = await saveSnapshot();
      const slot = saveQuickSlot(window.localStorage, snapshot);
      setQuickSlot(slot);
      flash(`Quick saved: ${describeQuickSlot(slot)}`);
    } catch (err) {
      flash(`Quick save failed: ${(err as Error).message}`);
    } finally {
      setBusy("");
    }
  }

  async function handleQuickLoad(): Promise<void> {
    setBusy("loading");
    try {
      const slot = loadQuickSlot(window.localStorage);
      if (!slot) {
        flash("No quick save.");
        return;
      }
      await restoreFromJson(JSON.stringify(slot.snapshot));
      setQuickSlot(slot);
      flash(`Quick loaded: ${describeQuickSlot(slot)}`);
    } catch (err) {
      flash(`Quick load failed: ${(err as Error).message}`);
    } finally {
      setBusy("");
    }
  }

  async function handleExportPackage(): Promise<void> {
    setBusy("saving");
    try {
      const result = await exportStoryPackage();
      const blob = new Blob([JSON.stringify(result.package, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${result.package.worldId}-${result.package.storyId}-package.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      flash(result.issues.length ? `Exported with ${result.issues.length} issue(s).` : "Package exported.");
    } catch (err) {
      flash(`Export failed: ${(err as Error).message}`);
    } finally {
      setBusy("");
    }
  }

  async function handleReviewPackage(): Promise<void> {
    setBusy("loading");
    try {
      const result = await exportStoryPackage();
      setPackageReview(result as { package: StoryPackage; issues: StoryPackageIssue[] });
      flash(result.issues.length ? `${result.issues.length} package issue(s).` : "Package healthy.");
    } catch (err) {
      flash(`Review failed: ${(err as Error).message}`);
    } finally {
      setBusy("");
    }
  }

  function handleLoadClick(): void {
    fileInputRef.current?.click();
  }

  function handleWorldSourceClick(): void {
    worldSourceInputRef.current?.click();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy("loading");
    try {
      const text = await file.text();
      await restoreFromJson(text);
      flash("Loaded.");
    } catch (err) {
      flash(`Restore failed: ${(err as Error).message}`);
    } finally {
      setBusy("");
    }
  }

  async function handleWorldSourceFile(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy("loading");
    try {
      const text = await file.text();
      await importWorldSourceFromJson(text);
      flash("World source imported.");
    } catch (err) {
      flash(`World import failed: ${(err as Error).message}`);
    } finally {
      setBusy("");
    }
  }

  const tod = timeOfDay(world.clock);
  return (
    <header>
      <h1>{world.name}</h1>
      <Badge>Day {world.clock.day} · {world.clock.hour.toString().padStart(2, "0")}:00 · {tod}</Badge>
      <span className="grow" />
      {toast && <span className="header-toast">{toast}</span>}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        aria-label="Save or package JSON"
        onChange={(e) => void handleFile(e)}
        style={{ display: "none" }}
      />
      <input
        ref={worldSourceInputRef}
        type="file"
        accept="application/json,.json"
        aria-label="World source JSON"
        onChange={(e) => void handleWorldSourceFile(e)}
        style={{ display: "none" }}
      />
      <div className="header-actions" aria-label="Header actions">
        <Button onClick={() => void handleSave()} disabled={busy !== ""} title="Download a JSON save of the current world">
          {busy === "saving" ? "Saving…" : "Save"}
        </Button>
        <Button onClick={() => void handleQuickSave()} disabled={busy !== ""} title="Save the current world into this browser">
          Slot Save
        </Button>
        <Button
          onClick={() => void handleQuickLoad()}
          disabled={busy !== "" || !quickSlot}
          title={quickSlot ? `Restore ${describeQuickSlot(quickSlot)}` : "No browser quick save yet"}
        >
          Slot Load
        </Button>
        <Button onClick={() => void handleExportPackage()} disabled={busy !== ""} title="Download an importable story package">
          Package
        </Button>
        <Button onClick={() => void handleReviewPackage()} disabled={busy !== ""} title="Inspect the current story package before importing or exporting">
          Review
        </Button>
        <Button onClick={handleWorldSourceClick} disabled={busy !== ""} title="Import a reviewed world-source JSON draft">
          World
        </Button>
        <Button onClick={handleLoadClick} disabled={busy !== ""} title="Restore the world from a saved JSON file">
          {busy === "loading" ? "Loading…" : "Load"}
        </Button>
        <Button variant="primary" onClick={() => void send(null)}>Wait</Button>
      </div>
      {packageReview && (
        <div className="package-review" role="dialog" aria-label="Story package review">
          <div>
            <strong>{packageReview.package.title}</strong>
            <button type="button" onClick={() => setPackageReview(null)} aria-label="Close package review">×</button>
          </div>
          <dl>
            <div><dt>Locations</dt><dd>{packageReview.package.world.locations.length}</dd></div>
            <div><dt>NPCs</dt><dd>{packageReview.package.world.npcs.length}</dd></div>
            <div><dt>Quests</dt><dd>{packageReview.package.world.quests.length}</dd></div>
            <div><dt>Props</dt><dd>{packageReview.package.world.interactables.length}</dd></div>
            <div><dt>Cutscenes</dt><dd>{packageReview.package.assets.cutscenes.length}</dd></div>
          </dl>
          {packageReview.issues.length > 0 ? (
            <ul>
              {packageReview.issues.slice(0, 5).map((issue) => (
                <li key={`${issue.path}:${issue.message}`}><b>{issue.path}</b>: {issue.message}</li>
              ))}
            </ul>
          ) : (
            <p>No structural issues found.</p>
          )}
        </div>
      )}
    </header>
  );
}

function initialQuickSlot(): QuickSaveSlot | null {
  if (typeof window === "undefined") return null;
  try {
    return loadQuickSlot(window.localStorage);
  } catch {
    return null;
  }
}
