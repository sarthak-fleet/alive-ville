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
  const doneQuest = giverQuests.find((quest) => quest.status === "done");
  const relation = npc.relationships?.["player"] ?? 0;
  const playerAxes = npc.relationshipAxes?.["player"];
  const latestMemory = npc.memories.at(-1)?.text ?? "They are watching the village and weighing what to say next.";
  const currentIntent = npc.plan?.currentIntent;
  const topAmbition = [...(npc.ambitions ?? [])]
    .filter((goal) => (goal.status ?? "active") === "active")
    .sort((a, b) => b.priority - a.priority)[0];
  const questLine = questDialogueLine(npc.id, openQuest?.id ?? activeQuest?.id ?? doneQuest?.id, {
    open: Boolean(openQuest),
    active: Boolean(activeQuest),
    done: Boolean(doneQuest),
    hasRelevantItem: playerInventory.some((item) => item.id === relevantQuestItemId(activeQuest?.id)),
  });
  const clueLine = questClueLine(activeQuest?.id ?? openQuest?.id);
  const relevantGiveItem = playerInventory.find((item) => item.id === relevantQuestItemId(activeQuest?.id));

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
        {playerAxes && (
          <div className="relationship-readout">
            <span>trust {playerAxes.trust ?? 0}</span>
            <span>suspicion {playerAxes.suspicion ?? 0}</span>
            <span>fear {playerAxes.fear ?? 0}</span>
            <span>respect {playerAxes.respect ?? 0}</span>
          </div>
        )}
        <p className="dialogue-line">{questLine ?? latestMemory}</p>
        {openQuest && (
          <div className="dialogue-quest">
            <strong>{openQuest.title}</strong>
            {openQuest.description && <span>{openQuest.description}</span>}
            <div className="dialogue-actions">
              <Button onClick={acceptQuest} variant="primary">Accept task</Button>
              {clueLine && <Button onClick={() => void say(clueLine)}>Ask for clue</Button>}
            </div>
          </div>
        )}
        {activeQuest && (
          <div className="dialogue-quest active">
            <strong>{activeQuest.title}</strong>
            <span>{activeQuest.description}</span>
            <div className="dialogue-actions">
              {clueLine && <Button onClick={() => void say(clueLine)}>Ask for clue</Button>}
              {relevantGiveItem && <Button onClick={() => void give(relevantGiveItem.id)} variant="primary">Complete: Give {relevantGiveItem.name}</Button>}
            </div>
          </div>
        )}
        {doneQuest && !activeQuest && !openQuest && (
          <div className="dialogue-quest done">
            <strong>{doneQuest.title}</strong>
            <span>{npc.name} will remember that you followed through.</span>
          </div>
        )}
        <div className="dialogue-choices">
          <Button onClick={() => void say(`What should I know about ${world.name} today?`)}>Ask about village</Button>
          {activeQuest && <Button onClick={() => void say(`I am working on "${activeQuest.title}". What matters most?`)}>Ask about task</Button>}
          <Button onClick={() => void say("I want to help and keep people safe. What do you trust me with?")}>Build trust</Button>
          <Button onClick={() => void say("Sorry if I pushed too hard. I am trying to understand before blaming anyone.")}>Apologize</Button>
          <Button onClick={() => void send({ type: "confront", targetId: npc.id, text: "You are hiding something about the bridge, and people could get hurt." } as never)}>
            Confront
          </Button>
          {playerInventory.filter((item) => item.id !== relevantGiveItem?.id).map((item) => (
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

function relevantQuestItemId(questId: string | undefined): string | null {
  if (questId === "return_shears") return "shears";
  if (questId === "rekindle_forge") return "bellows_leather";
  if (questId === "bridge_whisper") return "blue_ember";
  return null;
}

function questDialogueLine(
  npcId: string,
  questId: string | undefined,
  state: { open: boolean; active: boolean; done: boolean; hasRelevantItem: boolean }
): string | null {
  if (!questId) return null;
  if (state.done) return "You did what you said you would. That matters in Ashbend.";
  if (state.hasRelevantItem) return "You have what we needed. Hand it over and we can move this forward.";
  if (questId === "return_shears" && npcId === "mira") {
    return state.open
      ? "My moonmint is curling by the hour. Tomas had my shears last, and I need them back before dusk."
      : "Start at the forge. If Tomas left the shears there, bring them straight back to the garden.";
  }
  if (questId === "rekindle_forge" && npcId === "tomas") {
    return state.open
      ? "The forge will not breathe without dry bellows leather. Hollow Wood still has old hides if the damp has not ruined them."
      : "Bring me dry bellows leather. If the forge catches, we test whether the bridge goes quiet.";
  }
  if (questId === "bridge_whisper" && npcId === "lena") {
    return state.open
      ? "I need proof before I bar the bridge. Find the note or the blue ember near the crossing."
      : "The bridge is the clue site. Bring me proof, not another rumor.";
  }
  return null;
}

function questClueLine(questId: string | undefined): string | null {
  if (questId === "return_shears") return "The forge bench is the first place to check for the shears.";
  if (questId === "rekindle_forge") return "Hollow Wood is where dry bellows leather is most likely to survive.";
  if (questId === "bridge_whisper") return "Search the Old Bridge for physical proof: a note or the cold blue ember.";
  return null;
}
