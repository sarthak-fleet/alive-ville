import { ActionBar } from "../organisms/ActionBar.tsx";
import { AppHeader } from "../organisms/AppHeader.tsx";
import { EventLog } from "../organisms/EventLog.tsx";
import { InventoryPanel } from "../organisms/InventoryPanel.tsx";
import { NpcDrawer } from "../organisms/NpcDrawer.tsx";
import { PhaserGame } from "../organisms/PhaserGame.tsx";
import { QuestList } from "../organisms/QuestList.tsx";
import { RelationshipsPanel } from "../organisms/RelationshipsPanel.tsx";
import { ReplayInspector } from "../organisms/ReplayInspector.tsx";

export function AppShell() {
  return (
    <>
      <AppHeader />
      <main>
        <section id="map">
          <PhaserGame />
        </section>
        <aside>
          <ActionBar />
          <InventoryPanel />
          <QuestList />
          <EventLog />
          <ReplayInspector />
          <RelationshipsPanel />
        </aside>
      </main>
      <NpcDrawer />
    </>
  );
}
