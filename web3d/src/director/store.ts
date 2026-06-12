import { create } from "zustand";

import type { TickSummary, World } from "../../../src/types.ts";
import { useUiStore } from "../store/ui.ts";

export interface Cutscene {
  id: number;
  /** actor to frame; camera follows their live position */
  actorId: string;
  text: string;
  kind: "director" | "villain";
  startedAt: number;
  durationMs: number;
}

const CUTSCENE_MIN_MS = 6_000;
const CUTSCENE_MAX_MS = 12_000;
const CUTSCENE_MS_PER_CHAR = 55;
const COOLDOWN_MS = 25_000;

export interface IntroCinema {
  worldId: string;
  startedAt: number;
  durationMs: number;
}

interface DirectorStore {
  cutscene: Cutscene | null;
  lastEndedAt: number;
  beginCutscene: (beat: { actorId: string; text: string; kind: Cutscene["kind"] }) => void;
  endCutscene: () => void;
  reset: () => void;
  maybeTriggerFromSummary: (summary: TickSummary, prevWorld: World | null, world: World) => void;
  /** Opening cinematic — separate from director cutscenes; no actor focus, different camera path */
  introCinema: IntroCinema | null;
  beginIntroCinema: (worldId: string) => void;
  endIntroCinema: () => void;
}

let cutsceneSeq = 0;

const INTRO_DURATION_MS = 7_500;

export const useDirectorStore = create<DirectorStore>((set, get) => ({
  cutscene: null,
  // -Infinity: performance.now() starts near 0 on page load, so a 0 default
  // would silently swallow every beat in the first cooldown window
  lastEndedAt: Number.NEGATIVE_INFINITY,
  introCinema: null,

  beginIntroCinema(worldId) {
    set({ introCinema: { worldId, startedAt: performance.now(), durationMs: INTRO_DURATION_MS } });
  },

  endIntroCinema() {
    if (!get().introCinema) return;
    set({ introCinema: null });
  },

  beginCutscene(beat) {
    set({
      cutscene: {
        id: ++cutsceneSeq,
        actorId: beat.actorId,
        text: beat.text,
        kind: beat.kind,
        startedAt: performance.now(),
        // long enough to actually read the beat
        durationMs: Math.min(CUTSCENE_MAX_MS, Math.max(CUTSCENE_MIN_MS, beat.text.length * CUTSCENE_MS_PER_CHAR)),
      },
    });
  },

  endCutscene() {
    if (!get().cutscene) return;
    set({ cutscene: null, lastEndedAt: performance.now() });
  },

  reset() {
    set({ cutscene: null, lastEndedAt: Number.NEGATIVE_INFINITY, introCinema: null });
  },

  maybeTriggerFromSummary(summary, prevWorld, world) {
    const state = get();
    if (state.cutscene) return;
    if (performance.now() - state.lastEndedAt < COOLDOWN_MS) return;
    // the beat's actor isn't visible from inside a building — skip cinematics there
    if (useUiStore.getState().interiorBuildingId) return;
    // never hijack the camera mid-conversation
    if (useUiStore.getState().dialogueNpcId) return;

    // villain plan advanced a stage → highest-drama beat
    for (const plan of world.villainPlans ?? []) {
      const previous = prevWorld?.villainPlans?.find((entry) => entry.id === plan.id);
      if (previous && plan.stage > previous.stage) {
        state.beginCutscene({
          actorId: plan.actorId,
          text: plan.nextTrigger ?? `${plan.title} advances.`,
          kind: "villain",
        });
        return;
      }
    }

    // director-injected action
    for (const entry of summary.actions) {
      if (!entry.fromDirector) continue;
      const action = entry.action;
      const actorId =
        action.actorId && action.actorId !== "player"
          ? action.actorId
          : "targetId" in action && action.targetId !== "player"
            ? (action as { targetId?: string }).targetId
            : null;
      if (!actorId) continue;
      const text = action.type === "talk" || action.type === "confront" || action.type === "gossip" ? action.text : entry.text;
      state.beginCutscene({ actorId, text, kind: "director" });
      return;
    }
  },
}));

if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>)["__director"] = useDirectorStore;
}
