import Phaser from "phaser";
import { useEffect, useRef } from "react";

import type { Location, World } from "../../../src/types.ts";
import { VillageScene } from "../phaser/VillageScene.ts";
import { useWorldStore } from "../store/world.ts";
import { movePlayerToward } from "../world-travel.ts";

const INITIAL_GAME_WIDTH = 1280;
const INITIAL_GAME_HEIGHT = 720;
const MIN_GAME_WIDTH = 320;
const MIN_GAME_HEIGHT = 240;

export function PhaserGame() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<VillageScene | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const onNpc = (npcId: string) => useWorldStore.getState().openDrawer(npcId);
    const onItem = (itemId: string) => {
      const world = useWorldStore.getState().world;
      const item = world?.items.find((candidate) => candidate.id === itemId);
      if (!world || item?.locationId !== world.player.locationId) return;
      void useWorldStore.getState().send({ type: "pickup", itemId } as never);
    };
    const onProp = (propId: string) => {
      const world = useWorldStore.getState().world;
      const prop = world?.interactables?.find((candidate) => candidate.id === propId);
      if (!world || prop?.locationId !== world.player.locationId) return;
      void useWorldStore.getState().send({ type: "inspect", propId } as never);
    };
    const onLoc = (locationId: string) => {
      const world = useWorldStore.getState().world;
      if (!world || world.player.locationId === locationId) return;
      void movePlayerToward(locationId);
    };
    const container = containerRef.current;
    const initialWidth = Math.max(MIN_GAME_WIDTH, Math.round(container.clientWidth || INITIAL_GAME_WIDTH));
    const initialHeight = Math.max(MIN_GAME_HEIGHT, Math.round(container.clientHeight || INITIAL_GAME_HEIGHT));
    const scene = new VillageScene({ onNpcClick: onNpc, onLocationClick: onLoc, onItemClick: onItem, onPropClick: onProp });
    sceneRef.current = scene;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container,
      width: initialWidth,
      height: initialHeight,
      backgroundColor: "#0a0d12",
      scale: { mode: Phaser.Scale.RESIZE },
      scene,
    });
    const resizeGame = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(MIN_GAME_WIDTH, Math.round(rect.width));
      const height = Math.max(MIN_GAME_HEIGHT, Math.round(rect.height));
      game.scale.resize(width, height);
    };
    const resizeObserver = new ResizeObserver(resizeGame);
    resizeObserver.observe(container);
    requestAnimationFrame(resizeGame);

    const unsub = useWorldStore.subscribe((state, prev) => {
      if (state.world && state.world !== prev.world) scene.setWorld(state.world);
      const newBubbles = state.bubbles.slice(prev.bubbles.length);
      for (const bubble of newBubbles) {
        if (bubble.actionType === "fight" && bubble.actorId) scene.playCombatFx(bubble.actorId, bubble.combatStyle, bubble.combatLabel);
        if ((bubble.fromDirector || bubble.actionType === "fight") && bubble.actorId) scene.flashActor(bubble.actorId);
        if (bubble.actorId) scene.showBubble(bubble.actorId, bubble.text);
      }
    });

    const initialWorld = useWorldStore.getState().world;
    if (initialWorld) scene.setWorld(initialWorld);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isTypingTarget(event.target)) return;
      const direction = keyDirection(event.key);
      if (!direction) return;
      const world = useWorldStore.getState().world;
      const target = world ? locationInDirection(world, direction) : null;
      if (!target) return;
      event.preventDefault();
      sceneRef.current?.previewPlayerMove(target);
      void movePlayerToward(target);
    };
    const onTravelRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ locationId?: string }>).detail;
      if (detail?.locationId) {
        sceneRef.current?.previewPlayerMove(detail.locationId);
        void movePlayerToward(detail.locationId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("ashbend:travel-to", onTravelRequest);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("ashbend:travel-to", onTravelRequest);
      unsub();
      game.destroy(true);
      sceneRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="phaser-host" aria-label="Village map" />;
}

function keyDirection(key: string): "up" | "down" | "left" | "right" | null {
  if (key === "ArrowUp" || key.toLowerCase() === "w") return "up";
  if (key === "ArrowDown" || key.toLowerCase() === "s") return "down";
  if (key === "ArrowLeft" || key.toLowerCase() === "a") return "left";
  if (key === "ArrowRight" || key.toLowerCase() === "d") return "right";
  return null;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

function locationInDirection(world: World, direction: "up" | "down" | "left" | "right"): string | null {
  const current = world.locations.find((loc) => loc.id === world.player.locationId);
  if (!current) return null;
  const from = centerOf(current);
  const candidates = reachableLocations(world)
    .map((id) => world.locations.find((loc) => loc.id === id))
    .filter((loc): loc is Location => Boolean(loc))
    .map((loc) => ({ loc, center: centerOf(loc) }))
    .filter(({ center }) => {
      const dx = center.x - from.x;
      const dy = center.y - from.y;
      if (direction === "up") return dy < -20 && Math.abs(dy) >= Math.abs(dx) * 0.6;
      if (direction === "down") return dy > 20 && Math.abs(dy) >= Math.abs(dx) * 0.6;
      if (direction === "left") return dx < -20 && Math.abs(dx) >= Math.abs(dy) * 0.6;
      return dx > 20 && Math.abs(dx) >= Math.abs(dy) * 0.6;
    })
    .sort((a, b) => distance(from, a.center) - distance(from, b.center));
  return candidates[0]?.loc.id ?? null;
}

function reachableLocations(world: World): string[] {
  const here = world.player.locationId;
  const reachable = new Set<string>();
  for (const exit of world.exits) {
    if (exit.from === here) reachable.add(exit.to);
    if (exit.bidirectional && exit.to === here) reachable.add(exit.from);
  }
  return [...reachable];
}

function centerOf(location: Location) {
  return { x: location.x + location.w / 2, y: location.y + location.h / 2 };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
