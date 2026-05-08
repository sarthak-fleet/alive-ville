import Phaser from "phaser";
import { useEffect, useRef } from "react";
import { useWorldStore } from "../store/world.ts";
import { VillageScene } from "../phaser/VillageScene.ts";

const GAME_WIDTH = 660;
const GAME_HEIGHT = 500;

export function PhaserGame() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const scene = new VillageScene();
    scene.setHandlers({
      onNpcClick: (id) => useWorldStore.getState().openDrawer(id),
      onLocationClick: (id) => {
        const world = useWorldStore.getState().world;
        if (!world || world.player.locationId === id) return;
        void useWorldStore.getState().send({ type: "move", locationId: id } as never);
      },
    });

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      backgroundColor: "#0a0d12",
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene,
    });

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
      game.destroy(true);
    };
  }, []);

  return <div ref={containerRef} className="phaser-host" aria-label="Village map" />;
}
