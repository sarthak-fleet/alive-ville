import { useEffect, useState } from "react";

import { timeOfDay } from "../../../src/types.ts";
import { useCombatStore } from "../combat/store.ts";
import { isTypingTarget } from "../controls/input.ts";
import { requestTeleport } from "../controls/runtime.ts";
import { useUiStore } from "../store/ui.ts";
import { useWorldStore } from "../store/world.ts";
import { cityModelFor } from "../worldgen/cache.ts";
import { Dialogue } from "./Dialogue.tsx";
import { ImportScreen } from "./ImportScreen.tsx";
import { Letterbox } from "./Letterbox.tsx";
import { Minimap } from "./Minimap.tsx";
import { QuestTracker } from "./QuestTracker.tsx";

export function Hud() {
  const world = useWorldStore((state) => state.world);
  const events = useWorldStore((state) => state.events);
  const error = useWorldStore((state) => state.error);
  const clearError = useWorldStore((state) => state.clearError);
  const pruneEvents = useWorldStore((state) => state.pruneEvents);
  const send = useWorldStore((state) => state.send);
  const agentLoopRunning = useWorldStore((state) => state.agentLoopRunning);
  const toggleAgentLoop = useWorldStore((state) => state.toggleAgentLoop);
  const target = useUiStore((state) => state.interactionTarget);
  const dialogueNpcId = useUiStore((state) => state.dialogueNpcId);
  const openDialogue = useUiStore((state) => state.openDialogue);
  const interiorDistrictId = useUiStore((state) => state.interiorDistrictId);
  const [importOpen, setImportOpen] = useState(false);
  const playerHp = useCombatStore((state) => state.playerHp);
  const playerMaxHp = useCombatStore((state) => state.playerMaxHp);
  const playerDown = useCombatStore((state) => state.playerDown);
  const inCombat = useCombatStore((state) => Object.values(state.enemies).some((enemy) => enemy.hostile && !enemy.defeated));

  useEffect(() => {
    const interval = window.setInterval(() => pruneEvents(performance.now()), 1000);
    return () => window.clearInterval(interval);
  }, [pruneEvents]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "KeyE" || isTypingTarget(event.target)) return;
      const ui = useUiStore.getState();
      const current = ui.interactionTarget;
      if (!current || ui.dialogueNpcId) return;
      if (current.kind === "npc") openDialogue(current.id);
      if (current.kind === "item") void send({ type: "pickup", itemId: current.id });
      if (current.kind === "prop") void send({ type: "inspect", propId: current.id });
      if (current.kind === "door") {
        const currentWorld = useWorldStore.getState().world;
        if (!currentWorld) return;
        const cityModel = cityModelFor(currentWorld);
        if (ui.interiorDistrictId === current.id) {
          const door = cityModel.doors.find((entry) => entry.districtId === current.id);
          if (door) {
            requestTeleport(door.outsideX, door.outsideZ);
            ui.setInteriorDistrictId(null);
          }
        } else {
          const interior = cityModel.interiors.find((entry) => entry.districtId === current.id);
          if (interior) {
            requestTeleport(interior.spawn.x, interior.spawn.z);
            ui.setInteriorDistrictId(current.id);
          }
        }
        ui.setInteractionTarget(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openDialogue, send]);

  if (!world) return null;

  const interiorLabel = interiorDistrictId
    ? cityModelFor(world).interiors.find((entry) => entry.districtId === interiorDistrictId)?.label
    : null;
  const location = world.locations.find((entry) => entry.id === world.player.locationId);

  return (
    <div className="hud">
      <div className="topbar">
        <div className="topbar-title">{world.story?.title ?? world.name}</div>
        <div className="topbar-meta">
          {interiorLabel ? `Inside ${interiorLabel}` : location?.name ?? "Unknown"} · Day {world.clock.day} ·{" "}
          {String(world.clock.hour).padStart(2, "0")}:00 ({timeOfDay(world.clock)})
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className={`chip ${agentLoopRunning ? "on" : ""}`}
            onClick={() => void toggleAgentLoop()}
            title="Let the world's agents act on their own"
          >
            {agentLoopRunning ? "■ World: alive" : "▶ World: paused"}
          </button>
          <button type="button" className="chip" onClick={() => setImportOpen(true)}>
            Import world
          </button>
        </div>
      </div>

      <QuestTracker />

      <Minimap />

      {world.story?.currentObjective ? (
        <div className="objective">
          <span className="objective-label">Objective</span> {world.story.currentObjective}
        </div>
      ) : null}

      <div className="toasts">
        {events.slice(-5).map((event) => (
          <div key={event.id} className={`toast ${event.fromDirector ? "director" : ""}`}>
            {event.text}
          </div>
        ))}
      </div>

      {target && !dialogueNpcId ? (
        <div className="prompt">
          <span className="prompt-key">E</span> {target.verb} {target.label}
        </div>
      ) : null}

      {!dialogueNpcId ? (
        <div className="controls-hint">
          WASD move · Shift run · E interact · F/click attack · Space dodge · Q lock-on · drag orbit · wheel zoom
        </div>
      ) : null}

      <div className={`player-hp ${inCombat || playerHp < playerMaxHp ? "visible" : ""}`}>
        <div className="player-hp-label">
          HP {Math.round(playerHp)}/{playerMaxHp}
        </div>
        <div className="player-hp-track">
          <div
            className={`player-hp-fill ${playerHp / playerMaxHp < 0.3 ? "low" : ""}`}
            style={{ width: `${(playerHp / playerMaxHp) * 100}%` }}
          />
        </div>
      </div>

      {playerDown ? (
        <div className="death-overlay">
          <div className="death-title">You are down</div>
          <div className="death-sub">Getting back up…</div>
        </div>
      ) : null}

      <Dialogue />

      <Letterbox />

      {importOpen ? <ImportScreen onClose={() => setImportOpen(false)} /> : null}

      {error ? (
        <div className="error-banner" onClick={clearError}>
          {error} (click to dismiss)
        </div>
      ) : null}
    </div>
  );
}
