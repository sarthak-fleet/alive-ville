import { useEffect, useRef, useState } from "react";

import { xpForNextLevel } from "../../../src/arcs.ts";
import { timeOfDay } from "../../../src/types.ts";
import { updateMusicMood } from "../audio/music.ts";
import { isSfxEnabled, pickupChime, questChime, setSfxEnabled } from "../audio/sfx.ts";
import { useBanterStore } from "../characters/banter.ts";
import { useCombatStore } from "../combat/store.ts";
import { isTypingTarget } from "../controls/input.ts";
import { playerGesture, requestTeleport } from "../controls/runtime.ts";
import { useDirectorStore } from "../director/store.ts";
import { worldPressure } from "../mapping/mood.ts";
import { useUiStore } from "../store/ui.ts";
import { useWorldStore } from "../store/world.ts";
import { cityModelFor } from "../worldgen/cache.ts";
import { interiorForBuilding } from "../worldgen/interiors.ts";
import { ArcPanel } from "./ArcPanel.tsx";
import { Chronicle } from "./Chronicle.tsx";
import { Dialogue } from "./Dialogue.tsx";
import { ImportScreen } from "./ImportScreen.tsx";
import { Letterbox } from "./Letterbox.tsx";
import { Minimap } from "./Minimap.tsx";
import { QuestTracker } from "./QuestTracker.tsx";
import { Recap } from "./Recap.tsx";

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
  const interiorBuildingId = useUiStore((state) => state.interiorBuildingId);
  const [importOpen, setImportOpen] = useState(false);
  const [chronicleOpen, setChronicleOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(() => isSfxEnabled());
  const [pointerLocked, setPointerLocked] = useState(false);

  useEffect(() => {
    const onLockChange = () => setPointerLocked(Boolean(document.pointerLockElement));
    document.addEventListener("pointerlockchange", onLockChange);
    return () => document.removeEventListener("pointerlockchange", onLockChange);
  }, []);
  const playerHp = useCombatStore((state) => state.playerHp);
  const playerMaxHp = useCombatStore((state) => state.playerMaxHp);
  const playerDown = useCombatStore((state) => state.playerDown);
  const inCombat = useCombatStore((state) => Object.values(state.enemies).some((enemy) => enemy.hostile && !enemy.defeated));

  useEffect(() => {
    const interval = window.setInterval(() => {
      pruneEvents(performance.now());
      useBanterStore.getState().prune(performance.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [pruneEvents]);

  // score follows the world: time of day, story pressure, combat
  useEffect(() => {
    if (!world) return;
    updateMusicMood({ phase: timeOfDay(world.clock), pressure: worldPressure(world), combat: inCombat });
  }, [world, inCombat]);

  // sync player level into combat scaling; celebrate level-ups
  const prevLevel = useRef(1);
  useEffect(() => {
    const level = world?.player.growth?.level ?? 1;
    useCombatStore.getState().setPlayerGrowth(level);
    if (level > prevLevel.current) questChime();
    prevLevel.current = level;
  }, [world?.player.growth?.level]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "KeyJ" || isTypingTarget(event.target)) return;
      event.preventDefault();
      setChronicleOpen((open) => !open);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "KeyE" || isTypingTarget(event.target)) return;
      const ui = useUiStore.getState();
      const current = ui.interactionTarget;
      if (!current || ui.dialogueNpcId) return;
      if (useDirectorStore.getState().cutscene) return;
      // stop the same keystroke from typing "e" into the dialogue input it opens
      event.preventDefault();
      if (current.kind === "npc") openDialogue(current.id);
      if (current.kind === "item") {
        pickupChime();
        playerGesture("pickup");
        void send({ type: "pickup", itemId: current.id });
      }
      if (current.kind === "prop") {
        playerGesture("interact");
        void send({ type: "inspect", propId: current.id });
      }
      if (current.kind === "door") {
        const currentWorld = useWorldStore.getState().world;
        if (!currentWorld) return;
        const cityModel = cityModelFor(currentWorld);
        if (ui.interiorBuildingId === current.id) {
          const door = cityModel.doors.find((entry) => entry.buildingId === current.id);
          if (door) {
            requestTeleport(door.outsideX, door.outsideZ);
            ui.setInteriorBuildingId(null);
          }
        } else {
          const interior = interiorForBuilding(currentWorld, cityModel, current.id);
          if (interior) {
            requestTeleport(interior.spawn.x, interior.spawn.z);
            ui.setInteriorBuildingId(current.id);
          }
        }
        ui.setInteractionTarget(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openDialogue, send]);

  if (!world) return null;

  const interiorLabel = interiorBuildingId
    ? interiorForBuilding(world, cityModelFor(world), interiorBuildingId)?.label
    : null;
  const location = world.locations.find((entry) => entry.id === world.player.locationId);

  return (
    <div className="hud">
      <div className="topbar">
        <div className="topbar-title">{world.story?.title ?? world.name}</div>
        <div className="topbar-meta">
          {interiorLabel ? `Inside ${interiorLabel}` : location?.name ?? "Unknown"} · Day {world.clock.day} ·{" "}
          {String(Math.floor(world.clock.hour)).padStart(2, "0")}:00 ({timeOfDay(world.clock)})
        </div>
        <div className="topbar-actions">
          {/* the world is alive by default; the old pause chip read as a media
              stop button and players hit it by accident */}
          {!agentLoopRunning ? (
            <button type="button" className="chip" onClick={() => void toggleAgentLoop()}>
              ▶ Resume world
            </button>
          ) : null}
          {import.meta.env["VITE_ENABLE_IMPORT"] === "1" ? (
            <button type="button" className="chip" onClick={() => setImportOpen(true)}>
              Import world
            </button>
          ) : null}
          <button type="button" className={`chip ${chronicleOpen ? "on" : ""}`} onClick={() => setChronicleOpen((open) => !open)}>
            Journal (J)
          </button>
          <button type="button" className={`chip ${soundOn ? "on" : ""}`} onClick={() => { setSfxEnabled(!soundOn); setSoundOn(!soundOn); }}>
            {soundOn ? "🔊" : "🔇"}
          </button>
        </div>
      </div>

      {pointerLocked && !dialogueNpcId ? <div className="crosshair" /> : null}

      <Recap />

      <QuestTracker />

      <ArcPanel />

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

      {world.items.some((item) => item.holderId === "player") ? (
        <div className="inventory">
          {world.items
            .filter((item) => item.holderId === "player")
            .map((item) => (
              <div key={item.id} className="inventory-chip" title={item.description ?? item.name}>
                {item.name}
              </div>
            ))}
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

      <div className="player-xp">
        <span className="player-level">Lv {world.player.growth?.level ?? 1}</span>
        <div className="player-xp-track">
          <div
            className="player-xp-fill"
            style={{
              width: `${(() => {
                const growth = world.player.growth ?? { xp: 0, level: 1 };
                const prev = (growth.level - 1) * (growth.level - 1) * 60;
                const next = xpForNextLevel(growth.level);
                return Math.min(100, Math.max(0, ((growth.xp - prev) / Math.max(1, next - prev)) * 100));
              })()}%`,
            }}
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

      <Chronicle open={chronicleOpen} onClose={() => setChronicleOpen(false)} />

      {importOpen ? <ImportScreen onClose={() => setImportOpen(false)} /> : null}

      {error ? (
        <div className="error-banner" onClick={clearError}>
          {error} (click to dismiss)
        </div>
      ) : null}
    </div>
  );
}
