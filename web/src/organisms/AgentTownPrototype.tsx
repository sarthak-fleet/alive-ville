import Phaser from "phaser";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { playSfx } from "../lib/sfx.ts";
import { streamNpcDialogue } from "./agent-town-chat.ts";
import { opponentForCharacter } from "./agent-town-duels.ts";
import { pickGossip } from "./agent-town-gossip.ts";
import { generateInitiative, type Initiative, initiativeCompleted } from "./agent-town-initiatives.ts";
import {
  getMemory,
  type MemoryStore,
  type Observation,
  reactionFor,
  recordDuelOutcome,
  recordItemGiven,
  recordItemPicked,
  recordTalk,
} from "./agent-town-memory.ts";
import { loadSave, persistSave } from "./agent-town-save.ts";
import { applyUpgrade, emptyUpgrades, UPGRADE_CAP, UPGRADE_META, type UpgradeKind, type Upgrades } from "./agent-town-upgrades.ts";
import {
  CAST,
  type CastMember,
  type Direction,
  initialSnapshot,
  nextObjective,
  PROPS,
  propVisible,
  type RoomId,
  type StorySnapshot,
  type WorldProp,
  type ZoneId,
  ZONES,
  zoneUnlocked,
} from "./agent-town-world.ts";
import { type AgentOverlays, chooseWorldAction } from "./agent-town-world-tick.ts";
import { type DuelOpponent, DuelOverlay } from "./DuelOverlay.tsx";
import { UpgradeOverlay } from "./UpgradeOverlay.tsx";

const FRAME_WIDTH = 48;
const FRAME_HEIGHT = 96;
const SHEET_COLUMNS = 56;
const FRAMES_PER_DIR = 6;
const CHARACTER_SCALE = 0.72;
const DEFAULT_SPEED = 165;
const SPRINT_MULTIPLIER = 1.6;
const MIN_SPEED = 90;
const MAX_SPEED = 260;
const INTERACT_DISTANCE = 72;
const WANDER_RADIUS = 90;
const WANDER_SPEED = 40;
const WANDER_PAUSE_NEAR_PLAYER = 120;
const MAP_KEY = "zcity-outdoor";
const OFFICE_MAP_KEY = "hero-hq-interior";
const PLAYER_KEY = "character_09";
const WORLD_WIDTH = 192 * 16;
const WORLD_HEIGHT = 128 * 16;
const OFFICE_WORLD_WIDTH = 27 * 48;
const OFFICE_WORLD_HEIGHT = 20 * 48;

const OUTDOOR_TILESETS = [
  ["openrtp_exterior", "/openrtp/exterior.png"],
] as const;

const OFFICE_TILESETS = [
  ["room_builder", "Room_Builder_Office_48x48.png"],
  ["modern_office", "Modern_Office_48x48.png"],
  ["Classroom & Library", "5_Classroom_and_library_48x48.png"],
  ["Basement", "14_Basement_48x48.png"],
  ["Generic Interiors", "1_Generic_48x48.png"],
  ["Interios Room Builder", "Room_Builder_48x48.png"],
  ["6_Music_and_sport_48x48", "6_Music_and_sport_48x48.png"],
  ["3_Bathroom_48x48", "3_Bathroom_48x48.png"],
  ["4_Bedroom_48x48", "4_Bedroom_48x48.png"],
  ["2_LivingRoom_48x48", "2_LivingRoom_48x48.png"],
  ["7_Art_48x48", "7_Art_48x48.png"],
  ["8_Gym_48x48", "8_Gym_48x48.png"],
  ["9_Fishing_48x48", "9_Fishing_48x48.png"],
  ["11_Halloween_48x48", "11_Halloween_48x48.png"],
  ["13_Conference_Hall_48x48", "13_Conference_Hall_48x48.png"],
  ["16_Grocery_store_48x48", "16_Grocery_store_48x48.png"],
] as const;

const DIRECTIONS = ["right", "up", "left", "down"] as const;
type MapMode = RoomId;

const INTERIOR_EXIT_POSITION: Record<Exclude<MapMode, "outdoor">, { x: number; y: number; zoneId: ZoneId }> = {
  hqInterior: { x: 710, y: 560, zoneId: "hq" },
  marketInterior: { x: 1538, y: 556, zoneId: "market" },
  dojoInterior: { x: 592, y: 1408, zoneId: "hq" },
  alleyInterior: { x: 2178, y: 1608, zoneId: "alley" },
};

interface RoomPalette { label: string; labelColor: string; bg: string; tint: number; alpha: number; signColor: string; signBg: string }
const ROOM_PALETTE: Record<MapMode, RoomPalette> = {
  outdoor: { label: "Z-City", labelColor: "#fff4ca", bg: "#11161d", tint: 0x000000, alpha: 0, signColor: "#fff4ca", signBg: "#11161d" },
  hqInterior:     { label: "Hero Association HQ", labelColor: "#0e1521", bg: "#1a1f2a", tint: 0x4070b0, alpha: 0.18, signColor: "#0e1521", signBg: "#9bd3ff" },
  marketInterior: { label: "Market Hall",          labelColor: "#21170f", bg: "#241710", tint: 0xff8a3c, alpha: 0.24, signColor: "#21170f", signBg: "#f0a35e" },
  dojoInterior:   { label: "Dojo",                 labelColor: "#0e201a", bg: "#10211b", tint: 0x4dd0a8, alpha: 0.22, signColor: "#0e201a", signBg: "#86d3a8" },
  alleyInterior:  { label: "Alley Gate",           labelColor: "#1c0707", bg: "#1f0f10", tint: 0xff5a4d, alpha: 0.26, signColor: "#f5cccc", signBg: "#3a1216" },
};

interface DressingProp {
  kind: "rect" | "circle" | "label";
  x: number;
  y: number;
  w?: number;
  h?: number;
  r?: number;
  color: number;
  outline?: number;
  label?: string;
  labelColor?: number;
  pulse?: boolean;
}

const ROOM_DRESSING: Partial<Record<MapMode, DressingProp[]>> = {
  hqInterior: [
    // Filing cabinets along the back wall
    { kind: "rect", x: 130, y: 130, w: 36, h: 60, color: 0x3b4a63, outline: 0x9bd3ff },
    { kind: "rect", x: 170, y: 130, w: 36, h: 60, color: 0x3b4a63, outline: 0x9bd3ff },
    { kind: "rect", x: 210, y: 130, w: 36, h: 60, color: 0x3b4a63, outline: 0x9bd3ff },
    // Hero badge display
    { kind: "label", x: 1080, y: 200, color: 0x9bd3ff, label: "★ HERO ROSTER ★", labelColor: 0x0e1521 },
    // Dispatch monitors
    { kind: "rect", x: 880, y: 130, w: 60, h: 40, color: 0x1a2533, outline: 0x6fb0f5 },
    { kind: "rect", x: 960, y: 130, w: 60, h: 40, color: 0x1a2533, outline: 0x6fb0f5 },
    // Floor decal
    { kind: "circle", x: 650, y: 720, r: 80, color: 0x6fb0f5, outline: 0x9bd3ff },
    { kind: "label", x: 650, y: 720, color: 0x9bd3ff, label: "HQ", labelColor: 0x0e1521 },
  ],
  marketInterior: [
    // Produce crates in a row
    { kind: "rect", x: 150, y: 150, w: 55, h: 45, color: 0xff8a3c, outline: 0xfdc086, label: "APPLES", labelColor: 0x21170f },
    { kind: "rect", x: 215, y: 150, w: 55, h: 45, color: 0xc4e9a8, outline: 0xddf5c1, label: "GREENS", labelColor: 0x21170f },
    { kind: "rect", x: 280, y: 150, w: 55, h: 45, color: 0xf0a35e, outline: 0xfdc086, label: "BREAD", labelColor: 0x21170f },
    // Ramen counter
    { kind: "rect", x: 950, y: 200, w: 180, h: 50, color: 0x8c5a2b, outline: 0xf0a35e },
    { kind: "label", x: 1040, y: 175, color: 0xf0a35e, label: "RAMEN · 480¥", labelColor: 0x21170f },
    // Price chalkboard
    { kind: "rect", x: 80, y: 230, w: 70, h: 90, color: 0x2a1f12, outline: 0xf0a35e },
    { kind: "label", x: 115, y: 275, color: 0xf0a35e, label: "SALE", labelColor: 0xfdc086 },
    // Floor decal
    { kind: "circle", x: 650, y: 720, r: 80, color: 0xf0a35e, outline: 0xfdc086 },
    { kind: "label", x: 650, y: 720, color: 0xfdc086, label: "MARKET", labelColor: 0x21170f },
  ],
  dojoInterior: [
    // Training mats — green squares on the floor
    { kind: "rect", x: 200, y: 220, w: 120, h: 120, color: 0x4dd0a8, outline: 0x86d3a8 },
    { kind: "rect", x: 350, y: 220, w: 120, h: 120, color: 0x4dd0a8, outline: 0x86d3a8 },
    { kind: "rect", x: 500, y: 220, w: 120, h: 120, color: 0x4dd0a8, outline: 0x86d3a8 },
    // Training dummy area
    { kind: "circle", x: 900, y: 280, r: 32, color: 0xa67c52, outline: 0xe2c89a },
    { kind: "label", x: 900, y: 330, color: 0x86d3a8, label: "TARGET", labelColor: 0x0e201a },
    // Bell rope
    { kind: "rect", x: 1100, y: 130, w: 8, h: 70, color: 0x8c5a2b },
    { kind: "circle", x: 1104, y: 220, r: 14, color: 0xf4c873, outline: 0xfdc086 },
    // Floor decal
    { kind: "circle", x: 650, y: 720, r: 80, color: 0x4dd0a8, outline: 0x86d3a8 },
    { kind: "label", x: 650, y: 720, color: 0xcfe9d4, label: "DOJO", labelColor: 0x0e201a },
  ],
  alleyInterior: [
    // Gate posts
    { kind: "rect", x: 130, y: 200, w: 30, h: 200, color: 0x3a1216, outline: 0xff5a4d },
    { kind: "rect", x: 1130, y: 200, w: 30, h: 200, color: 0x3a1216, outline: 0xff5a4d },
    // Torches — pulsing orange dots
    { kind: "circle", x: 145, y: 210, r: 10, color: 0xff8a3c, outline: 0xfdc086, pulse: true },
    { kind: "circle", x: 1145, y: 210, r: 10, color: 0xff8a3c, outline: 0xfdc086, pulse: true },
    // Warning sign
    { kind: "rect", x: 850, y: 200, w: 140, h: 50, color: 0x3a1216, outline: 0xff5a4d },
    { kind: "label", x: 920, y: 215, color: 0xff5a4d, label: "⚠ MONSTER ZONE", labelColor: 0xff5a4d },
    // Bloodstain decal
    { kind: "circle", x: 700, y: 380, r: 24, color: 0x6e1a1f, outline: 0x3a1216 },
    // Floor decal
    { kind: "circle", x: 650, y: 720, r: 80, color: 0x3a1216, outline: 0xff5a4d },
    { kind: "label", x: 650, y: 720, color: 0xff5a4d, label: "ALLEY", labelColor: 0xf5cccc },
  ],
};
type DoorEntry = { label: string; x: number; y: number; marker: Phaser.GameObjects.Container; tag: Phaser.GameObjects.Text; action: () => void };

export function AgentTownPrototype() {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<OfficePrototypeScene | null>(null);
  const initialState = useMemo(() => {
    const save = loadSave();
    return {
      snapshot: save?.snapshot ?? initialSnapshot(),
      met: new Set(save?.met ?? []),
      defeated: new Set(save?.defeated ?? []),
      memories: (save?.memories ?? {}) as MemoryStore,
      upgrades: save?.upgrades ?? emptyUpgrades(),
      upgradeRewarded: new Set(save?.upgradeRewarded ?? []),
      restored: Boolean(save),
    };
  }, []);
  const snapshotRef = useRef<StorySnapshot>(initialState.snapshot);
  const previousObjectiveRef = useRef<string>(initialState.snapshot.objective);
  const toastTimer = useRef<number | null>(null);
  const [active, setActive] = useState<CastMember>(CAST[0]!);
  const [snapshot, setSnapshot] = useState<StorySnapshot>(initialState.snapshot);
  const [met, setMet] = useState<Set<string>>(initialState.met);
  const [log, setLog] = useState<string[]>(() =>
    initialState.restored ? ["Patrol restored. Press E near a marker to continue."] : ["Walk the city. Press E near a character or marker."],
  );
  const [, setMapMode] = useState<MapMode>("outdoor");
  const [toast, setToast] = useState<string | null>(null);
  const [duelOpponent, setDuelOpponent] = useState<{ id: string; profile: DuelOpponent } | null>(null);
  const [showIntro, setShowIntro] = useState<boolean>(() => {
    try { return typeof window !== "undefined" && window.localStorage.getItem("agent-town:intro-dismissed") !== "1"; }
    catch { return true; }
  });
  const [panelOpen, setPanelOpen] = useState<boolean>(() => {
    try { return typeof window !== "undefined" && window.localStorage.getItem("agent-town:panel-open") === "1"; }
    catch { return false; }
  });
  const [panelBadge, setPanelBadge] = useState<boolean>(false);
  const [moveSpeed, setMoveSpeed] = useState<number>(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem("agent-town:move-speed") : null;
      const value = raw ? Number(raw) : NaN;
      if (Number.isFinite(value) && value >= 90 && value <= 260) return value;
    } catch { /* ignore */ }
    return 165;
  });
  const autoCloseTimer = useRef<number | null>(null);
  const panelOpenRef = useRef<boolean>(panelOpen);
  const [defeated, setDefeated] = useState<Set<string>>(initialState.defeated);
  const defeatedRef = useRef<Set<string>>(defeated);
  const [memories, setMemories] = useState<MemoryStore>(initialState.memories);
  const memoriesRef = useRef<MemoryStore>(memories);
  const [upgrades, setUpgrades] = useState<Upgrades>(initialState.upgrades);
  const [upgradeRewarded, setUpgradeRewarded] = useState<Set<string>>(initialState.upgradeRewarded);
  const [pendingUpgrade, setPendingUpgrade] = useState<{ opponentName: string } | null>(null);
  const [overlays, setOverlays] = useState<AgentOverlays>({});
  const overlaysRef = useRef<AgentOverlays>({});
  const [initiative, setInitiative] = useState<Initiative | null>(null);
  const initiativeRef = useRef<Initiative | null>(null);
  const initiativeAbortRef = useRef<AbortController | null>(null);
  const checkInitiativeRef = useRef<(event: Parameters<typeof initiativeCompleted>[1]) => void>(() => undefined);
  const logRef = useRef<string[]>([]);
  const dialogueAbortRef = useRef<AbortController | null>(null);

  const applyCharacterTalk = (character: CastMember) => {
    setActive(character);
    setMet((current) => new Set(current).add(character.id));
    playSfx("talk");
    const priorSnapshot = snapshotRef.current;
    const result = reduceCharacterTalk(priorSnapshot, character);
    snapshotRef.current = result.snapshot;
    setSnapshot(result.snapshot);

    const now = Date.now();
    const priorMemory = getMemory(memoriesRef.current, character.id);
    const reaction = reactionFor(character, priorMemory);

    // Mutate memory: record talk, and if Saitama got the coupon, record the gift
    let nextMemories = recordTalk(memoriesRef.current, character.id, now);
    if (character.id === "saitama" && result.snapshot.flags.couponReturned && !priorSnapshot.flags.couponReturned) {
      nextMemories = recordItemGiven(nextMemories, "saitama", "Grocery coupon", now);
    }
    memoriesRef.current = nextMemories;
    setMemories(nextMemories);
    checkInitiativeRef.current({ kind: "talked", characterId: character.id });

    const logEntries: string[] = [...result.entries];
    if (reaction) logEntries.push(reaction.line);
    logEntries.push(`${character.name}: ${character.memory}`);
    setLog((existing) => [...logEntries, ...existing].slice(0, 6));

    const profile = opponentForCharacter(character.id);
    if (profile && !defeatedRef.current.has(character.id)) {
      if (character.id !== "sonic" || result.snapshot.flags.sonicChallenged) {
        setDuelOpponent({ id: character.id, profile });
      }
    }
    dialogueAbortRef.current?.abort();
    const controller = new AbortController();
    dialogueAbortRef.current = controller;
    const placeholder = `${character.name}: …`;
    setLog((existing) => [placeholder, ...existing].slice(0, 6));
    let accumulated = "";
    void streamNpcDialogue({
      character,
      snapshot: result.snapshot,
      memory: priorMemory,
      signal: controller.signal,
      onToken: (text) => {
        accumulated += text;
        setLog((existing) => {
          const rest = existing[0] === placeholder || existing[0]?.startsWith(`${character.name}: `) ? existing.slice(1) : existing;
          return [`${character.name}: ${accumulated}`, ...rest].slice(0, 6);
        });
      },
    }).then((outcome) => {
      if (!outcome.ok && accumulated.length === 0) {
        setLog((existing) => existing[0] === placeholder ? existing.slice(1) : existing);
      }
      return undefined;
    });
  };

  const applyPropInspect = (prop: WorldProp) => {
    const result = reducePropInspect(snapshotRef.current, prop);
    snapshotRef.current = result.snapshot;
    setSnapshot(result.snapshot);
    setLog((existing) => [...result.entries, ...existing].slice(0, 6));
    playSfx("inspect");
    if (prop.givesItem) {
      const witness = CAST.find((member) => member.zoneId === prop.zoneId && !member.roomId)?.id ?? null;
      const updated = recordItemPicked(memoriesRef.current, witness, prop.givesItem, Date.now());
      memoriesRef.current = updated;
      setMemories(updated);
    }
  };

  const onTalkRef = useRef(applyCharacterTalk);
  const onInspectRef = useRef(applyPropInspect);
  useEffect(() => {
    onTalkRef.current = applyCharacterTalk;
    onInspectRef.current = applyPropInspect;
    defeatedRef.current = defeated;
    memoriesRef.current = memories;
    overlaysRef.current = overlays;
    initiativeRef.current = initiative;
    logRef.current = log;
    panelOpenRef.current = panelOpen;
  });

  useEffect(() => {
    try { window.localStorage.setItem("agent-town:panel-open", panelOpen ? "1" : "0"); } catch { /* ignore */ }
  }, [panelOpen]);

  useEffect(() => {
    try { window.localStorage.setItem("agent-town:move-speed", String(moveSpeed)); } catch { /* ignore */ }
    sceneRef.current?.setBaseSpeed(moveSpeed);
  }, [moveSpeed]);

  const togglePanel = useCallback(() => {
    setPanelOpen((current) => !current);
    setPanelBadge(false);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && /^(input|textarea|select)$/i.test(event.target.tagName)) return;
      if (event.key === "Tab" || event.key === "j" || event.key === "J") {
        event.preventDefault();
        togglePanel();
      } else if (event.key === "Escape") {
        if (panelOpenRef.current) {
          setPanelOpen(false);
          setPanelBadge(false);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePanel]);

  const flashPanel = useCallback(() => {
    if (panelOpenRef.current) return;
    setPanelBadge(true);
    if (autoCloseTimer.current) window.clearTimeout(autoCloseTimer.current);
    setPanelOpen(true);
    autoCloseTimer.current = window.setTimeout(() => {
      setPanelOpen(false);
      autoCloseTimer.current = null;
    }, 4500);
  }, []);

  useEffect(() => {
    if (!hostRef.current) return undefined;
    const scene = new OfficePrototypeScene((character) => {
      onTalkRef.current(character);
    }, (prop) => {
      onInspectRef.current(prop);
    }, setMapMode);
    sceneRef.current = scene;
    scene.bindMemoryHooks(
      () => memoriesRef.current,
      (next) => {
        memoriesRef.current = next;
        setMemories(next);
      },
      (name, line) => {
        setLog((existing) => [`[overheard] ${name}: ${line}`, ...existing].slice(0, 6));
      },
    );
    scene.setBaseSpeed(moveSpeed);
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      width: 1280,
      height: 720,
      pixelArt: true,
      roundPixels: true,
      backgroundColor: "#111827",
      scale: { mode: Phaser.Scale.RESIZE },
      physics: {
        default: "arcade",
        arcade: { gravity: { x: 0, y: 0 } },
      },
      scene,
    });
    return () => {
      game.destroy(true);
      sceneRef.current = null;
    };
    // Scene mounts once; moveSpeed flows through its own effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    snapshotRef.current = snapshot;
    sceneRef.current?.applySnapshot(snapshot);
    if (snapshot.objective !== previousObjectiveRef.current) {
      previousObjectiveRef.current = snapshot.objective;
      setToast(`New objective: ${snapshot.objective}`);
      playSfx("objective");
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setToast(null), 3600);
      flashPanel();
    }
  }, [snapshot, flashPanel]);

  useEffect(() => () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    dialogueAbortRef.current?.abort();
    initiativeAbortRef.current?.abort();
  }, []);

  const requestInitiative = useCallback(() => {
    initiativeAbortRef.current?.abort();
    const controller = new AbortController();
    initiativeAbortRef.current = controller;
    void generateInitiative({
      cast: CAST,
      overlays: overlaysRef.current,
      recentLog: logRef.current,
      signal: controller.signal,
    }).then((next) => {
      if (controller.signal.aborted) return undefined;
      initiativeRef.current = next;
      setInitiative(next);
      setLog((existing) => [`[director] ${next.text}`, ...existing].slice(0, 6));
      flashPanel();
      return undefined;
    }).catch(() => undefined);
  }, [flashPanel]);

  useEffect(() => {
    const id = window.setTimeout(() => requestInitiative(), 2500);
    return () => window.clearTimeout(id);
  }, [requestInitiative]);

  const checkInitiativeCompletion = useCallback((event: Parameters<typeof initiativeCompleted>[1]) => {
    const current = initiativeRef.current;
    if (!current) return;
    if (!initiativeCompleted(current, event)) return;
    initiativeRef.current = null;
    setInitiative(null);
    setLog((existing) => [`[director] Initiative complete — full heal applied.`, ...existing].slice(0, 6));
    playSfx("victory");
    window.setTimeout(() => requestInitiative(), 1500);
  }, [requestInitiative]);

  useEffect(() => {
    checkInitiativeRef.current = checkInitiativeCompletion;
  }, [checkInitiativeCompletion]);

  const dispatchWorldAction = useCallback((action: ReturnType<typeof chooseWorldAction>) => {
    const now = Date.now();
    if (action.kind === "idle") return;

    if (action.kind === "relocate") {
      const character = CAST.find((member) => member.id === action.characterId);
      if (!character) return;
      overlaysRef.current = { ...overlaysRef.current, [action.characterId]: { zoneId: action.toZone } };
      setOverlays(overlaysRef.current);
      sceneRef.current?.relocateCharacter(action.characterId, action.toZone);
      setLog((existing) => [`[world] ${action.reason}`, ...existing].slice(0, 6));
      const fromZone = character.zoneId;
      const updated = { ...memoriesRef.current };
      for (const witness of CAST) {
        if (witness.id === character.id || witness.roomId) continue;
        const witnessZone = overlaysRef.current[witness.id]?.zoneId ?? witness.zoneId;
        if (witnessZone === fromZone) {
          const mem = updated[witness.id] ?? { observations: [], talkCount: 0, lastSeenAt: null };
          const obs: Observation = { kind: "asked-about", subject: character.id, note: `left for ${action.toZone}`, at: now };
          updated[witness.id] = { ...mem, observations: [obs, ...mem.observations].slice(0, 12) };
        }
      }
      memoriesRef.current = updated;
      setMemories(updated);
      return;
    }

    if (action.kind === "challenge") {
      const aggressor = CAST.find((m) => m.id === action.aggressorId);
      const target = CAST.find((m) => m.id === action.targetId);
      if (!aggressor || !target) return;
      sceneRef.current?.enactChallenge(action.aggressorId, action.targetId, action.winnerId);
      const winnerName = action.winnerId === action.aggressorId ? aggressor.name : target.name;
      const loserId = action.winnerId === action.aggressorId ? target.id : aggressor.id;
      const loserName = action.winnerId === action.aggressorId ? target.name : aggressor.name;
      setLog((existing) => [`[world] ${action.reason} ${winnerName} won.`, ...existing].slice(0, 6));
      const updated = { ...memoriesRef.current };
      const loserMem = updated[loserId] ?? { observations: [], talkCount: 0, lastSeenAt: null };
      const loserObs: Observation = { kind: "lost-duel", subject: action.winnerId, note: `lost to ${winnerName}`, at: now };
      updated[loserId] = { ...loserMem, observations: [loserObs, ...loserMem.observations].slice(0, 12) };
      const winnerMem = updated[action.winnerId] ?? { observations: [], talkCount: 0, lastSeenAt: null };
      const winnerObs: Observation = { kind: "won-duel", subject: loserId, note: `beat ${loserName}`, at: now };
      updated[action.winnerId] = { ...winnerMem, observations: [winnerObs, ...winnerMem.observations].slice(0, 12) };
      const zone = overlaysRef.current[aggressor.id]?.zoneId ?? aggressor.zoneId;
      for (const witness of CAST) {
        if (witness.id === aggressor.id || witness.id === target.id || witness.roomId) continue;
        const witnessZone = overlaysRef.current[witness.id]?.zoneId ?? witness.zoneId;
        if (witnessZone !== zone) continue;
        const wm = updated[witness.id] ?? { observations: [], talkCount: 0, lastSeenAt: null };
        const wobs: Observation = { kind: "saw-defeat", subject: loserId, note: `lost to ${winnerName}`, at: now };
        updated[witness.id] = { ...wm, observations: [wobs, ...wm.observations].slice(0, 12) };
      }
      memoriesRef.current = updated;
      setMemories(updated);
      return;
    }

    if (action.kind === "abandon") {
      const member = CAST.find((m) => m.id === action.characterId);
      const fallbackZone = member?.zoneId ?? "hq";
      overlaysRef.current = {
        ...overlaysRef.current,
        [action.characterId]: { zoneId: overlaysRef.current[action.characterId]?.zoneId ?? fallbackZone, hidden: true },
      };
      setOverlays(overlaysRef.current);
      sceneRef.current?.hideCharacter(action.characterId);
      setLog((existing) => [`[world] ${action.reason}`, ...existing].slice(0, 6));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    const schedule = () => {
      const delay = 22_000 + Math.random() * 13_000;
      timer = window.setTimeout(() => {
        if (cancelled) return;
        try {
          const action = chooseWorldAction(CAST, overlaysRef.current);
          dispatchWorldAction(action);
        } catch (error) {
          console.error("world tick failed", error);
        }
        schedule();
      }, delay);
    };
    timer = window.setTimeout(() => {
      if (cancelled) return;
      const action = chooseWorldAction(CAST, overlaysRef.current);
      dispatchWorldAction(action);
      schedule();
    }, 12_000);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [dispatchWorldAction]);

  useEffect(() => {
    persistSave({ snapshot, defeated: [...defeated], met: [...met], memories, upgrades, upgradeRewarded: [...upgradeRewarded] });
  }, [snapshot, defeated, met, memories, upgrades, upgradeRewarded]);

  const activeZone = ZONES.find((zone) => zone.id === snapshot.activeZone) ?? ZONES[0]!;
  const primaryAction = primaryStoryAction(snapshot);
  const steps = questSteps(snapshot);
  const patrolComplete = defeated.has("sonic");

  useEffect(() => {
    const target = !primaryAction || patrolComplete
      ? null
      : primaryAction.kind === "prop"
        ? { kind: "prop" as const, id: primaryAction.prop.id }
        : { kind: "character" as const, id: primaryAction.characterId };
    sceneRef.current?.setObjectiveTarget(target);
  }, [primaryAction, patrolComplete]);

  const restartPatrol = () => {
    dialogueAbortRef.current?.abort();
    // Keep upgrades + upgradeRewarded across patrols — meta-progression
    const fresh = initialSnapshot();
    snapshotRef.current = fresh;
    previousObjectiveRef.current = fresh.objective;
    setSnapshot(fresh);
    setDefeated(new Set());
    setMet(new Set());
    setMemories({});
    memoriesRef.current = {};
    setLog(["Patrol reset. Walk Z-City and press E near a marker."]);
    setDuelOpponent(null);
    setToast(null);
    sceneRef.current?.switchRoom("outdoor");
    playSfx("ui");
  };


  return (
    <div className="agent-town-shell">
      <div className="agent-town-stage">
        <div className="agent-town-game" ref={hostRef} aria-label="Agent town prototype" />
        <div className="agent-town-hud-top" aria-live="polite">
          <span className="agent-town-hud-label">Now</span>
          <span className="agent-town-hud-objective">{snapshot.objective}</span>
        </div>
        {toast && (
          <div className="agent-town-toast" role="status" aria-live="polite" key={toast}>
            {toast}
          </div>
        )}
        {patrolComplete && (
          <div className="agent-town-complete" role="status">
            <span>Patrol complete · {defeated.size} duel{defeated.size === 1 ? "" : "s"} won</span>
            <button type="button" onClick={restartPatrol}>Start new patrol</button>
          </div>
        )}
        {showIntro && (
          <div className="agent-town-intro" role="dialog" aria-label="How to play">
            <div className="agent-town-intro-card">
              <span className="agent-town-intro-eyebrow">Z-City patrol briefing</span>
              <h2>Welcome to Agent Town</h2>
              <ul>
                <li><kbd>WASD</kbd> or <kbd>↑↓←→</kbd> to walk · <kbd>click</kbd> the map to path</li>
                <li><kbd>E</kbd> near a yellow <b>!</b> NPC or <b>?</b> marker to interact</li>
                <li>Fighter NPCs (Sonic, Bang, Garou) drop you into a duel · keys <kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd></li>
                <li>The <em>Now</em> ribbon up top tells you the next move</li>
              </ul>
              <button
                type="button"
                onClick={() => {
                  setShowIntro(false);
                  try { window.localStorage.setItem("agent-town:intro-dismissed", "1"); } catch { /* ignore */ }
                  playSfx("ui");
                }}
              >Start patrol</button>
            </div>
          </div>
        )}
        <button
          type="button"
          className={`agent-town-panel-toggle ${panelOpen ? "open" : ""} ${panelBadge ? "has-update" : ""}`}
          onClick={() => { togglePanel(); playSfx("ui"); }}
          aria-label={panelOpen ? "Close journal" : "Open journal"}
          title={panelOpen ? "Close journal (Tab)" : "Open journal (Tab)"}
        >
          {panelOpen ? "›" : "‹"}
        </button>
        {duelOpponent && (
          <DuelOverlay
            opponent={duelOpponent.profile}
            upgrades={upgrades}
            onClose={(outcome) => {
              const { id, profile } = duelOpponent;
              setDuelOpponent(null);
              const opponentCharacter = CAST.find((member) => member.id === id);
              if (outcome && opponentCharacter) {
                const updated = recordDuelOutcome(memoriesRef.current, id, outcome, opponentCharacter.zoneId, Date.now());
                memoriesRef.current = updated;
                setMemories(updated);
              }
              if (outcome === "victory") {
                setDefeated((current) => new Set(current).add(id));
                if (id === "sonic") {
                  const newObjective = "Patrol complete. Stand down or rematch the cast.";
                  snapshotRef.current = { ...snapshotRef.current, objective: newObjective };
                  setSnapshot((current) => ({ ...current, objective: newObjective }));
                }
                setLog((existing) => [`You won the duel against ${profile.name}.`, ...existing].slice(0, 6));
                if (!upgradeRewarded.has(id)) {
                  setPendingUpgrade({ opponentName: profile.name });
                  setUpgradeRewarded((current) => new Set(current).add(id));
                }
                checkInitiativeRef.current({ kind: "won-duel", opponentId: id });
              } else if (outcome === "defeat") {
                setLog((existing) => [`${profile.name} downed you. Recover and retry.`, ...existing].slice(0, 6));
              }
            }}
          />
        )}
        {pendingUpgrade && (
          <UpgradeOverlay
            opponentName={pendingUpgrade.opponentName}
            upgrades={upgrades}
            onPick={(kind: UpgradeKind) => {
              setUpgrades((current) => applyUpgrade(current, kind));
              setPendingUpgrade(null);
              playSfx("objective");
            }}
          />
        )}
      </div>
      <aside className={`agent-town-panel ${panelOpen ? "open" : ""}`} aria-label="Quest journal" aria-hidden={!panelOpen}>
        <div className="agent-town-kicker">
          <span>{activeZone.name}</span>
          <b>{met.size}/{CAST.length} met · {defeated.size}/3 duels</b>
        </div>

        <section className="agent-town-hero" aria-label="Current objective">
          {(() => {
            const current = steps.find((step) => step.current);
            const label = patrolComplete ? "Patrol complete." : current?.label ?? snapshot.objective;
            const hint = patrolComplete ? "Rematch the cast or start a new patrol." : current?.hint ?? "";
            return (
              <>
                <span className="agent-town-hero-tag">Now</span>
                <h2>{label}</h2>
                {hint && <p className="agent-town-hero-hint">{hint}</p>}
              </>
            );
          })()}
          <div className="agent-town-hero-actions">
            {primaryAction && !patrolComplete && (
              <button
                type="button"
                className="primary"
                onClick={() => {
                  const target = primaryAction.kind === "prop"
                    ? { kind: "prop" as const, id: primaryAction.prop.id }
                    : { kind: "character" as const, id: primaryAction.characterId };
                  sceneRef.current?.panTo(target);
                  playSfx("ui");
                }}
              >
                Show on map
              </button>
            )}
            {patrolComplete && (
              <button type="button" className="primary" onClick={restartPatrol}>Start new patrol</button>
            )}
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setShowIntro(true);
                playSfx("ui");
              }}
              title="Show the controls again"
            >Help</button>
          </div>
        </section>

        {initiative && (
          <section className="agent-town-director" aria-label="Director initiative">
            <span className="agent-town-hero-tag">Director {initiative.source === "llm" ? "· live" : ""}</span>
            <p>{initiative.text}</p>
            <div className="agent-town-hero-actions">
              {initiative.targetCharacterId && (
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    sceneRef.current?.panTo({ kind: "character", id: initiative.targetCharacterId! });
                    playSfx("ui");
                  }}
                >Show me</button>
              )}
              <button type="button" className="ghost" onClick={() => { requestInitiative(); playSfx("ui"); }}>New directive</button>
            </div>
          </section>
        )}

        <section className="agent-town-progress" aria-label="Patrol progress">
          <div className="agent-town-progress-row">
            <small>Patrol</small>
            <span>
              {steps.filter((step) => step.done).length}/{steps.length - 1}
            </span>
          </div>
          <div className="agent-town-progress-bar">
            <div
              className="agent-town-progress-fill"
              style={{ width: `${Math.min(100, Math.round((steps.filter((step) => step.done).length / Math.max(1, steps.length - 1)) * 100))}%` }}
            />
          </div>
          <div className="agent-town-progress-row">
            <small>Duels</small>
            <span className="agent-town-chip-row">
              {["sonic", "bang", "garou"].map((id) => (
                <span key={id} className={`agent-town-chip ${defeated.has(id) ? "won" : ""}`}>
                  {id}
                </span>
              ))}
            </span>
          </div>
          <div className="agent-town-progress-row">
            <small>Perks</small>
            <span className="agent-town-chip-row">
              {(["toughness", "power", "recovery"] as const).map((kind) => (
                <span key={kind} className={`agent-town-chip perk ${upgrades[kind] > 0 ? "earned" : ""}`} title={`${UPGRADE_META[kind].label}: ${UPGRADE_META[kind].effect}`}>
                  {UPGRADE_META[kind].label[0]} {upgrades[kind]}/{UPGRADE_CAP}
                </span>
              ))}
            </span>
          </div>
        </section>

        {met.size > 0 && (
          <section className="agent-town-card" aria-label="Last speaker">
            <small>{active.role}</small>
            <h3>{active.name}</h3>
            <p>{active.line}</p>
            {(() => {
              const mem = getMemory(memories, active.id);
              if (mem.talkCount === 0 && mem.observations.length === 0) return null;
              const beats: string[] = [];
              if (mem.talkCount > 0) beats.push(`talked ${mem.talkCount}×`);
              const sawDefeat = mem.observations.find((obs) => obs.kind === "saw-defeat");
              if (sawDefeat) beats.push(`heard about ${sawDefeat.subject}`);
              if (mem.observations.some((obs) => obs.kind === "lost-duel")) beats.push("lost to you");
              if (mem.observations.some((obs) => obs.kind === "gave-item")) beats.push("received an item");
              return <small className="agent-town-memchip">remembers: {beats.join(" · ")}</small>;
            })()}
          </section>
        )}

        {snapshot.inventory.length > 0 && (
          <section className="agent-town-inventory" aria-label="Inventory">
            <small>Inventory</small>
            <p>{snapshot.inventory.join(" · ")}</p>
          </section>
        )}

        <section className="agent-town-settings" aria-label="Settings">
          <div className="agent-town-progress-row">
            <small>Move speed</small>
            <span>{moveSpeed}</span>
          </div>
          <input
            type="range"
            min={90}
            max={260}
            step={5}
            value={moveSpeed}
            onChange={(event) => setMoveSpeed(Number(event.target.value))}
            aria-label="Movement speed"
          />
          <small className="agent-town-settings-hint">Hold Shift to sprint (1.6×)</small>
        </section>

        <section className="agent-town-log" aria-label="Log">
          {log.slice(0, 4).map((entry, index) => <p key={`${index}-${entry}`}>{entry}</p>)}
        </section>
      </aside>
    </div>
  );
}

class OfficePrototypeScene extends Phaser.Scene {
  private player?: Phaser.Physics.Arcade.Sprite;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private eKey?: Phaser.Input.Keyboard.Key;
  private collisionGroup?: Phaser.Physics.Arcade.StaticGroup;
  private characters = new Map<string, { data: CastMember; sprite: Phaser.Physics.Arcade.Sprite; prompt: Phaser.GameObjects.Text; tag: Phaser.GameObjects.Text; origin: { x: number; y: number }; wander: { target: { x: number; y: number } | null; nextAt: number; facing: Direction }; bubble: { container: Phaser.GameObjects.Container; background: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; until: number } | null }>();
  private props = new Map<string, { data: WorldProp; marker: Phaser.GameObjects.Container; tag: Phaser.GameObjects.Text; prompt: Phaser.GameObjects.Text }>();
  private target: { x: number; y: number } | null = null;
  private facing: Direction = "down";
  private prompt?: Phaser.GameObjects.Text;
  private playerTag?: Phaser.GameObjects.Text;
  private alertTint?: Phaser.GameObjects.Rectangle;
  private objectiveChevron?: Phaser.GameObjects.Text;
  private objectiveTarget: { kind: "character" | "prop"; id: string } | null = null;
  private gossipNextAt: number = 0;
  private gossipActive: { listenerId: string; line: string; firesAt: number; observation: Observation | null } | null = null;
  private memorySource: () => MemoryStore = () => ({});
  private memoryWriter: (next: MemoryStore) => void = () => undefined;
  private overhearReporter: (speakerName: string, line: string) => void = () => undefined;
  private currentSnapshot: StorySnapshot = initialSnapshot();
  private selectedId = CAST[0]!.id;
  private mapMode: MapMode = "outdoor";
  private baseSpeed: number = DEFAULT_SPEED;
  private shiftKey?: Phaser.Input.Keyboard.Key;
  private spawnOverride: { x: number; y: number } | null = null;
  private doors = new Map<string, DoorEntry>();

  constructor(
    private readonly onTalk: (character: CastMember) => void,
    private readonly onInspect: (prop: WorldProp) => void,
    private readonly onMapMode: (mapMode: MapMode) => void,
  ) {
    super("OfficePrototypeScene");
  }

  init(data?: { mapMode?: MapMode; snapshot?: StorySnapshot; selectedId?: string; spawnOverride?: { x: number; y: number } | null }) {
    this.mapMode = data?.mapMode ?? this.mapMode;
    this.currentSnapshot = data?.snapshot ?? this.currentSnapshot;
    this.selectedId = data?.selectedId ?? this.selectedId;
    this.spawnOverride = data?.spawnOverride ?? null;
  }

  preload() {
    this.load.tilemapTiledJSON(MAP_KEY, "/openrtp/zcity-outdoor.json");
    this.load.tilemapTiledJSON(OFFICE_MAP_KEY, "/agent-town/maps/office2.json");
    for (const [name, file] of OUTDOOR_TILESETS) this.load.image(name, file);
    for (const [name, file] of OFFICE_TILESETS) this.load.image(name, `/agent-town/tilesets/${file}`);
    for (const key of new Set([PLAYER_KEY, ...CAST.map((character) => character.sprite)])) {
      const suffix = key.replace("character_", "");
      this.load.spritesheet(key, `/agent-town/characters/Premade_Character_48x48_${suffix}.png`, {
        frameWidth: FRAME_WIDTH,
        frameHeight: FRAME_HEIGHT,
      });
    }
    this.load.spritesheet("agent-town-arrow", "/agent-town/sprites/arrow_down_48x48.png", {
      frameWidth: 48,
      frameHeight: 48,
    });
  }

  create() {
    this.characters.clear();
    this.props.clear();
    this.doors.clear();
    for (const key of new Set([PLAYER_KEY, ...CAST.map((character) => character.sprite)])) createCharacterAnimations(this, key);
    createArrowAnimation(this);

    const mapConfig = this.mapConfig();
    const map = this.make.tilemap({ key: mapConfig.key });
    const tilesets = mapConfig.tilesets.map(([name]) => map.addTilesetImage(name, name)).filter((tileset): tileset is Phaser.Tilemaps.Tileset => Boolean(tileset));
    this.collisionGroup = this.physics.add.staticGroup();
    this.createWorldLayers(map, tilesets);

    this.player = this.physics.add.sprite(mapConfig.spawn.x, mapConfig.spawn.y, PLAYER_KEY, frameFor("down"));
    this.player.setScale(mapConfig.characterScale);
    this.player.setDepth(10);
    this.player.setCollideWorldBounds(true);
    configureBody(this.player);
    this.physics.add.collider(this.player, this.collisionGroup);
    this.playerTag = this.add.text(this.player.x, this.player.y + 34, "Tatsumaki", {
      fontFamily: "Montserrat, sans-serif",
      fontSize: "11px",
      color: "#f6f1e8",
      backgroundColor: "rgba(25, 77, 46, 0.82)",
      padding: { x: 6, y: 3 },
    }).setOrigin(0.5, 0).setDepth(24);

    this.physics.world.setBounds(0, 0, mapConfig.width, mapConfig.height);
    this.cameras.main.setBounds(0, 0, mapConfig.width, mapConfig.height);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setZoom(mapConfig.zoom);

    for (const character of CAST) this.addCharacter(character);
    for (const prop of PROPS) this.addProp(prop);
    if (this.mapMode === "outdoor") {
      this.addZoneLabels();
      this.addDoor("hero-hq-door", "Enter Hero HQ", 710, 520, () => this.switchMap("hqInterior"));
      this.addDoor("market-door", "Enter Market Hall", 1538, 516, () => this.switchMap("marketInterior"));
      this.addDoor("dojo-door", "Enter Dojo", 592, 1368, () => this.switchMap("dojoInterior"));
      this.addDoor("alley-door", "Enter Alley Gate", 2178, 1568, () => this.switchMap("alleyInterior"));
    } else {
      this.addDoor("hero-hq-exit", "Exit to city", 610, 820, () => this.switchMap("outdoor"));
      this.applyRoomTint(mapConfig.width, mapConfig.height);
      this.paintRoomDressing();
      this.addPermanentRoomSign();
    }
    this.alertTint = this.add.rectangle(0, 0, mapConfig.width, mapConfig.height, 0xff3b30, 0).setOrigin(0).setDepth(2).setScrollFactor(1);

    this.cursors = this.input.keyboard?.createCursorKeys();
    this.keys = this.input.keyboard?.addKeys("W,A,S,D") as Record<string, Phaser.Input.Keyboard.Key>;
    this.eKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.shiftKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.input.keyboard?.disableGlobalCapture();
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonReleased()) return;
      this.target = { x: pointer.worldX, y: pointer.worldY };
    });

    this.prompt = this.add.text(0, 0, "Press E", promptStyle()).setOrigin(0.5, 1).setDepth(30).setVisible(false);
    this.objectiveChevron = this.add.text(0, 0, "▼", {
      fontFamily: "Montserrat, sans-serif",
      fontSize: "22px",
      color: "#f8d44e",
      stroke: "#21170f",
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(29).setVisible(false);
    this.tweens.add({ targets: this.objectiveChevron, alpha: { from: 1, to: 0.35 }, y: "+=4", duration: 700, yoyo: true, repeat: -1 });
    this.applySnapshot(this.currentSnapshot);
  }

  override update() {
    if (!this.player) return;
    const movement = this.inputVector();
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const effectiveSpeed = this.baseSpeed * (this.shiftKey?.isDown ? SPRINT_MULTIPLIER : 1);
    if (movement.x !== 0 || movement.y !== 0) {
      this.target = null;
      body.setVelocity(movement.x * effectiveSpeed, movement.y * effectiveSpeed);
      this.setFacing(movement);
    } else if (this.target) {
      const dx = this.target.x - this.player.x;
      const dy = this.target.y - this.player.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= 6) {
        this.target = null;
        body.setVelocity(0, 0);
      } else {
        body.setVelocity((dx / distance) * effectiveSpeed, (dy / distance) * effectiveSpeed);
        this.setFacing({ x: dx, y: dy });
      }
    } else {
      body.setVelocity(0, 0);
    }

    this.syncAnimation();
    this.playerTag?.setPosition(this.player.x, this.player.y + 34);
    this.tickWander();
    this.tickGossip();
    this.updateCharacterLabels();
    const nearest = this.nearestInteractable();
    this.highlightNearest(nearest);
    if (this.prompt) {
      this.prompt.setVisible(Boolean(nearest));
      if (nearest) this.prompt.setPosition(nearest.x, nearest.y - 64);
      if (nearest) this.prompt.setText(nearest.kind === "character" ? `E · Talk to ${nearest.data.name}` : nearest.kind === "door" ? `E · ${nearest.data.label}` : `E · Inspect ${nearest.data.label}`);
    }
    if (nearest && this.eKey && Phaser.Input.Keyboard.JustDown(this.eKey)) {
      if (nearest.kind === "character") this.talk(nearest.data);
      else if (nearest.kind === "prop") this.inspect(nearest.data);
      else nearest.data.action();
    }
    this.updateObjectiveChevron();
  }

  setObjectiveTarget(target: { kind: "character" | "prop"; id: string } | null) {
    this.objectiveTarget = target;
  }

  setBaseSpeed(value: number) {
    this.baseSpeed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, value));
  }

  panTo(target: { kind: "character" | "prop"; id: string }) {
    const position = this.resolveTargetPosition(target);
    if (!position) return;
    this.cameras.main.pan(position.x, position.y, 360, "Quad.easeOut", true);
  }

  relocateCharacter(characterId: string, toZoneId: string) {
    if (this.mapMode !== "outdoor") return;
    const entry = this.characters.get(characterId);
    if (!entry) return;
    const zone = ZONES.find((candidate) => candidate.id === toZoneId);
    if (!zone) return;
    const fromX = entry.sprite.x;
    const fromY = entry.sprite.y;
    const toX = zone.spawn.x + (Math.random() - 0.5) * 80;
    const toY = zone.spawn.y + (Math.random() - 0.5) * 80;
    entry.origin = { x: toX, y: toY };
    entry.sprite.setPosition(toX, toY);
    entry.wander.target = null;
    entry.wander.nextAt = this.time.now + 1500;
    // Brief fade-flash at both ends so the relocation feels deliberate
    const ghost = this.add.text(fromX, fromY, "→", { fontFamily: "Cinzel, serif", fontSize: "22px", color: "#f8d44e" }).setOrigin(0.5).setDepth(28);
    this.tweens.add({ targets: ghost, alpha: 0, duration: 800, onComplete: () => ghost.destroy() });
    const arrival = this.add.text(toX, toY - 60, "↓", { fontFamily: "Cinzel, serif", fontSize: "24px", color: "#f8d44e" }).setOrigin(0.5).setDepth(28);
    this.tweens.add({ targets: arrival, alpha: 0, y: arrival.y - 24, duration: 1200, onComplete: () => arrival.destroy() });
  }

  hideCharacter(characterId: string) {
    const entry = this.characters.get(characterId);
    if (!entry) return;
    entry.sprite.setVisible(false);
    entry.tag.setVisible(false);
    entry.prompt.setVisible(false);
    if (entry.bubble) {
      entry.bubble.container.destroy();
      entry.bubble = null;
    }
  }

  enactChallenge(aggressorId: string, targetId: string, winnerId: string) {
    const aggressor = this.characters.get(aggressorId);
    const target = this.characters.get(targetId);
    if (!aggressor || !target) return;
    // Face each other
    this.faceTowards(aggressorId, target.sprite.x, target.sprite.y);
    this.faceTowards(targetId, aggressor.sprite.x, aggressor.sprite.y);
    // Pulse a "vs" label between them
    const midX = (aggressor.sprite.x + target.sprite.x) / 2;
    const midY = (aggressor.sprite.y + target.sprite.y) / 2 - 30;
    const vs = this.add.text(midX, midY, "VS", {
      fontFamily: "Cinzel, serif",
      fontSize: "20px",
      color: "#ff8a65",
      stroke: "#21170f",
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(28);
    this.tweens.add({
      targets: vs,
      scale: { from: 0.4, to: 1.3 },
      alpha: { from: 1, to: 0 },
      duration: 1100,
      onComplete: () => vs.destroy(),
    });
    // Settle: winner bubbles a short brag, loser stops moving for a bit
    const winner = this.characters.get(winnerId);
    if (winner) {
      this.showBubble(winnerId, winnerId === aggressorId ? "Told you." : "Lucky read.", 2400);
    }
    const loser = winnerId === aggressorId ? target : aggressor;
    loser.wander.nextAt = this.time.now + 5000;
  }

  private updateObjectiveChevron() {
    if (!this.objectiveChevron) return;
    if (!this.objectiveTarget) { this.objectiveChevron.setVisible(false); return; }
    const position = this.resolveTargetPosition(this.objectiveTarget);
    if (!position) { this.objectiveChevron.setVisible(false); return; }
    this.objectiveChevron.setVisible(true);
    this.objectiveChevron.setPosition(position.x, position.y - 72);
  }

  private resolveTargetPosition(target: { kind: "character" | "prop"; id: string }): { x: number; y: number } | null {
    if (target.kind === "character") {
      const entry = this.characters.get(target.id);
      if (!entry || !entry.sprite.visible) return null;
      return { x: entry.sprite.x, y: entry.sprite.y };
    }
    const entry = this.props.get(target.id);
    if (!entry || !entry.marker.visible) return null;
    return { x: entry.marker.x, y: entry.marker.y };
  }

  focusCharacter(id: string) {
    const character = this.characters.get(id);
    if (!character) return;
    this.selectedId = id;
    this.movePlayerNear(character.sprite.x, character.sprite.y);
  }

  focusProp(id: string) {
    const prop = this.props.get(id);
    if (!prop) return;
    this.movePlayerNear(prop.marker.x, prop.marker.y);
  }

  enterHeroHq() {
    this.switchRoom("hqInterior");
  }

  exitHeroHq() {
    this.switchRoom("outdoor");
  }

  switchRoom(mapMode: MapMode) {
    this.switchMap(mapMode);
  }

  goToZone(zoneId: string) {
    const zone = ZONES.find((candidate) => candidate.id === zoneId);
    if (!zone) return;
    this.currentSnapshot = { ...this.currentSnapshot, activeZone: zone.id };
    if (this.mapMode !== "outdoor") {
      this.currentSnapshot = { ...this.currentSnapshot, activeZone: zone.id };
      this.switchMap("outdoor");
      return;
    }
    if (!this.player) return;
    this.player.setPosition(zone.spawn.x, zone.spawn.y);
    this.target = null;
    this.cameras.main.pan(zone.focus.x, zone.focus.y, 280, "Quad.easeOut", true);
  }

  applySnapshot(snapshot: StorySnapshot) {
    this.currentSnapshot = snapshot;
    this.alertTint?.setAlpha(snapshot.flags.alertRaised ? 0.08 : 0);
    for (const entry of this.props.values()) {
      const visible = propVisible(entry.data, snapshot.flags);
      entry.marker.setVisible(visible);
      entry.tag.setVisible(visible);
      entry.prompt.setVisible(visible);
    }
    for (const entry of this.characters.values()) {
      const zone = ZONES.find((candidate) => candidate.id === entry.data.zoneId);
      const unlocked = !zone || zoneUnlocked(zone, snapshot.flags);
      entry.sprite.setVisible(unlocked);
      entry.tag.setVisible(unlocked);
      entry.prompt.setVisible(unlocked);
    }
  }

  private addCharacter(character: CastMember) {
    const position = this.characterPosition(character);
    if (!position) return;
    const sprite = this.physics.add.sprite(position.x, position.y, character.sprite, frameFor("down"));
    sprite.setScale(this.mapConfig().characterScale);
    sprite.setDepth(9);
    sprite.setInteractive({ useHandCursor: true });
    configureBody(sprite);
    if (this.collisionGroup) this.physics.add.collider(sprite, this.collisionGroup);
    sprite.play(`${character.sprite}:idle-down`);
    sprite.on("pointerup", () => {
      this.selectedId = character.id;
      this.target = { x: sprite.x, y: sprite.y + 38 };
      this.talk(character);
    });
    const tag = this.add.text(position.x, position.y + 34, character.name, {
      fontFamily: "Montserrat, sans-serif",
      fontSize: "11px",
      color: "#f6f1e8",
      backgroundColor: "rgba(11, 18, 32, 0.78)",
      padding: { x: 6, y: 3 },
    }).setOrigin(0.5, 0).setDepth(24);
    const prompt = this.add.text(position.x, position.y - 42, "!", {
      fontFamily: "Montserrat, sans-serif",
      fontSize: "18px",
      color: "#1f2937",
      backgroundColor: "#f8d44e",
      padding: { x: 7, y: 1 },
    }).setOrigin(0.5).setDepth(24);
    this.characters.set(character.id, {
      data: character,
      sprite,
      prompt,
      tag,
      origin: { x: position.x, y: position.y },
      wander: { target: null, nextAt: this.time.now + 1500 + Math.random() * 2000, facing: "down" },
      bubble: null,
    });
  }

  private createWorldLayers(map: Phaser.Tilemaps.Tilemap, tilesets: Phaser.Tilemaps.Tileset[]) {
    for (const layerName of ["ground", "detail", "structures", "canopy", "floor", "walls", "furniture", "objects"]) {
      if (!map.getLayer(layerName)) continue;
      const layer = map.createLayer(layerName, tilesets, 0, 0);
      layer?.setDepth(layerName === "canopy" ? 18 : layerName === "objects" || layerName === "structures" ? 4 : 1);
    }
    if (map.getLayer("overhead")) {
      const overhead = map.createLayer("overhead", tilesets, 0, 0);
      overhead?.setDepth(20);
    }
    const collisions = map.getObjectLayer("collisions")?.objects ?? [];
    for (const object of collisions) {
      const body = this.add.rectangle(
        (object.x ?? 0) + (object.width ?? 0) / 2,
        (object.y ?? 0) + (object.height ?? 0) / 2,
        object.width ?? 0,
        object.height ?? 0,
        0x000000,
        0,
      );
      this.physics.add.existing(body, true);
      this.collisionGroup?.add(body);
    }
  }

  private applyRoomTint(width: number, height: number) {
    const palette = ROOM_PALETTE[this.mapMode] ?? ROOM_PALETTE.hqInterior;
    this.add.rectangle(0, 0, width, height, palette.tint, palette.alpha).setOrigin(0).setDepth(3).setScrollFactor(1);
    this.cameras.main.setBackgroundColor(palette.bg);
  }

  private addPermanentRoomSign() {
    const palette = ROOM_PALETTE[this.mapMode] ?? ROOM_PALETTE.hqInterior;
    // Floating top-of-screen badge that stays for the whole room visit
    const camera = this.cameras.main;
    this.add.text(camera.width / 2, 28, palette.label, {
      fontFamily: "Cinzel, serif",
      fontSize: "16px",
      color: palette.signColor,
      backgroundColor: palette.signBg,
      padding: { x: 16, y: 6 },
    }).setOrigin(0.5).setDepth(50).setScrollFactor(0);
  }

  private paintRoomDressing() {
    const props = ROOM_DRESSING[this.mapMode];
    if (!props) return;
    for (const prop of props) {
      if (prop.kind === "rect") {
        const rect = this.add.rectangle(prop.x, prop.y, prop.w ?? 32, prop.h ?? 32, prop.color, 0.92).setDepth(2);
        if (prop.outline !== undefined) rect.setStrokeStyle(2, prop.outline, 0.85);
        if (prop.label) {
          this.add.text(prop.x, prop.y, prop.label, {
            fontFamily: "Montserrat, sans-serif",
            fontSize: "10px",
            color: toCssColor(prop.labelColor ?? 0xffffff),
            fontStyle: "bold",
          }).setOrigin(0.5).setDepth(3);
        }
      } else if (prop.kind === "circle") {
        const circle = this.add.circle(prop.x, prop.y, prop.r ?? 20, prop.color, 0.85).setDepth(2);
        if (prop.outline !== undefined) circle.setStrokeStyle(2, prop.outline, 0.85);
        if (prop.pulse) {
          this.tweens.add({ targets: circle, alpha: { from: 0.85, to: 0.45 }, duration: 700, yoyo: true, repeat: -1 });
        }
      } else if (prop.kind === "label") {
        this.add.text(prop.x, prop.y, prop.label ?? "", {
          fontFamily: "Montserrat, sans-serif",
          fontSize: "12px",
          color: toCssColor(prop.labelColor ?? prop.color),
          backgroundColor: prop.kind === "label" ? toCssColor(prop.color) : undefined,
          padding: { x: 8, y: 4 },
          fontStyle: "bold",
        }).setOrigin(0.5).setDepth(3);
      }
    }
  }

  private addZoneLabels() {
    for (const zone of ZONES) {
      this.add.text(zone.focus.x, zone.focus.y - 104, zone.name, {
        fontFamily: "Montserrat, sans-serif",
        fontSize: "11px",
        color: "#f6f1e8",
        backgroundColor: "rgba(11, 18, 32, 0.72)",
        padding: { x: 7, y: 4 },
      }).setOrigin(0.5).setDepth(25);
    }
  }

  private addProp(prop: WorldProp) {
    const position = this.propPosition(prop);
    if (!position) return;
    const base = this.add.circle(0, 0, 15, prop.color, 0.95);
    const label = this.add.text(0, 0, prop.symbol, {
      fontFamily: "Montserrat, sans-serif",
      fontSize: "15px",
      color: "#111827",
      fontStyle: "bold",
    }).setOrigin(0.5);
    const marker = this.add.container(position.x, position.y, [base, label]).setDepth(14).setSize(34, 34);
    marker.setInteractive(new Phaser.Geom.Circle(0, 0, 22), Phaser.Geom.Circle.Contains);
    marker.on("pointerup", () => {
      this.target = { x: position.x, y: position.y + 34 };
      this.inspect(prop);
    });
    const tag = this.add.text(position.x, position.y + 21, prop.label, {
      fontFamily: "Montserrat, sans-serif",
      fontSize: "11px",
      color: "#f6f1e8",
      backgroundColor: "rgba(11, 18, 32, 0.78)",
      padding: { x: 6, y: 3 },
    }).setOrigin(0.5, 0).setDepth(24);
    const prompt = this.add.text(position.x, position.y - 30, "?", {
      fontFamily: "Montserrat, sans-serif",
      fontSize: "16px",
      color: "#1f2937",
      backgroundColor: "#f8d44e",
      padding: { x: 7, y: 1 },
    }).setOrigin(0.5).setDepth(24);
    this.props.set(prop.id, { data: prop, marker, tag, prompt });
  }

  private addDoor(id: string, labelText: string, x: number, y: number, action: () => void) {
    const base = this.add.rectangle(0, 0, 42, 22, 0xf8d44e, 0.92).setStrokeStyle(1, 0x21170f, 0.55);
    const label = this.add.text(0, 0, "IN", {
      fontFamily: "Montserrat, sans-serif",
      fontSize: "12px",
      color: "#21170f",
      fontStyle: "bold",
    }).setOrigin(0.5);
    const marker = this.add.container(x, y, [base, label]).setDepth(14).setSize(46, 28);
    marker.setInteractive(new Phaser.Geom.Rectangle(-23, -14, 46, 28), Phaser.Geom.Rectangle.Contains);
    marker.on("pointerup", action);
    const tag = this.add.text(x, y + 20, labelText, {
      fontFamily: "Montserrat, sans-serif",
      fontSize: "11px",
      color: "#f6f1e8",
      backgroundColor: "rgba(11, 18, 32, 0.78)",
      padding: { x: 6, y: 3 },
    }).setOrigin(0.5, 0).setDepth(24);
    this.doors.set(id, { label: labelText, x, y, marker, tag, action });
  }

  private movePlayerNear(x: number, y: number) {
    if (!this.player) return;
    if (this.mapMode !== "outdoor") {
      this.switchMap("outdoor");
      return;
    }
    this.player.setPosition(x, y + 42);
    this.target = null;
    this.cameras.main.pan(x, y, 220, "Quad.easeOut", true);
  }

  private inputVector() {
    let x = 0;
    let y = 0;
    if (this.cursors?.left.isDown || this.keys?.["A"]?.isDown) x -= 1;
    if (this.cursors?.right.isDown || this.keys?.["D"]?.isDown) x += 1;
    if (this.cursors?.up.isDown || this.keys?.["W"]?.isDown) y -= 1;
    if (this.cursors?.down.isDown || this.keys?.["S"]?.isDown) y += 1;
    if (x !== 0 && y !== 0) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    return { x, y };
  }

  private setFacing(vector: { x: number; y: number }) {
    if (Math.abs(vector.x) > Math.abs(vector.y)) this.facing = vector.x < 0 ? "left" : "right";
    else if (vector.y !== 0) this.facing = vector.y < 0 ? "up" : "down";
  }

  private syncAnimation() {
    if (!this.player) return;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const prefix = body.velocity.length() > 0 ? "walk" : "idle";
    const key = `${PLAYER_KEY}:${prefix}-${this.facing}`;
    if (this.player.anims.currentAnim?.key !== key) this.player.play(key);
  }

  private updateCharacterLabels() {
    const player = this.player;
    const NEAR = 170;
    for (const entry of this.characters.values()) {
      entry.tag.setPosition(entry.sprite.x, entry.sprite.y + 34);
      entry.prompt.setPosition(entry.sprite.x, entry.sprite.y - 42);
      entry.prompt.setVisible(entry.sprite.visible);
      const nearPlayer = !!player && Phaser.Math.Distance.Between(player.x, player.y, entry.sprite.x, entry.sprite.y) < NEAR;
      entry.tag.setVisible(entry.sprite.visible && nearPlayer);
    }
    for (const entry of this.props.values()) {
      entry.prompt.setPosition(entry.marker.x, entry.marker.y - 30);
      entry.prompt.setVisible(entry.marker.visible);
      const nearPlayer = !!player && Phaser.Math.Distance.Between(player.x, player.y, entry.marker.x, entry.marker.y) < NEAR;
      entry.tag.setVisible(entry.marker.visible && nearPlayer);
    }
    for (const entry of this.doors.values()) {
      const nearPlayer = !!player && Phaser.Math.Distance.Between(player.x, player.y, entry.x, entry.y) < NEAR;
      entry.tag.setVisible(nearPlayer);
    }
  }

  private highlightNearest(nearest: ReturnType<OfficePrototypeScene["nearestInteractable"]>) {
    const activeId = nearest?.kind === "character" ? nearest.data.id : nearest?.kind === "prop" ? nearest.data.id : null;
    for (const [id, entry] of this.characters) {
      if (!entry.prompt.visible) continue;
      const active = id === activeId;
      entry.prompt.setStyle({ backgroundColor: active ? "#8fcb7c" : "#f8d44e", fontSize: active ? "22px" : "18px" });
      entry.prompt.setScale(active ? 1.0 : 0.9);
    }
    for (const [id, entry] of this.props) {
      if (!entry.prompt.visible) continue;
      const active = id === activeId;
      entry.prompt.setStyle({ backgroundColor: active ? "#8fcb7c" : "#f8d44e", fontSize: active ? "20px" : "16px" });
      entry.prompt.setScale(active ? 1.0 : 0.9);
    }
  }

  bindMemoryHooks(read: () => MemoryStore, write: (next: MemoryStore) => void, overhear: (name: string, line: string) => void) {
    this.memorySource = read;
    this.memoryWriter = write;
    this.overhearReporter = overhear;
  }

  private showBubble(characterId: string, line: string, durationMs: number) {
    const entry = this.characters.get(characterId);
    if (!entry) return;
    if (entry.bubble) {
      entry.bubble.container.destroy();
      entry.bubble = null;
    }
    const maxWidth = 220;
    const padX = 10;
    const padY = 6;
    const text = this.add.text(0, 0, line, {
      fontFamily: "Montserrat, sans-serif",
      fontSize: "11px",
      color: "#fff4ca",
      wordWrap: { width: maxWidth },
    }).setOrigin(0.5, 1);
    const width = Math.min(maxWidth + padX * 2, text.width + padX * 2);
    const height = text.height + padY * 2;
    const bg = this.add.graphics();
    bg.fillStyle(0x130c08, 0.92);
    bg.lineStyle(1, 0xf8d44e, 0.55);
    bg.fillRoundedRect(-width / 2, -height, width, height, 6);
    bg.strokeRoundedRect(-width / 2, -height, width, height, 6);
    bg.beginPath();
    bg.moveTo(-6, 0);
    bg.lineTo(0, 8);
    bg.lineTo(6, 0);
    bg.closePath();
    bg.fillPath();
    bg.strokePath();
    text.setPosition(0, -padY);
    const container = this.add.container(entry.sprite.x, entry.sprite.y - 52, [bg, text]).setDepth(27);
    container.setAlpha(0);
    this.tweens.add({ targets: container, alpha: 1, duration: 160, ease: "Quad.easeOut" });
    entry.bubble = { container, background: bg, text, until: this.time.now + durationMs };
  }

  private updateBubbles() {
    const now = this.time.now;
    const worldBounds = this.physics.world.bounds;
    const halfBubbleWidth = 130;
    const margin = 20;
    for (const entry of this.characters.values()) {
      if (!entry.bubble) continue;
      const minX = worldBounds.x + halfBubbleWidth + margin;
      const maxX = worldBounds.right - halfBubbleWidth - margin;
      const x = Math.min(Math.max(entry.sprite.x, minX), maxX);
      const y = Math.max(entry.sprite.y - 52, worldBounds.y + margin + 40);
      entry.bubble.container.setPosition(x, y);
      if (now > entry.bubble.until) {
        const bubble = entry.bubble;
        entry.bubble = null;
        this.tweens.add({
          targets: bubble.container,
          alpha: 0,
          duration: 220,
          onComplete: () => bubble.container.destroy(),
        });
      }
    }
  }

  private faceTowards(entryId: string, targetX: number, targetY: number) {
    const entry = this.characters.get(entryId);
    if (!entry) return;
    const dx = targetX - entry.sprite.x;
    const dy = targetY - entry.sprite.y;
    const facing: Direction = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : (dy < 0 ? "up" : "down");
    entry.wander.facing = facing;
    const idleKey = `${entry.data.sprite}:idle-${facing}`;
    if (entry.sprite.anims.currentAnim?.key !== idleKey) entry.sprite.play(idleKey);
  }

  private tickGossip() {
    if (this.mapMode !== "outdoor" || !this.player) return;
    const now = this.time.now;
    this.updateBubbles();

    // Listener-turn fires
    if (this.gossipActive && now >= this.gossipActive.firesAt) {
      const exchange = this.gossipActive;
      this.gossipActive = null;
      const listener = this.characters.get(exchange.listenerId);
      if (listener) {
        this.showBubble(exchange.listenerId, exchange.line, 3200);
        if (exchange.observation) {
          const memories = this.memorySource();
          const listenerMem = memories[exchange.listenerId] ?? { observations: [], talkCount: 0, lastSeenAt: null };
          const nextMem = { ...listenerMem, observations: [exchange.observation, ...listenerMem.observations].slice(0, 12) };
          this.memoryWriter({ ...memories, [exchange.listenerId]: nextMem });
        }
        const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, listener.sprite.x, listener.sprite.y);
        if (distance < 220) this.overhearReporter(listener.data.name, exchange.line);
      }
      return;
    }

    if (now < this.gossipNextAt) return;
    // Find a pair near each other in the outdoor map (not player, not in rooms)
    const visible = [...this.characters.values()].filter((entry) => entry.sprite.visible && !entry.data.roomId);
    if (visible.length < 2) return;
    let speaker: typeof visible[number] | null = null;
    let listener: typeof visible[number] | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < visible.length; i += 1) {
      for (let j = i + 1; j < visible.length; j += 1) {
        const a = visible[i]!;
        const b = visible[j]!;
        const d = Phaser.Math.Distance.Between(a.sprite.x, a.sprite.y, b.sprite.x, b.sprite.y);
        const closeToPlayer = Phaser.Math.Distance.Between(a.sprite.x, a.sprite.y, this.player.x, this.player.y) < 100
          || Phaser.Math.Distance.Between(b.sprite.x, b.sprite.y, this.player.x, this.player.y) < 100;
        if (closeToPlayer) continue;
        if (d < 160 && d < best) {
          best = d;
          speaker = a;
          listener = b;
        }
      }
    }
    if (!speaker || !listener) {
      this.gossipNextAt = now + 4000;
      return;
    }

    const exchange = pickGossip(speaker.data, listener.data, {
      cast: [...this.characters.values()].map((entry) => entry.data),
      memories: this.memorySource(),
      now: Date.now(),
    });
    this.faceTowards(speaker.data.id, listener.sprite.x, listener.sprite.y);
    this.faceTowards(listener.data.id, speaker.sprite.x, speaker.sprite.y);
    this.showBubble(speaker.data.id, exchange.speakerLine, 3400);
    const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, speaker.sprite.x, speaker.sprite.y);
    if (distance < 220) this.overhearReporter(speaker.data.name, exchange.speakerLine);
    this.gossipActive = {
      listenerId: listener.data.id,
      line: exchange.listenerLine,
      firesAt: now + 1500,
      observation: exchange.observationForListener,
    };
    this.gossipNextAt = now + 16000 + Math.random() * 9000;
  }

  private tickWander() {
    if (this.mapMode !== "outdoor" || !this.player) return;
    const now = this.time.now;
    for (const entry of this.characters.values()) {
      if (!entry.sprite.visible || entry.data.roomId) continue;
      const sprite = entry.sprite;
      const body = sprite.body as Phaser.Physics.Arcade.Body | null;
      if (!body) continue;
      const distToPlayer = Phaser.Math.Distance.Between(sprite.x, sprite.y, this.player.x, this.player.y);
      const paused = distToPlayer < WANDER_PAUSE_NEAR_PLAYER;
      if (paused) {
        entry.wander.target = null;
        body.setVelocity(0, 0);
        const dxPlayer = this.player.x - sprite.x;
        const dyPlayer = this.player.y - sprite.y;
        const facePlayer: Direction = Math.abs(dxPlayer) > Math.abs(dyPlayer)
          ? (dxPlayer < 0 ? "left" : "right")
          : (dyPlayer < 0 ? "up" : "down");
        entry.wander.facing = facePlayer;
        const idleKey = `${entry.data.sprite}:idle-${facePlayer}`;
        if (sprite.anims.currentAnim?.key !== idleKey) sprite.play(idleKey);
        entry.wander.nextAt = now + 1200;
        continue;
      }
      if (!entry.wander.target && now >= entry.wander.nextAt) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 30 + Math.random() * WANDER_RADIUS;
        entry.wander.target = {
          x: entry.origin.x + Math.cos(angle) * distance,
          y: entry.origin.y + Math.sin(angle) * distance,
        };
      }
      const target = entry.wander.target;
      if (!target) {
        body.setVelocity(0, 0);
        const idleKey = `${entry.data.sprite}:idle-${entry.wander.facing}`;
        if (sprite.anims.currentAnim?.key !== idleKey) sprite.play(idleKey);
        continue;
      }
      const dx = target.x - sprite.x;
      const dy = target.y - sprite.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= 4) {
        entry.wander.target = null;
        entry.wander.nextAt = now + 1800 + Math.random() * 2400;
        body.setVelocity(0, 0);
        continue;
      }
      const nx = dx / distance;
      const ny = dy / distance;
      body.setVelocity(nx * WANDER_SPEED, ny * WANDER_SPEED);
      const nextFacing: Direction = Math.abs(nx) > Math.abs(ny) ? (nx < 0 ? "left" : "right") : (ny < 0 ? "up" : "down");
      entry.wander.facing = nextFacing;
      const walkKey = `${entry.data.sprite}:walk-${nextFacing}`;
      if (sprite.anims.currentAnim?.key !== walkKey) sprite.play(walkKey);
    }
  }

  private nearestInteractable():
    | { kind: "character"; data: CastMember; x: number; y: number }
    | { kind: "prop"; data: WorldProp; x: number; y: number }
    | { kind: "door"; data: DoorEntry; x: number; y: number }
    | null {
    if (!this.player) return null;
    let nearest:
      | { kind: "character"; data: CastMember; x: number; y: number }
      | { kind: "prop"; data: WorldProp; x: number; y: number }
      | { kind: "door"; data: DoorEntry; x: number; y: number }
      | null = null;
    let distance = Number.POSITIVE_INFINITY;
    for (const entry of this.doors.values()) {
      const candidateDistance = Phaser.Math.Distance.Between(this.player.x, this.player.y, entry.x, entry.y);
      if (candidateDistance < distance) {
        nearest = { kind: "door", data: entry, x: entry.x, y: entry.y };
        distance = candidateDistance;
      }
    }
    if (nearest?.kind === "door" && distance <= INTERACT_DISTANCE) return nearest;
    for (const entry of this.characters.values()) {
      if (!entry.sprite.visible) continue;
      const candidateDistance = Phaser.Math.Distance.Between(this.player.x, this.player.y, entry.sprite.x, entry.sprite.y);
      if (candidateDistance < distance) {
        nearest = { kind: "character", data: entry.data, x: entry.sprite.x, y: entry.sprite.y };
        distance = candidateDistance;
      }
    }
    for (const entry of this.props.values()) {
      if (!entry.marker.visible) continue;
      const candidateDistance = Phaser.Math.Distance.Between(this.player.x, this.player.y, entry.marker.x, entry.marker.y);
      if (candidateDistance < distance) {
        nearest = { kind: "prop", data: entry.data, x: entry.marker.x, y: entry.marker.y };
        distance = candidateDistance;
      }
    }
    return distance <= INTERACT_DISTANCE ? nearest : null;
  }

  private talk(character: CastMember) {
    this.selectedId = character.id;
    this.onTalk(character);
  }

  private inspect(prop: WorldProp) {
    this.onInspect(prop);
  }

  private switchMap(mapMode: MapMode) {
    let spawnOverride: { x: number; y: number } | null = null;
    if (mapMode === "outdoor" && this.mapMode !== "outdoor") {
      const exit = INTERIOR_EXIT_POSITION[this.mapMode];
      if (exit) {
        spawnOverride = { x: exit.x, y: exit.y };
        this.currentSnapshot = { ...this.currentSnapshot, activeZone: exit.zoneId };
      }
    } else if (mapMode !== "outdoor") {
      this.currentSnapshot = { ...this.currentSnapshot, activeZone: zoneForMapMode(mapMode) };
    }
    this.mapMode = mapMode;
    this.onMapMode(mapMode);
    this.scene.restart({
      mapMode,
      snapshot: this.currentSnapshot,
      selectedId: this.selectedId,
      spawnOverride,
    });
  }

  private mapConfig(): {
    key: string;
    width: number;
    height: number;
    zoom: number;
    characterScale: number;
    spawn: { x: number; y: number };
    tilesets: readonly (readonly [string, string])[];
  } {
    if (this.mapMode !== "outdoor") {
      return {
        key: OFFICE_MAP_KEY,
        width: OFFICE_WORLD_WIDTH,
        height: OFFICE_WORLD_HEIGHT,
        zoom: 0.9,
        characterScale: 0.86,
        spawn: { x: 610, y: 760 },
        tilesets: OFFICE_TILESETS,
      };
    }
    const zone = ZONES.find((candidate) => candidate.id === this.currentSnapshot.activeZone) ?? ZONES[0]!;
    return {
      key: MAP_KEY,
      width: WORLD_WIDTH,
      height: WORLD_HEIGHT,
      zoom: 1.5,
      characterScale: CHARACTER_SCALE,
      spawn: this.spawnOverride ?? zone.spawn,
      tilesets: OUTDOOR_TILESETS,
    };
  }

  private characterPosition(character: CastMember): { x: number; y: number } | null {
    if (this.mapMode === "outdoor") return character.roomId ? null : { x: character.x, y: character.y };
    if (character.roomId !== this.mapMode) return null;
    const interiorPositions: Record<string, { x: number; y: number }> = {
      hq_dispatcher: { x: 420, y: 310 },
      records_clerk: { x: 565, y: 285 },
      market_keeper: { x: 420, y: 310 },
      ramen_vendor: { x: 565, y: 440 },
      dojo_attendant: { x: 520, y: 405 },
      alley_watch: { x: 520, y: 405 },
    };
    return interiorPositions[character.id] ?? null;
  }

  private propPosition(prop: WorldProp): { x: number; y: number } | null {
    if (this.mapMode === "outdoor") return prop.roomId ? null : { x: prop.x, y: prop.y };
    if (prop.roomId !== this.mapMode) return null;
    const interiorPositions: Record<string, { x: number; y: number }> = {
      hq_case_file: { x: 650, y: 320 },
      market_ledger: { x: 480, y: 390 },
      dojo_bell: { x: 610, y: 480 },
      gate_report: { x: 610, y: 480 },
    };
    return interiorPositions[prop.id] ?? null;
  }
}

function reduceCharacterTalk(snapshot: StorySnapshot, character: CastMember): { snapshot: StorySnapshot; entries: string[] } {
  if (character.id === "saitama" && snapshot.flags.couponFound && !snapshot.flags.couponReturned) {
    const flags = { ...snapshot.flags, couponReturned: true };
    return {
      snapshot: {
        ...snapshot,
        flags,
        inventory: snapshot.inventory.filter((item) => item !== "Grocery coupon"),
        activeZone: "hq",
        objective: nextObjective(flags),
      },
      entries: ["Saitama takes the coupon. Market Street opens and the alert board starts flashing."],
    };
  }
  if (character.id === "sonic" && snapshot.flags.sonicChallenged) {
    return { snapshot, entries: ["Sonic accepts the confrontation. The duel can become the next combat slice."] };
  }
  return { snapshot, entries: [`${character.name} is now available as a conversation lead.`] };
}

function reducePropInspect(snapshot: StorySnapshot, prop: WorldProp): { snapshot: StorySnapshot; entries: string[] } {
  const missing = (prop.requires ?? []).filter((flag) => !snapshot.flags[flag]);
  if (missing.length > 0) {
    return { snapshot, entries: [`${prop.label} is not useful yet.`] };
  }
  const flags = { ...snapshot.flags };
  for (const flag of prop.grants ?? []) flags[flag] = true;
  const inventory = prop.givesItem && !snapshot.inventory.includes(prop.givesItem)
    ? [...snapshot.inventory, prop.givesItem]
    : snapshot.inventory;
  const nextZone = prop.id === "challenge_mark" ? "alley" : snapshot.activeZone;
  return {
    snapshot: {
      ...snapshot,
      flags,
      inventory,
      activeZone: nextZone,
      objective: nextObjective(flags),
    },
    entries: [prop.inspectText],
  };
}

function primaryStoryAction(snapshot: StorySnapshot):
  | { kind: "prop"; label: string; prop: WorldProp }
  | { kind: "character"; label: string; characterId: string }
  | null {
  if (!snapshot.flags.couponFound) return { kind: "prop", label: "Inspect coupon box", prop: PROPS.find((prop) => prop.id === "coupon_box")! };
  if (!snapshot.flags.couponReturned) return { kind: "character", label: "Give coupon to Saitama", characterId: "saitama" };
  if (!snapshot.flags.alertRaised) return { kind: "prop", label: "Inspect alert board", prop: PROPS.find((prop) => prop.id === "alert_board")! };
  if (!snapshot.flags.sonicChallenged) return { kind: "prop", label: "Inspect challenge mark", prop: PROPS.find((prop) => prop.id === "challenge_mark")! };
  return { kind: "character", label: "Talk to Sonic", characterId: "sonic" };
}

function questSteps(snapshot: StorySnapshot): Array<{ label: string; hint: string; done: boolean; current: boolean }> {
  return [
    {
      label: "Recover the missing grocery coupon.",
      hint: "Hero HQ plaza · yellow $ marker",
      done: snapshot.flags.couponFound,
      current: !snapshot.flags.couponFound,
    },
    {
      label: "Bring the coupon to Saitama.",
      hint: "Hero HQ plaza · Saitama is by the fountain",
      done: snapshot.flags.couponReturned,
      current: snapshot.flags.couponFound && !snapshot.flags.couponReturned,
    },
    {
      label: "Inspect the Hero Association alert board.",
      hint: "Hero HQ plaza · blue ! marker east of Saitama",
      done: snapshot.flags.alertRaised,
      current: snapshot.flags.couponReturned && !snapshot.flags.alertRaised,
    },
    {
      label: "Trace Sonic's challenge mark in Monster Alley.",
      hint: "Monster Alley · purple X marker, far south-east",
      done: snapshot.flags.sonicChallenged,
      current: snapshot.flags.alertRaised && !snapshot.flags.sonicChallenged,
    },
    {
      label: "Confront Sonic in Monster Alley.",
      hint: "Monster Alley · Sonic the Sound-Speed Ninja",
      done: false,
      current: snapshot.flags.sonicChallenged,
    },
  ];
}

function zoneForMapMode(mapMode: MapMode) {
  if (mapMode === "marketInterior") return "market";
  if (mapMode === "alleyInterior") return "alley";
  return "hq";
}

function toCssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, "0")}`;
}

function configureBody(sprite: Phaser.Physics.Arcade.Sprite) {
  const body = sprite.body as Phaser.Physics.Arcade.Body;
  body.setSize(FRAME_WIDTH * 0.5, FRAME_HEIGHT * 0.2);
  body.setOffset(FRAME_WIDTH * 0.25, FRAME_HEIGHT * 0.75);
}

function createCharacterAnimations(scene: Phaser.Scene, spriteKey: string) {
  if (scene.anims.exists(`${spriteKey}:idle-down`)) return;
  for (const [row, prefix, rate] of [[1, "idle", 8], [2, "walk", 10]] as const) {
    DIRECTIONS.forEach((direction, index) => {
      scene.anims.create({
        key: `${spriteKey}:${prefix}-${direction}`,
        frames: scene.anims.generateFrameNumbers(spriteKey, {
          start: row * SHEET_COLUMNS + index * FRAMES_PER_DIR,
          end: row * SHEET_COLUMNS + index * FRAMES_PER_DIR + FRAMES_PER_DIR - 1,
        }),
        frameRate: rate,
        repeat: -1,
      });
    });
  }
}

function createArrowAnimation(scene: Phaser.Scene) {
  if (scene.anims.exists("agent-town-arrow-bounce")) return;
  scene.anims.create({
    key: "agent-town-arrow-bounce",
    frames: scene.anims.generateFrameNumbers("agent-town-arrow", { start: 0, end: 5 }),
    frameRate: 6,
    repeat: -1,
  });
}

function frameFor(direction: Direction): number {
  return SHEET_COLUMNS + DIRECTIONS.indexOf(direction) * FRAMES_PER_DIR;
}

function promptStyle(): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: "Montserrat, sans-serif",
    fontSize: "14px",
    color: "#1f2937",
    backgroundColor: "#f8d44e",
    padding: { x: 8, y: 4 },
  };
}
