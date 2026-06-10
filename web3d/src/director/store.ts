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

const CUTSCENE_MS = 4200;
const COOLDOWN_MS = 25_000;

interface DirectorStore {
  cutscene: Cutscene | null;
  lastEndedAt: number;
  beginCutscene: (beat: { actorId: string; text: string; kind: Cutscene["kind"] }) => void;
  endCutscene: () => void;
  maybeTriggerFromSummary: (summary: TickSummary, prevWorld: World | null, world: World) => void;
}

let cutsceneSeq = 0;

export const useDirectorStore = create<DirectorStore>((set, get) => ({
  cutscene: null,
  // -Infinity: performance.now() starts near 0 on page load, so a 0 default
  // would silently swallow every beat in the first cooldown window
  lastEndedAt: Number.NEGATIVE_INFINITY,

  beginCutscene(beat) {
    set({
      cutscene: {
        id: ++cutsceneSeq,
        actorId: beat.actorId,
        text: beat.text,
        kind: beat.kind,
        startedAt: performance.now(),
        durationMs: CUTSCENE_MS,
      },
    });
  },

  endCutscene() {
    if (!get().cutscene) return;
    set({ cutscene: null, lastEndedAt: performance.now() });
  },

  maybeTriggerFromSummary(summary, prevWorld, world) {
    const state = get();
    if (state.cutscene) return;
    if (performance.now() - state.lastEndedAt < COOLDOWN_MS) return;
    // the beat's actor isn't visible from inside a building — skip cinematics there
    if (useUiStore.getState().interiorDistrictId) return;

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
