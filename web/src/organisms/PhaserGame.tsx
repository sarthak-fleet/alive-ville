import Phaser from "phaser";
import { useEffect, useRef } from "react";

import { LOCATION_CLICK, NPC_CLICK, VillageScene } from "../phaser/VillageScene.ts";
import { useWorldStore } from "../store/world.ts";

const GAME_WIDTH = 660;
const GAME_HEIGHT = 500;

export function PhaserGame() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<VillageScene | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const scene = new VillageScene();
    sceneRef.current = scene;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      backgroundColor: "#0a0d12",
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene,
    });

    const onNpc = (npcId: string) => useWorldStore.getState().openDrawer(npcId);
    const onLoc = (locationId: string) => {
      const world = useWorldStore.getState().world;
      if (!world || world.player.locationId === locationId) return;
      void useWorldStore.getState().send({ type: "move", locationId } as never);
    };

    scene.events.on(NPC_CLICK, onNpc);
    scene.events.on(LOCATION_CLICK, onLoc);

    const unsub = useWorldStore.subscribe((state, prev) => {
      if (state.world && state.world !== prev.world) scene.setWorld(state.world);
      const newBubbles = state.bubbles.slice(prev.bubbles.length);
      for (const bubble of newBubbles) {
        if (bubble.fromDirector && bubble.actorId) scene.flashActor(bubble.actorId);
        if (bubble.actorId) scene.showBubble(bubble.actorId, bubble.text);
      }
    });

    const initialWorld = useWorldStore.getState().world;
    if (initialWorld) scene.setWorld(initialWorld);

    return () => {
      unsub();
      scene.events.off(NPC_CLICK, onNpc);
      scene.events.off(LOCATION_CLICK, onLoc);
      game.destroy(true);
      sceneRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="phaser-host" aria-label="Village map" />;
}
