import { create } from "zustand";

export interface DialogueLine {
  speaker: "player" | "npc";
  speakerName: string;
  text: string;
}

export interface InteractionTarget {
  kind: "npc" | "item" | "prop" | "door";
  id: string;
  label: string;
  verb: string;
}

interface UiStore {
  dialogueNpcId: string | null;
  dialogueLines: DialogueLine[];
  dialogueBusy: boolean;
  interactionTarget: InteractionTarget | null;
  /** district id whose interior the player is currently inside, if any */
  interiorDistrictId: string | null;
  setInteriorDistrictId: (districtId: string | null) => void;
  openDialogue: (npcId: string) => void;
  pushDialogueLine: (line: DialogueLine) => void;
  setDialogueBusy: (busy: boolean) => void;
  closeDialogue: () => void;
  setInteractionTarget: (target: InteractionTarget | null) => void;
}

export const useUiStore = create<UiStore>((set, get) => ({
  dialogueNpcId: null,
  dialogueLines: [],
  dialogueBusy: false,
  interactionTarget: null,
  interiorDistrictId: null,

  setInteriorDistrictId(districtId) {
    set({ interiorDistrictId: districtId });
  },

  openDialogue(npcId) {
    if (get().dialogueNpcId === npcId) return;
    set({ dialogueNpcId: npcId, dialogueLines: [], dialogueBusy: false });
  },
  pushDialogueLine(line) {
    set({ dialogueLines: [...get().dialogueLines, line] });
  },
  setDialogueBusy(busy) {
    set({ dialogueBusy: busy });
  },
  closeDialogue() {
    set({ dialogueNpcId: null, dialogueLines: [], dialogueBusy: false });
  },
  setInteractionTarget(target) {
    const current = get().interactionTarget;
    if (current?.id === target?.id && current?.kind === target?.kind) return;
    set({ interactionTarget: target });
  },
}));
