import { create } from 'zustand';

import type { Npc, PlayerAction, TickSummary, World } from '../../../src/types.ts';
import {
  type AgentLoopStepResponse,
  fetchAgentLoopStatus,
  fetchState,
  importWorldSource,
  loadSnapshot,
  postTick,
  setAgentLoopRunning,
  stepAgentLoop,
  subscribeEvents,
} from '../api/client.ts';
import type { AgentLoopStatus } from '../../../src/agent-loop.ts';
import { useBanterStore } from '../characters/banter.ts';
import { useDirectorStore } from '../director/store.ts';
import { useUiStore } from './ui.ts';

export interface WorldEvent {
  id: number;
  actorId: string | null;
  text: string;
  actionType: TickSummary['actions'][number]['action']['type'];
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
  agentLoopStatus: AgentLoopStatus | null;
  importing: boolean;
  lastNpcInitiationAt: number;
  init: () => Promise<void>;
  connectLive: () => () => void;
  send: (action: PlayerAction) => Promise<TickSummary | null>;
  refreshAgentLoopStatus: () => Promise<AgentLoopStatus | null>;
  toggleAgentLoop: () => Promise<void>;
  stepAgentLoopOnce: () => Promise<AgentLoopStepResponse | null>;
  importWorldFromJson: (text: string) => Promise<void>;
  loadFromSnapshot: (world: World) => Promise<void>;
  pruneEvents: (now: number) => void;
  clearError: () => void;
}

let eventSeq = 0;

/** lazily imported to avoid a require cycle (combat store imports this store) */
async function markHostilesFrom(summary: TickSummary): Promise<void> {
  const { useCombatStore } = await import('../combat/store.ts');
  useCombatStore
    .getState()
    .setHostileFromSummaryActions(summary.actions.map((entry) => entry.action));
}

export function resetTransientWorldUiState(): void {
  useWorldStore.setState({
    lastNpcInitiationAt: Number.NEGATIVE_INFINITY,
  });
  useUiStore.getState().setInteriorBuildingId(null);
  useUiStore.getState().closeDialogue();
  useUiStore.getState().setInteractionTarget(null);
}

async function resetCombatForWorld(): Promise<void> {
  const { useCombatStore } = await import('../combat/store.ts');
  const { clearFollowers } = await import('../characters/followers.ts');
  const { useDirectorStore: directorStore } = await import('../director/store.ts');
  const { useBanterStore: banterStore } = await import('../characters/banter.ts');
  useCombatStore.getState().resetForWorld();
  clearFollowers();
  directorStore.getState().reset();
  banterStore.getState().clear();
  useUiStore.getState().closeDialogue();
  useUiStore.getState().setInteractionTarget(null);
}

function toastsFrom(summary: TickSummary): WorldEvent[] {
  const now = performance.now();
  return summary.actions.map((entry): WorldEvent => {
    const a = entry.action;
    const text =
      a.type === 'talk' || a.type === 'gossip' || a.type === 'confront' ? a.text : entry.text;
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

/** NPC↔NPC talk becomes overhearable speech bubbles in the player's district */
function surfaceNpcBanter(summary: TickSummary, world: World): void {
  for (const entry of summary.actions) {
    const action = entry.action as {
      type: string;
      actorId?: string;
      targetId?: string;
      text?: string;
    };
    if (!['talk', 'gossip', 'confront'].includes(action.type)) continue;
    if (
      !action.actorId ||
      !action.targetId ||
      action.actorId === 'player' ||
      action.targetId === 'player'
    )
      continue;
    const actor = world.npcs.find((npc) => npc.id === action.actorId);
    if (!actor || actor.locationId !== world.player.locationId) continue;
    useBanterStore
      .getState()
      .show(action.actorId, action.targetId, action.text ?? entry.text, action.type === 'confront');
  }
}

const INITIATION_COOLDOWN_MS = 90_000;

/** the world talks back: a same-place NPC addressing the player opens the conversation */
async function maybeNpcInitiatesDialogue(summary: TickSummary, world: World): Promise<void> {
  const ui = useUiStore.getState();
  if (ui.gamePhase !== 'playing' || ui.dialogueNpcId || ui.interiorBuildingId) return;
  if (useDirectorStore.getState().cutscene) return;
  const { useCombatStore } = await import('../combat/store.ts');
  if (
    Object.values(useCombatStore.getState().enemies).some(
      (enemy) => enemy.hostile && !enemy.defeated
    )
  )
    return;
  if (performance.now() - useWorldStore.getState().lastNpcInitiationAt < INITIATION_COOLDOWN_MS)
    return;
  for (const entry of summary.actions) {
    const action = entry.action as {
      type: string;
      actorId?: string;
      targetId?: string;
      text?: string;
    };
    if (!['talk', 'confront', 'gossip'].includes(action.type)) continue;
    if (action.targetId !== 'player' || !action.actorId || action.actorId === 'player') continue;
    const npc = world.npcs.find((candidate) => candidate.id === action.actorId);
    if (!npc || npc.combat?.defeated || npc.locationId !== world.player.locationId) continue;
    useWorldStore.setState({ lastNpcInitiationAt: performance.now() });
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
  agentLoopStatus: null,
  importing: false,
  lastNpcInitiationAt: Number.NEGATIVE_INFINITY,

  async init() {
    set({ loading: true, error: null });
    try {
      const world = await fetchState();
      set({ world, loading: false });
      const status = await fetchAgentLoopStatus();
      if (status.state === 'running') {
        set({ agentLoopRunning: true, agentLoopStatus: status });
      } else {
        // the world is alive by default — the HUD chip is a pause override
        const started = await setAgentLoopRunning(true);
        set({ agentLoopRunning: started.state === 'running', agentLoopStatus: started });
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
            const agentLoopStatus = get().agentLoopStatus;
            set({
              world,
              lastSummary: summary,
              events: [...get().events, ...toastsFrom(summary)],
              agentLoopStatus: agentLoopStatus ? { ...agentLoopStatus, lastTick: summary } : null,
            });
            useDirectorStore.getState().maybeTriggerFromSummary(summary, prevWorld, world);
            surfaceNpcBanter(summary, world);
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
            set({
              world,
              events: [],
              lastSummary: null,
              agentLoopRunning: false,
              agentLoopStatus: null,
              lastNpcInitiationAt: Number.NEGATIVE_INFINITY,
            });
            resetTransientWorldUiState();
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

  async refreshAgentLoopStatus() {
    try {
      const status = await fetchAgentLoopStatus();
      set({ agentLoopRunning: status.state === 'running', agentLoopStatus: status });
      return status;
    } catch (error) {
      set({ error: (error as Error).message });
      return null;
    }
  },

  async toggleAgentLoop() {
    try {
      const status = await setAgentLoopRunning(!get().agentLoopRunning);
      set({ agentLoopRunning: status.state === 'running', agentLoopStatus: status });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  async stepAgentLoopOnce() {
    try {
      if (get().agentLoopRunning) {
        const stopped = await setAgentLoopRunning(false);
        set({ agentLoopRunning: false, agentLoopStatus: stopped });
      }
      const prevWorld = get().world;
      const res = await stepAgentLoop();
      set({
        world: res.state,
        lastSummary: res.summary,
        events: [...get().events, ...toastsFrom(res.summary)],
        agentLoopRunning: res.status.state === 'running',
        agentLoopStatus: res.status,
        error: null,
      });
      useDirectorStore.getState().maybeTriggerFromSummary(res.summary, prevWorld, res.state);
      surfaceNpcBanter(res.summary, res.state);
      await maybeNpcInitiatesDialogue(res.summary, res.state);
      await markHostilesFrom(res.summary);
      return res;
    } catch (error) {
      set({ error: (error as Error).message });
      return null;
    }
  },

  async importWorldFromJson(text) {
    set({ importing: true });
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('World source is not valid JSON');
      }
      if (!parsed || typeof parsed !== 'object')
        throw new Error('World source is empty or malformed');
      const source = 'source' in parsed ? (parsed as { source?: unknown }).source : parsed;
      if (!source || typeof source !== 'object') throw new Error('World source is missing');
      const result = await importWorldSource(source as never);
      set({
        world: result.state,
        events: [],
        lastSummary: null,
        importing: false,
        error: null,
        agentLoopRunning: false,
        agentLoopStatus: null,
        lastNpcInitiationAt: Number.NEGATIVE_INFINITY,
      });
      resetTransientWorldUiState();
      await resetCombatForWorld();
    } catch (error) {
      set({ importing: false });
      throw error;
    }
  },

  async loadFromSnapshot(world) {
    set({ importing: true });
    try {
      const state = await loadSnapshot(world);
      set({
        world: state,
        events: [],
        lastSummary: null,
        importing: false,
        error: null,
        agentLoopRunning: false,
        agentLoopStatus: null,
        lastNpcInitiationAt: Number.NEGATIVE_INFINITY,
      });
      resetTransientWorldUiState();
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
