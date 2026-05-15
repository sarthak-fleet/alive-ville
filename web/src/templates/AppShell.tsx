import { ActionBar } from "../organisms/ActionBar.tsx";
import { AppHeader } from "../organisms/AppHeader.tsx";
import { ErrorBoundary } from "../organisms/ErrorBoundary.tsx";
import { EventLog } from "../organisms/EventLog.tsx";
import { InventoryPanel } from "../organisms/InventoryPanel.tsx";
import { NpcDrawer } from "../organisms/NpcDrawer.tsx";
import { PhaserGame } from "../organisms/PhaserGame.tsx";
import { QuestList } from "../organisms/QuestList.tsx";
import { RelationshipsPanel } from "../organisms/RelationshipsPanel.tsx";
import { ReplayInspector } from "../organisms/ReplayInspector.tsx";
import { StoryPanel } from "../organisms/StoryPanel.tsx";

export function AppShell() {
  return (
    <div className="app-shell">
      <AppHeader />
      <main className="game-layout">
        <section id="map">
          <ErrorBoundary fallback={(error) => (
            <div className="banner error">Map failed: {error.message}</div>
          )}>
            <PhaserGame />
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
