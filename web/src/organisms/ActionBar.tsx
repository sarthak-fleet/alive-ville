import { useState } from "react";

import { combatMovesFor } from "../../../src/combat.ts";
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
  const [fightMoveId, setFightMoveId] = useState("normal_punch");
  const [characterId, setCharacterId] = useState("");
  const [travelTarget, setTravelTarget] = useState("");

  if (!world) return null;
  const playable = world.npcs.filter((npc) => npc.appearance);
  const chosenCharacterId = characterId || world.player.characterId || playable[0]?.id || "";
  const selectedCharacter = playable.find((npc) => npc.id === chosenCharacterId);
  const here = world.npcs.filter((n) => n.locationId === world.player.locationId && n.id !== world.player.characterId);
  const inventory = world.items.filter((i) => i.holderId === "player");
  const talkOptions = here.length ? here : world.npcs.filter((npc) => npc.id !== world.player.characterId);
  const combatMoves = combatMovesFor(world);
  const selectedMove = combatMoves.find((move) => move.id === fightMoveId) ?? combatMoves[0]!;
  const hostileHere = here.find((npc) => (npc.factionId === "challengers" || npc.id === "pax") && !npc.combat?.defeated);
  const propsHere = world.interactables?.filter((prop) => prop.locationId === world.player.locationId) ?? [];
  const exitsHere = (world.exits ?? []).filter((exit) => exit.from === world.player.locationId || (exit.bidirectional && exit.to === world.player.locationId));
  const adjacentLocations = exitsHere
    .map((exit) => exit.from === world.player.locationId ? exit.to : exit.from)
    .map((locationId) => world.locations.find((location) => location.id === locationId))
    .filter((location): location is NonNullable<typeof location> => Boolean(location));
  const selectedTravelId = travelTarget || adjacentLocations[0]?.id || "";

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

  const onFight = async () => {
    const target = hostileHere;
    if (!target) return;
    await send({
      type: "fight",
      targetId: target.id,
      moveId: selectedMove.id,
      text: `${selectedMove.label}: ${selectedMove.description}`,
    } as never);
  };

  const onInspect = async () => {
    const prop = propsHere.find((candidate) => !candidate.inspected) ?? propsHere[0];
    if (!prop) return;
    await send({ type: "inspect", propId: prop.id } as never);
  };

  const onWait = async () => {
    await send(null);
  };

  const onTravel = async () => {
    const target = selectedTravelId;
    if (!target) return;
    await send({ type: "move", locationId: target } as never);
    setTravelTarget("");
  };

  const onChooseCharacter = async () => {
    if (!selectedCharacter) return;
    await send({ type: "choose_character", targetId: selectedCharacter.id } as never);
  };

  return (
    <Panel title="Player">
      <div className="row">
        <label>Play as</label>
        <select value={chosenCharacterId} onChange={(event) => setCharacterId(event.target.value)}>
          {playable.map((npc) => <option key={npc.id} value={npc.id}>{npc.name}</option>)}
        </select>
        <span className="hint">{world.player.name ?? "New Hero"}</span>
        <Button onClick={onChooseCharacter} disabled={!selectedCharacter || selectedCharacter.id === world.player.characterId}>Choose</Button>
      </div>
      <div className="row">
        <label>Time</label>
        <span className="hint">Day {world.clock.day}, {String(world.clock.hour).padStart(2, "0")}:00</span>
        <Button onClick={onWait}>Wait</Button>
      </div>
      <div className="row">
        <label>Travel</label>
        <select value={selectedTravelId} onChange={(e) => setTravelTarget(e.target.value)} disabled={!adjacentLocations.length}>
          {adjacentLocations.length
            ? adjacentLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)
            : <option value="" disabled>(no exits)</option>}
        </select>
        <Button onClick={onTravel} disabled={!adjacentLocations.length}>Go</Button>
      </div>
      <div className="row">
        <label>Inspect</label>
        <span className="hint">{propsHere.length ? propsHere.map((prop) => prop.name).join(", ") : "No clue prop here."}</span>
        <Button onClick={onInspect} disabled={!propsHere.length}>Inspect</Button>
      </div>
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
      <div className="row">
        <label>Fight</label>
        <select value={selectedMove.id} onChange={(event) => setFightMoveId(event.target.value)} disabled={!hostileHere}>
          {combatMoves.map((move) => <option key={move.id} value={move.id}>{move.label}</option>)}
        </select>
        <span className="hint">
          {hostileHere
            ? `${hostileHere.name}: ${hostileHere.combat?.hp ?? 100}/${hostileHere.combat?.maxHp ?? 100} HP · ${selectedMove.description}`
            : "No hostile target here."}
        </span>
        <Button onClick={onFight} disabled={!hostileHere}>Use move</Button>
      </div>
      <div className="hint">Click any location on the map to walk. Click an NPC for memories.</div>
    </Panel>
  );
}
