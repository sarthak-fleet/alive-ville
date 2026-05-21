import { type KeyboardEvent, useEffect, useRef, useState } from "react";

import type { TickSummary, World } from "../../../src/types.ts";
import { useWorldStore } from "../store/world.ts";
import { type SceneTarget, ThreeWorldRenderer, type WebglContextStatus } from "../three/world-scene.ts";
import { keyboardDestinationFor, movePlayerToward } from "../world-travel.ts";

export function ThreeWorld() {
  const world = useWorldStore((state) => state.world);
  const lastSummary = useWorldStore((state) => state.lastSummary);
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ThreeWorldRenderer | null>(null);
  const [hoverTarget, setHoverTarget] = useState<SceneTarget | null>(null);
  const [cameraBearing, setCameraBearing] = useState(34);
  const [contextStatus, setContextStatus] = useState<WebglContextStatus>("ready");
  const currentLocation = world?.locations.find((location) => location.id === world.player.locationId) ?? null;
  const destinations = world ? reachableLocations(world) : [];
  const agentActivity = lastSummary ? latestAutonomousActivity(lastSummary) : null;
  const handleKeyboardTravel = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isInteractiveTarget(event.target)) return;
    const latestWorld = useWorldStore.getState().world;
    if (!latestWorld) return;
    if (event.key.toLowerCase() === "e" && hoverTarget) {
      event.preventDefault();
      activateSceneTarget(hoverTarget);
      return;
    }
    const destination = keyboardDestinationFor(latestWorld, event.key);
    if (!destination) return;
    event.preventDefault();
    void movePlayerToward(destination);
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = new ThreeWorldRenderer(host, {
      onLocationSelect: (locationId) => void movePlayerToward(locationId),
      onNpcSelect: (npcId) => activateSceneTarget({ kind: "npc", id: npcId, label: npcId, action: "Talk" }),
      onItemSelect: (itemId) => activateSceneTarget({ kind: "item", id: itemId, label: itemId, action: "Pick up" }),
      onPropSelect: (propId) => activateSceneTarget({ kind: "prop", id: propId, label: propId, action: "Inspect" }),
      onTargetHover: setHoverTarget,
      onContextStatus: setContextStatus,
    });
    rendererRef.current = renderer;
    setCameraBearing(renderer.cameraBearingDegrees());
    const resizeObserver = new ResizeObserver(() => renderer.resize());
    resizeObserver.observe(host);

    const initialWorld = useWorldStore.getState().world;
    if (initialWorld) renderer.renderWorld(initialWorld);
    renderer.start();

    const unsub = useWorldStore.subscribe((state, previous) => {
      if (state.world && state.world !== previous.world) renderer.renderWorld(state.world);
    });
    const onTravelRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ locationId?: string }>).detail;
      if (detail?.locationId) void movePlayerToward(detail.locationId);
    };
    window.addEventListener("ashbend:travel-to", onTravelRequest);

    return () => {
      window.removeEventListener("ashbend:travel-to", onTravelRequest);
      unsub();
      resizeObserver.disconnect();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  return (
    <div className="three-stage">
      <div className="three-overlay" aria-label="3D travel">
        <span>At {currentLocation?.name ?? "Unknown"}</span>
        <strong className="three-target-readout" aria-label="3D target">
          {hoverTarget ? `${hoverTarget.action} ${hoverTarget.label}` : "Hover a scene target"}
        </strong>
        <button
          type="button"
          className="three-interact-button"
          disabled={!hoverTarget}
          aria-label={hoverTarget ? `Interact with ${hoverTarget.label}` : "No scene target selected"}
          onClick={() => {
            if (hoverTarget) activateSceneTarget(hoverTarget);
          }}
        >
          {hoverTarget ? hoverTarget.action : "Interact"}
        </button>
        <p className="three-agent-feed" aria-label="3D agent activity">
          {agentActivity ?? "Autonomous agents waiting"}
        </p>
        <p className={`three-context-status ${contextStatus}`} aria-label="3D renderer status">
          {contextStatus === "lost" ? "3D renderer paused" : contextStatus === "restored" ? "3D renderer restored" : "3D renderer ready"}
        </p>
        <div className="three-camera-controls" aria-label="3D camera controls">
          <button type="button" aria-label="Rotate camera left" onClick={() => setCameraBearing(rendererRef.current?.orbitCamera(-Math.PI / 8) ?? cameraBearing)}>
            ◀
          </button>
          <output aria-label="3D camera bearing">{cameraBearing} deg</output>
          <button type="button" aria-label="Rotate camera right" onClick={() => setCameraBearing(rendererRef.current?.orbitCamera(Math.PI / 8) ?? cameraBearing)}>
            ▶
          </button>
          <button type="button" aria-label="Reset camera" onClick={() => setCameraBearing(rendererRef.current?.resetCamera() ?? cameraBearing)}>
            Reset
          </button>
        </div>
        <div className="three-location-strip">
          {destinations.map((location) => (
            <button type="button" key={location.id} onClick={() => void movePlayerToward(location.id)}>
              Go {location.name}
            </button>
          ))}
        </div>
      </div>
      <div
        ref={hostRef}
        className="three-host"
        aria-label="3D world view"
        tabIndex={0}
        onKeyDown={handleKeyboardTravel}
        onPointerDown={(event) => event.currentTarget.focus({ preventScroll: true })}
      />
    </div>
  );
}

function reachableLocations(world: World): World["locations"] {
  const reachable = new Set<string>();
  for (const exit of world.exits) {
    if (exit.from === world.player.locationId) reachable.add(exit.to);
    if (exit.bidirectional && exit.to === world.player.locationId) reachable.add(exit.from);
  }
  return world.locations.filter((location) => reachable.has(location.id));
}

function isInteractiveTarget(target: EventTarget): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("button, input, select, textarea, summary, a"));
}

function activateSceneTarget(target: SceneTarget): void {
  if (target.kind === "location") {
    void movePlayerToward(target.id);
    return;
  }
  if (target.kind === "npc") {
    const world = useWorldStore.getState().world;
    const npc = world?.npcs.find((candidate) => candidate.id === target.id);
    if (!world || !npc) return;
    if (npc.locationId !== world.player.locationId) {
      void movePlayerToward(npc.locationId);
      return;
    }
    useWorldStore.getState().openDrawer(target.id);
    return;
  }
  if (target.kind === "item") {
    const world = useWorldStore.getState().world;
    const item = world?.items.find((candidate) => candidate.id === target.id);
    if (!world || !item?.locationId) return;
    if (item.locationId !== world.player.locationId) {
      void movePlayerToward(item.locationId);
      return;
    }
    void useWorldStore.getState().send({ type: "pickup", itemId: target.id } as never);
    return;
  }
  const world = useWorldStore.getState().world;
  const prop = world?.interactables?.find((candidate) => candidate.id === target.id);
  if (!world || !prop) return;
  if (prop.locationId !== world.player.locationId) {
    void movePlayerToward(prop.locationId);
    return;
  }
  void useWorldStore.getState().send({ type: "inspect", propId: target.id } as never);
}

function latestAutonomousActivity(summary: TickSummary): string | null {
  const autonomous = summary.actions.filter((entry) => entry.action.actorId !== "player");
  const action = autonomous.find((entry) => entry.action.type === "move") ?? autonomous[0];
  if (!action) return null;
  return `Autonomous t${summary.tick}: ${action.text.replace(/\.$/, "")}`;
}
