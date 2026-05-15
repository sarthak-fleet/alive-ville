import { useState } from "react";

import { Button } from "../atoms/Button.tsx";
import { RelationCell } from "../molecules/RelationCell.tsx";
import { useWorldStore } from "../store/world.ts";

export function NpcDrawer() {
  const world = useWorldStore((s) => s.world);
  const npcId = useWorldStore((s) => s.drawerNpcId);
  const close = useWorldStore((s) => s.closeDrawer);
  const send = useWorldStore((s) => s.send);
  const [text, setText] = useState("");

  if (!world || !npcId) return null;
  const npc = world.npcs.find((n) => n.id === npcId);
  if (!npc) return null;
  const items = world.items.filter((i) => i.holderId === npc.id);
  const playerInventory = world.items.filter((i) => i.holderId === "player");
  const giverQuests = (world.quests ?? []).filter((quest) => quest.giverId === npc.id);
  const openQuest = giverQuests.find((quest) => (quest.status ?? "open") === "open");
  const activeQuest = giverQuests.find((quest) => quest.status === "active");
  const relation = npc.relationships?.["player"] ?? 0;
  const latestMemory = npc.memories.at(-1)?.text ?? "They are watching the village and weighing what to say next.";
  const currentIntent = npc.plan?.currentIntent;
  const topAmbition = [...(npc.ambitions ?? [])]
    .filter((goal) => (goal.status ?? "active") === "active")
    .sort((a, b) => b.priority - a.priority)[0];

  const onTalk = async () => {
    if (!text.trim()) return;
    await send({ type: "talk", targetId: npc.id, text: text.trim() } as never);
    setText("");
  };
  const say = async (line: string) => {
    await send({ type: "talk", targetId: npc.id, text: line } as never);
  };
  const acceptQuest = async () => {
    if (!openQuest) return;
    await send({ type: "accept_quest", questId: openQuest.id } as never);
  };
  const give = async (itemId: string) => {
    await send({ type: "give", itemId, targetId: npc.id } as never);
  };

  return (
    <aside className="drawer dialogue-panel">
      <header className="dialogue-head">
        <span className="portrait">{npc.name[0]}</span>
        <div>
          <h2>{npc.name}</h2>
          <p>{relation > 0 ? "trusting" : relation < 0 ? "wary" : "neutral"} · {npc.locationId}</p>
        </div>
        <Button onClick={close} aria-label="Close">×</Button>
      </header>
      <section className="dialogue-body">
        <div className="agent-readout">
          <span>{npc.mood?.emotion ?? "focused"}</span>
          {currentIntent && <span>{currentIntent.kind}: {currentIntent.reason}</span>}
          {topAmbition && <span>Goal: {topAmbition.title}</span>}
        </div>
        <p className="dialogue-line">{latestMemory}</p>
        {openQuest && (
          <div className="dialogue-quest">
            <strong>{openQuest.title}</strong>
            {openQuest.description && <span>{openQuest.description}</span>}
            <Button onClick={acceptQuest}>Accept task</Button>
          </div>
        )}
        {activeQuest && (
          <div className="dialogue-quest active">
            <strong>{activeQuest.title}</strong>
            <span>{activeQuest.description}</span>
          </div>
        )}
        <div className="dialogue-choices">
          <Button onClick={() => void say(`What should I know about ${world.name} today?`)}>Ask about village</Button>
          {activeQuest && <Button onClick={() => void say(`I am working on "${activeQuest.title}". What matters most?`)}>Ask about task</Button>}
          {playerInventory.map((item) => (
            <Button key={item.id} onClick={() => void give(item.id)}>Give {item.name}</Button>
          ))}
        </div>
        <div className="row">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Say something"
            maxLength={140}
            onKeyDown={(e) => { if (e.key === "Enter") void onTalk(); }}
          />
          <Button onClick={onTalk}>Speak</Button>
        </div>
        <details className="dialogue-debug">
          <summary>Character notes</summary>
          <h3>Goals</h3>
          <ul>
            {(npc.goals ?? []).length === 0 ? (
              <li className="muted">(no goals)</li>
            ) : (
              npc.goals!.map((goal, i) => <li key={i}>{goal}</li>)
            )}
          </ul>
          <h3>Recent memories</h3>
          <ol>
            {npc.memories.slice(-5).reverse().map((memory, i) => (
              <li key={i}>t{memory.tick}: {memory.text}</li>
            ))}
            {npc.memories.length === 0 && <li className="muted">(no memories)</li>}
          </ol>
          <h3>Relationships</h3>
          <ul>
            {Object.entries(npc.relationships ?? {}).map(([id, score]) => (
              <li key={id}>{id}: <RelationCell score={score} /></li>
            ))}
            {Object.keys(npc.relationships ?? {}).length === 0 && <li className="muted">(no ties)</li>}
          </ul>
          <h3>Known secrets</h3>
          <ul>
            {(npc.secrets ?? []).length === 0 ? (
              <li className="muted">(none visible)</li>
            ) : (
              npc.secrets!.map((secret) => <li key={secret.id}>{secret.text}</li>)
            )}
          </ul>
          <h3>Carrying</h3>
          <ul>
            {items.length === 0 ? (
              <li className="muted">(empty hands)</li>
            ) : (
              items.map((item) => <li key={item.id}>{item.name}</li>)
            )}
          </ul>
        </details>
      </section>
    </aside>
  );
}
