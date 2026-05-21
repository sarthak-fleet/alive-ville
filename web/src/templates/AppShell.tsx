import { lazy, Suspense, useState } from "react";

import { ActionBar } from "../organisms/ActionBar.tsx";
import { AmbienceToggle } from "../organisms/AmbienceToggle.tsx";
import { AppHeader } from "../organisms/AppHeader.tsx";
import { CutsceneList } from "../organisms/CutsceneList.tsx";
import { CutscenePlayer } from "../organisms/CutscenePlayer.tsx";
import { ErrorBoundary } from "../organisms/ErrorBoundary.tsx";
import { EventLog } from "../organisms/EventLog.tsx";
import { FightCinematicOverlay } from "../organisms/FightCinematicOverlay.tsx";
import { InventoryPanel } from "../organisms/InventoryPanel.tsx";
import { MusicToggle } from "../organisms/MusicToggle.tsx";
import { NpcDrawer } from "../organisms/NpcDrawer.tsx";
import { ObjectiveTracker } from "../organisms/ObjectiveTracker.tsx";
import { OutcomeToast } from "../organisms/OutcomeToast.tsx";
import { PhaserGame } from "../organisms/PhaserGame.tsx";
import { QuestList } from "../organisms/QuestList.tsx";
import { RelationshipsPanel } from "../organisms/RelationshipsPanel.tsx";
import { ReplayInspector } from "../organisms/ReplayInspector.tsx";
import { SoundToggle } from "../organisms/SoundToggle.tsx";
import { StoryPanel } from "../organisms/StoryPanel.tsx";

const ThreeWorld = lazy(async () => {
  const module = await import("../organisms/ThreeWorld.tsx");
  return { default: module.ThreeWorld };
});

export function AppShell() {
  const [viewMode, setViewMode] = useState<"2d" | "3d">("2d");

  return (
    <div className="app-shell">
      <AppHeader />
      <AmbienceToggle />
      <SoundToggle />
      <MusicToggle />
      <CutscenePlayer />
      <ObjectiveTracker />
      <FightCinematicOverlay />
      <OutcomeToast />
      <main className="game-layout">
        <section id="map">
          <div className="map-vignette" aria-hidden="true" />
          <div className="view-toggle" role="group" aria-label="World view">
            <button type="button" className={viewMode === "2d" ? "active" : ""} onClick={() => setViewMode("2d")}>2D</button>
            <button type="button" className={viewMode === "3d" ? "active" : ""} onClick={() => setViewMode("3d")}>3D</button>
          </div>
          <ErrorBoundary fallback={(error) => (
            <div className="banner error">Map failed: {error.message}</div>
          )}>
            {viewMode === "2d" ? (
              <PhaserGame />
            ) : (
              <Suspense fallback={<div className="three-host loading" aria-label="3D world loading" />}>
                <ThreeWorld />
              </Suspense>
            )}
          </ErrorBoundary>
          <div className="control-hint">WASD / arrows move · click to walk · click NPCs/items · E interact</div>
        </section>
        <aside className="hud-panel">
          <details className="journal-foldout story-foldout">
            <summary>Story</summary>
            <StoryPanel />
          </details>
          <details className="journal-foldout">
            <summary>Interact</summary>
            <ActionBar />
          </details>
          <details className="journal-foldout">
            <summary>Quests</summary>
            <QuestList />
          </details>
          <details className="journal-foldout">
            <summary>Scenes</summary>
            <CutsceneList />
          </details>
          <details className="journal-foldout">
            <summary>Pack</summary>
            <InventoryPanel />
          </details>
          <details className="journal-foldout">
            <summary>Activity</summary>
            <EventLog />
          </details>
          <details className="debug-foldout">
            <summary>Debug</summary>
            <ReplayInspector />
            <RelationshipsPanel />
          </details>
        </aside>
      </main>
      <NpcDrawer />
    </div>
  );
}
