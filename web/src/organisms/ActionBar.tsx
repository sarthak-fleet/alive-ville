import { useState } from "react";
import { Button } from "../atoms/Button.tsx";
import { Panel } from "../atoms/Panel.tsx";
import { useWorldStore } from "../store/world.ts";

export function ActionBar() {
  const world = useWorldStore((s) => s.world);
  const send = useWorldStore((s) => s.send);
  const [text, setText] = useState("");
  const [talkTarget, setTalkTarget] = useState("");
  const [giveItem, setGiveItem] = useState("");
  const [giveTarget, setGiveTarget] = useState("");

  if (!world) return null;
  const here = world.npcs.filter((n) => n.locationId === world.player.locationId);
  const inventory = world.items.filter((i) => i.holderId === "player");
  const talkOptions = here.length ? here : world.npcs;

  const onTalk = async () => {
    if (!text.trim()) return;
    const target = talkTarget || talkOptions[0]?.id;
    if (!target) return;
    await send({ type: "talk", targetId: target, text: text.trim() } as never);
    setText("");
  };

  const onGive = async () => {
    const item = giveItem || inventory[0]?.id;
    const target = giveTarget || here[0]?.id;
    if (!item || !target) return;
    await send({ type: "give", itemId: item, targetId: target } as never);
  };

  return (
    <Panel title="Player">
      <div className="row">
        <label>Talk to</label>
        <select value={talkTarget} onChange={(e) => setTalkTarget(e.target.value)}>
          {talkOptions.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Say something"
          maxLength={140}
          onKeyDown={(e) => { if (e.key === "Enter") void onTalk(); }}
        />
        <Button onClick={onTalk}>Speak</Button>
      </div>
      <div className="row">
        <label>Give</label>
        <select value={giveItem} onChange={(e) => setGiveItem(e.target.value)} disabled={!inventory.length}>
          {inventory.length
            ? inventory.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)
            : <option value="" disabled>(empty)</option>}
        </select>
        <select value={giveTarget} onChange={(e) => setGiveTarget(e.target.value)} disabled={!here.length}>
          {here.length
            ? here.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)
            : <option value="" disabled>(no one here)</option>}
        </select>
        <Button onClick={onGive} disabled={!inventory.length || !here.length}>Hand over</Button>
      </div>
      <div className="hint">Click any location on the map to walk. Click an NPC for memories.</div>
    </Panel>
  );
}
