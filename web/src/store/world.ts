import { create } from "zustand";

import type { AgentLoopStatus } from "../../../src/agent-loop.ts";
import { type CombatMove,combatMoveFor } from "../../../src/combat.ts";
import type { PlayerAction, TickSummary, World } from "../../../src/types.ts";
import {
  fetchSnapshot,
  fetchState,
  fetchStoryPackage,
  importStoryPackage,
  importWorldSource,
  postTick,
  restoreSnapshot,
  type Snapshot,
} from "../api/client.ts";
import { playActionCues, updateMusicMood } from "../audio.ts";

export interface BubbleEvent {
  id: number;
  actorId: string | null;
  sourceActorId: string | null;
  text: string;
  fromDirector: boolean;
  actionType: TickSummary["actions"][number]["action"]["type"];
  combatStyle?: CombatMove["style"];
  combatLabel?: string;
  combatTargetName?: string;
  combatHpBefore?: number;
  combatHpAfter?: number;
  combatHpMax?: number;
  startsAt: number;
  expiresAt: number;
}

interface WorldStore {
  world: World | null;
  loading: boolean;
  error: string | null;
  drawerNpcId: string | null;
  lastSummary: TickSummary | null;
  agentLoopStatus: AgentLoopStatus | null;
  bubbles: BubbleEvent[];
  zoom: number;
  init: () => Promise<void>;
  send: (action: PlayerAction | null) => Promise<void>;
  saveSnapshot: () => Promise<Snapshot>;
  exportStoryPackage: () => Promise<Awaited<ReturnType<typeof fetchStoryPackage>>>;
  restoreFromJson: (text: string) => Promise<void>;
  importWorldSourceFromJson: (text: string) => Promise<void>;
  refreshFromServer: (summary?: TickSummary | null) => Promise<void>;
  applyServerTick: (world: World, summary: TickSummary) => void;
  setAgentLoopStatus: (status: AgentLoopStatus | null) => void;
  setZoom: (zoom: number) => void;
  openDrawer: (npcId: string) => void;
  closeDrawer: () => void;
  clearError: () => void;
  pruneBubbles: (now: number) => void;
}

let bubbleSeq = 0;

export const useWorldStore = create<WorldStore>((set, get) => ({
  world: null,
  loading: false,
  error: null,
  drawerNpcId: null,
  lastSummary: null,
  agentLoopStatus: null,
  bubbles: [],
  zoom: 1.35,

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
      commitTick(set, get, res.state, res.summary, previousWorld);
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
    const result = isStoryPackage(parsed)
      ? await importStoryPackage(parsed)
      : await restoreSnapshot(parsed as Snapshot);
    updateMusicMood(result.state.storyProgress?.phase ? { worldId: result.state.id, phase: result.state.storyProgress.phase } : { worldId: result.state.id });
    set({ world: result.state, agentLoopStatus: result.agentLoopStatus ?? null, error: null, bubbles: [], lastSummary: null });
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
    const result = await importWorldSource(source as never);
    updateMusicMood(result.state.storyProgress?.phase ? { worldId: result.state.id, phase: result.state.storyProgress.phase } : { worldId: result.state.id });
    set({ world: result.state, agentLoopStatus: result.agentLoopStatus ?? null, error: null, bubbles: [], lastSummary: null, drawerNpcId: null });
  },

  async refreshFromServer(summary = null) {
    const world = await fetchState();
    updateMusicMood(world.storyProgress?.phase ? { worldId: world.id, phase: world.storyProgress.phase } : { worldId: world.id });
    if (summary && summary.tick === world.tick) {
      commitTick(set, get, world, summary, get().world);
      return;
    }
    set({ world, error: null, lastSummary: null, bubbles: [] });
  },

  applyServerTick(world, summary) {
    updateMusicMood(world.storyProgress?.phase ? { worldId: world.id, phase: world.storyProgress.phase } : { worldId: world.id });
    playActionCues(summary.actions, world);
    commitTick(set, get, world, summary, get().world);
  },
  setAgentLoopStatus(status) {
    set({ agentLoopStatus: status });
  },
  setZoom(zoom) {
    set({ zoom });
  },

  openDrawer(npcId) {
    set({ drawerNpcId: npcId });
  },
  closeDrawer() {
    set({ drawerNpcId: null });
  },
  clearError() {
    set({ error: null });
  },
  pruneBubbles(now) {
    set({ bubbles: get().bubbles.filter((b) => b.expiresAt > now) });
  },
}));

function commitTick(
  set: (partial: Partial<WorldStore>) => void,
  get: () => WorldStore,
  world: World,
  summary: TickSummary,
  previousWorld: World | null
): void {
  const now = performance.now();
  const expires = now + 4200;
  const newBubbles = summary.actions.flatMap((entry) => {
    const action = entry.action;
    const combatMove = action.type === "fight" ? combatMoveFor(world, action.moveId) : null;
    let combatTarget: World["npcs"][number] | null = null;
    let previousCombatTarget: World["npcs"][number] | null = null;
    if (action.type === "fight") {
      combatTarget = world.npcs.find((npc) => npc.id === action.targetId) ?? null;
      previousCombatTarget = previousWorld?.npcs.find((npc) => npc.id === action.targetId) ?? null;
    }
    const targetIsPlayer = action.type === "fight" && action.targetId === "player";
    const primary: BubbleEvent = {
      id: ++bubbleSeq,
      actorId: bubbleActorId(entry),
      sourceActorId: action.actorId ?? null,
      text: bubbleText(entry),
      fromDirector: Boolean(entry.fromDirector),
      actionType: entry.action.type,
      combatStyle: combatMove?.style,
      combatLabel: combatMove?.label,
      combatTargetName: targetIsPlayer ? world.player.name ?? "Player" : combatTarget?.name,
      combatHpBefore: targetIsPlayer ? previousWorld?.player.combat?.hp : previousCombatTarget?.combat?.hp,
      combatHpAfter: targetIsPlayer ? world.player.combat?.hp : combatTarget?.combat?.hp,
      combatHpMax: targetIsPlayer ? world.player.combat?.maxHp : combatTarget?.combat?.maxHp,
      startsAt: now,
      expiresAt: expires,
    };
    const counter = counterBubbleForPlayerAttack(world, previousWorld, entry, now, expires);
    return counter ? [primary, counter] : [primary];
  });
  set({
    world,
    error: null,
    lastSummary: summary,
    bubbles: [...get().bubbles, ...newBubbles],
  });
}

function counterBubbleForPlayerAttack(
  world: World,
  previousWorld: World | null,
  entry: TickSummary["actions"][number],
  now: number,
  expires: number
): BubbleEvent | null {
  const action = entry.action;
  if (action.type !== "fight" || action.actorId !== "player" || action.targetId === "player") return null;
  const previousHp = previousWorld?.player.combat?.hp ?? world.player.combat?.maxHp ?? 120;
  const nextHp = world.player.combat?.hp ?? previousHp;
  if (nextHp >= previousHp) return null;
  const attacker = world.npcs.find((npc) => npc.id === action.targetId);
  if (!attacker || attacker.combat?.defeated) return null;
  return {
    id: ++bubbleSeq,
    actorId: "player",
    sourceActorId: attacker.id,
    text: `${attacker.name} counters.`,
    fromDirector: false,
    actionType: "fight",
    combatStyle: "counter",
    combatLabel: "Counter",
    combatTargetName: world.player.name ?? "Player",
    combatHpBefore: previousHp,
    combatHpAfter: nextHp,
    combatHpMax: world.player.combat?.maxHp,
    startsAt: now + 520,
    expiresAt: expires + 520,
  };
}

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
