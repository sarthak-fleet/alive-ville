import { describe, expect, it } from "vitest";

import { useUiStore } from "../web3d/src/store/ui.ts";
import { resetTransientWorldUiState, useWorldStore } from "../web3d/src/store/world.ts";

describe("web3d world store", () => {
  it("resets transient dialogue state with a world swap", () => {
    useWorldStore.setState({ lastNpcInitiationAt: 12345 });
    useUiStore.setState({
      gamePhase: "playing",
      dialogueNpcId: "mira",
      dialogueOpener: "hello",
      dialogueLines: [{ speaker: "npc", speakerName: "Mira", text: "hello" }],
      dialogueBusy: true,
      interactionTarget: { kind: "npc", id: "mira", label: "Mira", verb: "talk to" },
      interiorBuildingId: "forge",
    });

    resetTransientWorldUiState();

    expect(useWorldStore.getState().lastNpcInitiationAt).toBe(Number.NEGATIVE_INFINITY);
    expect(useUiStore.getState().dialogueNpcId).toBeNull();
    expect(useUiStore.getState().dialogueOpener).toBeNull();
    expect(useUiStore.getState().dialogueLines).toEqual([]);
    expect(useUiStore.getState().dialogueBusy).toBe(false);
    expect(useUiStore.getState().interactionTarget).toBeNull();
    expect(useUiStore.getState().interiorBuildingId).toBeNull();
  });
});
