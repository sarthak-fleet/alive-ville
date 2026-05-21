import { create } from "zustand";

import { type CombatMove,combatMoveFor } from "../../../src/combat.ts";
import type { PlayerAction, TickSummary, World } from "../../../src/types.ts";
import { worldSourceToWorld } from "../../../src/world-ingest.ts";
import {
  fetchSnapshot,
  fetchState,
  fetchStoryPackage,
  importStoryPackage,
  postTick,
  restoreSnapshot,
  type Snapshot,
} from "../api/client.ts";
import { playActionCues, updateMusicMood } from "../audio.ts";

export interface BubbleEvent {
  id: number;
  actorId: string | null;
  text: string;
  fromDirector: boolean;
  actionType: TickSummary["actions"][number]["action"]["type"];
  combatStyle?: CombatMove["style"];
  combatLabel?: string;
  combatTargetName?: string;
  combatHpBefore?: number;
  combatHpAfter?: number;
  combatHpMax?: number;
  expiresAt: number;
}

interface WorldStore {
  world: World | null;
  loading: boolean;
  error: string | null;
  drawerNpcId: string | null;
  lastSummary: TickSummary | null;
  bubbles: BubbleEvent[];
  init: () => Promise<void>;
  send: (action: PlayerAction | null) => Promise<void>;
  saveSnapshot: () => Promise<Snapshot>;
  exportStoryPackage: () => Promise<Awaited<ReturnType<typeof fetchStoryPackage>>>;
  restoreFromJson: (text: string) => Promise<void>;
  importWorldSourceFromJson: (text: string) => Promise<void>;
  openDrawer: (npcId: string) => void;
  closeDrawer: () => void;
  pruneBubbles: (now: number) => void;
}

let bubbleSeq = 0;

export const useWorldStore = create<WorldStore>((set, get) => ({
  world: null,
  loading: false,
  error: null,
  drawerNpcId: null,
  lastSummary: null,
  bubbles: [],

  async init() {
    set({ loading: true, error: null });
    try {
      const world = await fetchState();
      updateMusicMood(world.storyProgress?.phase ? { worldId: world.id, phase: world.storyProgress.phase } : { worldId: world.id });
      set({ world, loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  async send(action) {
    try {
      const previousWorld = get().world;
      const res = await postTick(action);
      updateMusicMood(res.state.storyProgress?.phase ? { worldId: res.state.id, phase: res.state.storyProgress.phase } : { worldId: res.state.id });
      playActionCues(res.summary.actions, res.state);
      const expires = performance.now() + 4200;
      const newBubbles = res.summary.actions.map((entry) => {
        const action = entry.action;
        const combatMove = action.type === "fight" ? combatMoveFor(res.state, action.moveId) : null;
        let combatTarget: World["npcs"][number] | null = null;
        let previousCombatTarget: World["npcs"][number] | null = null;
        if (action.type === "fight") {
          combatTarget = res.state.npcs.find((npc) => npc.id === action.targetId) ?? null;
          previousCombatTarget = previousWorld?.npcs.find((npc) => npc.id === action.targetId) ?? null;
        }
        return {
          id: ++bubbleSeq,
          actorId: bubbleActorId(entry),
          text: bubbleText(entry),
          fromDirector: Boolean(entry.fromDirector),
          actionType: entry.action.type,
          combatStyle: combatMove?.style,
          combatLabel: combatMove?.label,
          combatTargetName: combatTarget?.name,
          combatHpBefore: previousCombatTarget?.combat?.hp,
          combatHpAfter: combatTarget?.combat?.hp,
          combatHpMax: combatTarget?.combat?.maxHp,
          expiresAt: expires,
        };
      });
      set({
        world: res.state,
        lastSummary: res.summary,
        bubbles: [...get().bubbles, ...newBubbles],
      });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  async saveSnapshot() {
    return fetchSnapshot();
  },

  async exportStoryPackage() {
    return fetchStoryPackage();
  },

  async restoreFromJson(text) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Save file is not valid JSON");
    }
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Save file is empty or malformed");
    }
    const world = isStoryPackage(parsed)
      ? await importStoryPackage(parsed)
      : await restoreSnapshot(parsed as Snapshot);
    updateMusicMood(world.storyProgress?.phase ? { worldId: world.id, phase: world.storyProgress.phase } : { worldId: world.id });
    set({ world, error: null, bubbles: [], lastSummary: null });
  },

  async importWorldSourceFromJson(text) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("World source file is not valid JSON");
    }
    if (!parsed || typeof parsed !== "object") {
      throw new Error("World source file is empty or malformed");
    }
    const source = "source" in parsed ? (parsed as { source?: unknown }).source : parsed;
    if (!source || typeof source !== "object") {
      throw new Error("World source is missing");
    }
    const draftWorld = worldSourceToWorld(source as never);
    const world = await restoreSnapshot(draftWorld);
    updateMusicMood(world.storyProgress?.phase ? { worldId: world.id, phase: world.storyProgress.phase } : { worldId: world.id });
    set({ world, error: null, bubbles: [], lastSummary: null, drawerNpcId: null });
  },

  openDrawer(npcId) {
    set({ drawerNpcId: npcId });
  },
  closeDrawer() {
    set({ drawerNpcId: null });
  },
  pruneBubbles(now) {
    set({ bubbles: get().bubbles.filter((b) => b.expiresAt > now) });
  },
}));

function isStoryPackage(value: unknown): value is Parameters<typeof importStoryPackage>[0] {
  return Boolean(value && typeof value === "object" && (value as { packageVersion?: unknown }).packageVersion === 1);
}

function bubbleActorId(entry: TickSummary["actions"][number]): string | null {
  if (entry.action.type === "fight") return entry.action.targetId;
  return entry.action.actorId;
}

function bubbleText(entry: TickSummary["actions"][number]): string {
  const a = entry.action;
  if (a.type === "talk" || a.type === "gossip" || a.type === "confront") {
    return (a as { text: string }).text;
  }
  return entry.text;
}
