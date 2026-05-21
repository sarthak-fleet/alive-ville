import { useState } from "react";

import { retrieveRelevantMemories, scheduledBlockFor } from "../../../src/agents.ts";
import { combatMovesFor } from "../../../src/combat.ts";
import type { Npc, Quest, World } from "../../../src/types.ts";
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
  const scheduleBlock = scheduledBlockFor(world, npc);
  const topAmbition = [...(npc.ambitions ?? [])]
    .filter((goal) => (goal.status ?? "active") === "active")
    .sort((a, b) => b.priority - a.priority)[0];
  const questLine = questDialogueLine(world.id, npc.id, openQuest?.id ?? activeQuest?.id ?? doneQuest?.id, {
    open: Boolean(openQuest),
    active: Boolean(activeQuest),
    done: Boolean(doneQuest),
    hasRelevantItem: playerInventory.some((item) => relevantQuestItemIds(activeQuest?.id).includes(item.id)),
  });
  const clueLine = questClueLine(world.id, activeQuest?.id ?? openQuest?.id);
  const relevantGiveItems = playerInventory.filter((item) => relevantQuestItemIds(activeQuest?.id).includes(item.id));
  const doneAftermath = doneQuest ? questAftermathLine(world, npc, doneQuest) : null;
  const canFight = world.player.locationId === npc.locationId && (npc.factionId === "challengers" || npc.id === "pax");
  const combatMoves = combatMovesFor(world);
  const combat = npc.combat;
  const memoryQuery = [activeQuest?.title, openQuest?.title, world.story?.currentObjective, currentIntent?.reason].filter(Boolean).join(" ");
  const relevantMemories = retrieveRelevantMemories(world, npc.id, memoryQuery || "bridge village task", 2);
  const appearance = npc.appearance;
  const portraitColor = appearance?.palette?.[0] ?? (npc.tier === "quest" ? "#b5e48c" : "#ff8a65");
  const locationName = world.locations.find((location) => location.id === npc.locationId)?.name ?? npc.locationId;

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
  const fight = async (moveId: string) => {
    const move = combatMoves.find((candidate) => candidate.id === moveId) ?? combatMoves[0]!;
    await send({
      type: "fight",
      targetId: npc.id,
      moveId: move.id,
      text: `${move.label}: ${move.description}`,
    } as never);
  };

  return (
    <aside className="drawer dialogue-panel">
      <header className="dialogue-head">
        <span className="portrait" style={{ background: portraitColor }}>
          {appearance?.portrait ? <img src={appearance.portrait} alt="" /> : npc.name[0]}
        </span>
        <div>
          <h2>{npc.name}</h2>
          <p>{relation > 0 ? "trusting" : relation < 0 ? "wary" : "neutral"} · {locationName}</p>
        </div>
        <Button onClick={close} aria-label="Close">×</Button>
      </header>
      <section className="dialogue-body">
        <div className="agent-readout">
          <span>{npc.mood?.emotion ?? "focused"}</span>
          {appearance?.sourceLook && <span>Look: {appearance.sourceLook}</span>}
          {currentIntent && <span>{currentIntent.kind}: {currentIntent.reason}</span>}
          {scheduleBlock && <span>Now: {scheduleBlock.intent}</span>}
          {npc.plan?.nextActionHint && <span>Next: {npc.plan.nextActionHint}</span>}
          {topAmbition && <span>Goal: {topAmbition.title}</span>}
        </div>
        {appearance && (
          <div className="appearance-readout">
            {appearance.silhouette && <p>{appearance.silhouette}</p>}
            {appearance.hair && <span>Hair: {appearance.hair}</span>}
            {appearance.outfit && <span>Outfit: {appearance.outfit}</span>}
            {appearance.visualTags?.length ? <span>Tags: {appearance.visualTags.join(", ")}</span> : null}
          </div>
        )}
        {playerAxes && (
          <div className="relationship-readout">
            <span>trust {playerAxes.trust ?? 0}</span>
            <span>suspicion {playerAxes.suspicion ?? 0}</span>
            <span>fear {playerAxes.fear ?? 0}</span>
            <span>respect {playerAxes.respect ?? 0}</span>
          </div>
        )}
        {combat && (
          <div className={`combat-readout${combat.defeated ? " defeated" : ""}`}>
            <span>{combat.defeated ? "Defeated" : "Combat"}</span>
            <strong>{combat.hp}/{combat.maxHp} HP</strong>
            <div className="combat-meter" aria-label={`${npc.name} HP ${combat.hp} of ${combat.maxHp}`}>
              <i style={{ width: `${Math.max(0, Math.min(100, (combat.hp / combat.maxHp) * 100))}%` }} />
            </div>
            <small>Posture {combat.posture}/100</small>
          </div>
        )}
        <p className="dialogue-line">{questLine ?? latestMemory}</p>
        {relevantMemories.length > 0 && (
          <div className="memory-readout">
            <span>Relevant memory</span>
            {relevantMemories.map((memory) => (
              <p key={`${memory.tick}-${memory.text}`}>{memory.text}</p>
            ))}
          </div>
        )}
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
              {relevantGiveItems.map((item) => (
                <Button key={item.id} onClick={() => void give(item.id)} variant="primary">Complete: Give {item.name}</Button>
              ))}
            </div>
          </div>
        )}
        {doneQuest && !activeQuest && !openQuest && (
          <div className="dialogue-quest done">
            <strong>{doneQuest.title}</strong>
            <span>{doneAftermath}</span>
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
          {playerInventory.filter((item) => !relevantGiveItems.some((relevant) => relevant.id === item.id)).map((item) => (
            <Button key={item.id} onClick={() => void give(item.id)}>Give {item.name}</Button>
          ))}
        </div>
        {canFight && !combat?.defeated && (
          <div className="dialogue-quest combat">
            <strong>Combat moves</strong>
            <span>Pick a move. Non-finishers weaken HP and posture; finishers close the encounter.</span>
            <div className="dialogue-actions">
              {combatMoves.map((move) => (
                <Button key={move.id} onClick={() => void fight(move.id)} variant={move.style === "finisher" ? "primary" : "default"}>
                  {move.label} · {move.damage}
                </Button>
              ))}
            </div>
          </div>
        )}
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

function relevantQuestItemIds(questId: string | undefined): string[] {
  if (questId === "return_shears") return ["shears"];
  if (questId === "rekindle_forge") return ["bellows_leather"];
  if (questId === "bridge_whisper") return ["blue_ember", "rumor_note"];
  return [];
}

function questDialogueLine(
  worldId: string,
  npcId: string,
  questId: string | undefined,
  state: { open: boolean; active: boolean; done: boolean; hasRelevantItem: boolean }
): string | null {
  if (!questId) return null;
  if (worldId === "opm_z_city") return opmQuestDialogueLine(npcId, questId, state);
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

function opmQuestDialogueLine(
  npcId: string,
  questId: string,
  state: { open: boolean; active: boolean; done: boolean; hasRelevantItem: boolean }
): string | null {
  if (state.done) return "You handled the patrol cleanly. That is rare enough to remember.";
  if (state.hasRelevantItem) return "You have what we needed. Hand it over and we can close this report.";
  if (questId === "return_shears" && npcId === "mira") {
    return state.open
      ? "I dropped a grocery coupon near the Training Lot. If the sale ends, this becomes serious."
      : "Training Lot first. The coupon is probably still there unless Sonic made it weird.";
  }
  if (questId === "rekindle_forge" && npcId === "tomas") {
    return state.open
      ? "A spare cyborg core was lost in Monster Alley. Recovery would improve patrol readiness."
      : "Monster Alley is the most likely recovery site. Please bring the core back intact.";
  }
  if (questId === "bridge_whisper" && npcId === "lena") {
    return state.open
      ? "I need proof before filing the overpass alert. Find the note or monster scale near the Ruined Overpass."
      : "The Ruined Overpass is the clue site. Bring me proof, not panic.";
  }
  return null;
}

function questClueLine(worldId: string, questId: string | undefined): string | null {
  if (worldId === "opm_z_city") {
    if (questId === "return_shears") return "The Training Lot is where the coupon fell out after morning exercise.";
    if (questId === "rekindle_forge") return "Monster Alley has the spare core.";
    if (questId === "bridge_whisper") return "Search the Ruined Overpass for the challenge note or monster scale.";
    return null;
  }
  if (questId === "return_shears") return "The forge bench is the first place to check for the shears.";
  if (questId === "rekindle_forge") return "Hollow Wood is where dry bellows leather is most likely to survive.";
  if (questId === "bridge_whisper") return "Search the Old Bridge for physical proof: a note or the cold blue ember.";
  return null;
}

function questAftermathLine(world: World, npc: Npc, quest: Quest): string {
  const latestAftermath = [...npc.memories].reverse().find((memory) => /quest outcome/i.test(memory.text))?.text;
  if (latestAftermath) return latestAftermath.replace(/^(Trusted|Wary|Resolved) quest outcome:\s*/i, "");
  const axes = npc.relationshipAxes?.["player"] ?? {};
  const trust = axes.trust ?? 0;
  const suspicion = axes.suspicion ?? 0;
  if (world.id === "opm_z_city") {
    if (quest.id === "bridge_whisper") return "The overpass proof is filed, and the next challenger beat is easier to read.";
    if (trust >= 3 && trust >= suspicion) return `${npc.name} now treats you as reliable patrol support.`;
    if (suspicion >= 3 && suspicion > trust) return `${npc.name} accepted the result but is still watching your choices.`;
    return `${npc.name} remembers that this task was handled cleanly.`;
  }
  if (quest.id === "bridge_whisper") return "The bridge proof is official now, so the night watch has a real lead.";
  if (trust >= 3 && trust >= suspicion) return `${npc.name} trusts you with more than errands now.`;
  if (suspicion >= 3 && suspicion > trust) return `${npc.name} accepts the help, but the suspicion has not fully cleared.`;
  return `${npc.name} remembers that you followed through.`;
}
