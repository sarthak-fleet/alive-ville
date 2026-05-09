import { create } from "zustand";

import type { PlayerAction, TickSummary, World } from "../../../src/types.ts";
import { fetchState, postTick } from "../api/client.ts";

export interface BubbleEvent {
  id: number;
  actorId: string | null;
  text: string;
  fromDirector: boolean;
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
      set({ world, loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  async send(action) {
    try {
      const res = await postTick(action);
      const expires = performance.now() + 4200;
      const newBubbles = res.summary.actions.map((entry) => ({
        id: ++bubbleSeq,
        actorId: entry.action.actorId,
        text: bubbleText(entry),
        fromDirector: Boolean(entry.fromDirector),
        expiresAt: expires,
      }));
      set({
        world: res.state,
        lastSummary: res.summary,
        bubbles: [...get().bubbles, ...newBubbles],
      });
    } catch (error) {
      set({ error: (error as Error).message });
    }
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

function bubbleText(entry: TickSummary["actions"][number]): string {
  const a = entry.action;
  if (a.type === "talk" || a.type === "gossip" || a.type === "confront") {
    return (a as { text: string }).text;
  }
  return entry.text;
}
