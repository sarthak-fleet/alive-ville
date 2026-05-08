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

  const onTalk = async () => {
    if (!text.trim()) return;
    await send({ type: "talk", targetId: npc.id, text: text.trim() } as never);
    setText("");
  };

  return (
    <aside className="drawer">
      <header>
        <span className="portrait">{npc.name[0]}</span>
        <h2>{npc.name}</h2>
        <Button onClick={close} aria-label="Close">×</Button>
      </header>
      <section>
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
        <h3>Carrying</h3>
        <ul>
          {items.length === 0 ? (
            <li className="muted">(empty hands)</li>
          ) : (
            items.map((item) => <li key={item.id}>{item.name}</li>)
          )}
        </ul>
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
      </section>
    </aside>
  );
}
