import { create } from "zustand";

import type { Npc, PlayerAction, TickSummary, World } from "../../../src/types.ts";
import {
  fetchAgentLoopStatus,
  fetchState,
  importWorldSource,
  postTick,
  setAgentLoopRunning,
  subscribeEvents,
} from "../api/client.ts";
import { useDirectorStore } from "../director/store.ts";
import { useUiStore } from "./ui.ts";

export interface WorldEvent {
  id: number;
  actorId: string | null;
  text: string;
  actionType: TickSummary["actions"][number]["action"]["type"];
  fromDirector: boolean;
  expiresAt: number;
}

interface WorldStore {
  world: World | null;
  loading: boolean;
  error: string | null;
  lastSummary: TickSummary | null;
  sending: boolean;
  events: WorldEvent[];
  agentLoopRunning: boolean;
  importing: boolean;
  init: () => Promise<void>;
  connectLive: () => () => void;
  send: (action: PlayerAction) => Promise<TickSummary | null>;
  toggleAgentLoop: () => Promise<void>;
  importWorldFromJson: (text: string) => Promise<void>;
  pruneEvents: (now: number) => void;
  clearError: () => void;
}

let eventSeq = 0;

/** lazily imported to avoid a require cycle (combat store imports this store) */
async function markHostilesFrom(summary: TickSummary): Promise<void> {
  const { useCombatStore } = await import("../combat/store.ts");
  useCombatStore.getState().setHostileFromSummaryActions(summary.actions.map((entry) => entry.action));
}

async function resetCombatForWorld(): Promise<void> {
  const { useCombatStore } = await import("../combat/store.ts");
  const { clearFollowers } = await import("../characters/followers.ts");
  useCombatStore.getState().resetForWorld();
  clearFollowers();
}

function toastsFrom(summary: TickSummary): WorldEvent[] {
  const now = performance.now();
  return summary.actions.map((entry): WorldEvent => {
    const a = entry.action;
    const text = a.type === "talk" || a.type === "gossip" || a.type === "confront" ? a.text : entry.text;
    return {
      id: ++eventSeq,
      actorId: a.actorId ?? null,
      text,
      actionType: a.type,
      fromDirector: Boolean(entry.fromDirector),
      expiresAt: now + 6000,
    };
  });
}

const INITIATION_COOLDOWN_MS = 90_000;
let lastInitiationAt = Number.NEGATIVE_INFINITY;

/** the world talks back: a same-place NPC addressing the player opens the conversation */
async function maybeNpcInitiatesDialogue(summary: TickSummary, world: World): Promise<void> {
  const ui = useUiStore.getState();
  if (ui.gamePhase !== "playing" || ui.dialogueNpcId || ui.interiorBuildingId) return;
  if (useDirectorStore.getState().cutscene) return;
  const { useCombatStore } = await import("../combat/store.ts");
  if (Object.values(useCombatStore.getState().enemies).some((enemy) => enemy.hostile && !enemy.defeated)) return;
  if (performance.now() - lastInitiationAt < INITIATION_COOLDOWN_MS) return;
  for (const entry of summary.actions) {
    const action = entry.action as { type: string; actorId?: string; targetId?: string; text?: string };
    if (!["talk", "confront", "gossip"].includes(action.type)) continue;
    if (action.targetId !== "player" || !action.actorId || action.actorId === "player") continue;
    const npc = world.npcs.find((candidate) => candidate.id === action.actorId);
    if (!npc || npc.combat?.defeated || npc.locationId !== world.player.locationId) continue;
    lastInitiationAt = performance.now();
    useUiStore.getState().openDialogue(npc.id, action.text ?? entry.text);
    return;
  }
}

export const useWorldStore = create<WorldStore>((set, get) => ({
  world: null,
  loading: false,
  error: null,
  lastSummary: null,
  sending: false,
  events: [],
  agentLoopRunning: false,
  importing: false,

  async init() {
    set({ loading: true, error: null });
    try {
      const world = await fetchState();
      set({ world, loading: false });
      const status = await fetchAgentLoopStatus();
      if (status.state === "running") {
        set({ agentLoopRunning: true });
      } else {
        // the world is alive by default — the HUD chip is a pause override
        const started = await setAgentLoopRunning(true);
        set({ agentLoopRunning: started.state === "running" });
      }
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  connectLive() {
    return subscribeEvents({
      onTick: (summary) => {
        void (async () => {
          try {
            const prevWorld = get().world;
            const world = await fetchState();
            set({
              world,
              lastSummary: summary,
              events: [...get().events, ...toastsFrom(summary)],
            });
            useDirectorStore.getState().maybeTriggerFromSummary(summary, prevWorld, world);
            await maybeNpcInitiatesDialogue(summary, world);
            await markHostilesFrom(summary);
          } catch {
            // transient fetch failure; the next tick reconciles
          }
        })();
      },
      onWorldReplaced: () => {
        void (async () => {
          try {
            const world = await fetchState();
            set({ world, events: [], lastSummary: null, agentLoopRunning: false });
            useUiStore.getState().setInteriorBuildingId(null);
            await resetCombatForWorld();
          } catch {
            // transient fetch failure; the next tick reconciles
          }
        })();
      },
    });
  },

  async send(action) {
    if (get().sending) return null;
    set({ sending: true });
    try {
      const prevWorld = get().world;
      const res = await postTick(action);
      set({
        world: res.state,
        lastSummary: res.summary,
        events: [...get().events, ...toastsFrom(res.summary)],
        sending: false,
        error: null,
      });
      useDirectorStore.getState().maybeTriggerFromSummary(res.summary, prevWorld, res.state);
      void markHostilesFrom(res.summary);
      return res.summary;
    } catch (error) {
      set({ error: (error as Error).message, sending: false });
      return null;
    }
  },

  async toggleAgentLoop() {
    try {
      const status = await setAgentLoopRunning(!get().agentLoopRunning);
      set({ agentLoopRunning: status.state === "running" });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  async importWorldFromJson(text) {
    set({ importing: true });
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("World source is not valid JSON");
      }
      if (!parsed || typeof parsed !== "object") throw new Error("World source is empty or malformed");
      const source = "source" in parsed ? (parsed as { source?: unknown }).source : parsed;
      if (!source || typeof source !== "object") throw new Error("World source is missing");
      const result = await importWorldSource(source as never);
      set({ world: result.state, events: [], lastSummary: null, importing: false, error: null, agentLoopRunning: false });
      useUiStore.getState().setInteriorBuildingId(null);
      await resetCombatForWorld();
    } catch (error) {
      set({ importing: false });
      throw error;
    }
  },

  pruneEvents(now) {
    const events = get().events;
    if (events.some((event) => event.expiresAt <= now)) {
      set({ events: events.filter((event) => event.expiresAt > now) });
    }
  },

  clearError() {
    set({ error: null });
  },
}));

export function npcById(world: World | null, id: string | null): Npc | null {
  if (!world || !id) return null;
  return world.npcs.find((npc) => npc.id === id) ?? null;
}
