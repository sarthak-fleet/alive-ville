import { create } from 'zustand';

/** live NPC↔NPC exchanges, rendered as speech bubbles in the 3D town */
export interface BanterEntry {
  partnerId: string;
  text: string;
  until: number;
  confrontation: boolean;
}

interface BanterStore {
  byNpc: Record<string, BanterEntry>;
  show: (npcId: string, partnerId: string, text: string, confrontation: boolean) => void;
  prune: (now: number) => void;
  clear: () => void;
}

export const useBanterStore = create<BanterStore>((set, get) => ({
  byNpc: {},
  show(npcId, partnerId, text, confrontation) {
    const trimmed = text.length > 140 ? `${text.slice(0, 137)}…` : text;
    const duration = Math.min(11_000, 4_000 + trimmed.length * 45);
    set({
      byNpc: {
        ...get().byNpc,
        [npcId]: { partnerId, text: trimmed, until: performance.now() + duration, confrontation },
      },
    });
  },
  prune(now) {
    const current = get().byNpc;
    const next: Record<string, BanterEntry> = {};
    let changed = false;
    for (const [id, entry] of Object.entries(current)) {
      if (entry.until > now) next[id] = entry;
      else changed = true;
    }
    if (changed) set({ byNpc: next });
  },
  clear() {
    set({ byNpc: {} });
  },
}));

if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>)['__banter'] = useBanterStore;
}
