import { type KeyboardEvent, useEffect, useRef, useState } from "react";

import type { World } from "../../../src/types.ts";
import { useWorldStore } from "../store/world.ts";
import { type SceneTarget, ThreeWorldRenderer } from "../three/world-scene.ts";
import { keyboardDestinationFor, movePlayerToward } from "../world-travel.ts";

export function ThreeWorld() {
  const world = useWorldStore((state) => state.world);
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ThreeWorldRenderer | null>(null);
  const [hoverTarget, setHoverTarget] = useState<SceneTarget | null>(null);
  const [cameraBearing, setCameraBearing] = useState(34);
  const currentLocation = world?.locations.find((location) => location.id === world.player.locationId) ?? null;
  const destinations = world ? reachableLocations(world) : [];
  const handleKeyboardTravel = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isInteractiveTarget(event.target)) return;
    const latestWorld = useWorldStore.getState().world;
    if (!latestWorld) return;
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
      onNpcSelect: (npcId) => {
        const world = useWorldStore.getState().world;
        const npc = world?.npcs.find((candidate) => candidate.id === npcId);
        if (!world || !npc) return;
        if (npc.locationId !== world.player.locationId) {
          void movePlayerToward(npc.locationId);
          return;
        }
        useWorldStore.getState().openDrawer(npcId);
      },
      onItemSelect: (itemId) => {
        const world = useWorldStore.getState().world;
        const item = world?.items.find((candidate) => candidate.id === itemId);
        if (!world || !item?.locationId) return;
        if (item.locationId !== world.player.locationId) {
          void movePlayerToward(item.locationId);
          return;
        }
        void useWorldStore.getState().send({ type: "pickup", itemId } as never);
      },
      onPropSelect: (propId) => {
        const world = useWorldStore.getState().world;
        const prop = world?.interactables?.find((candidate) => candidate.id === propId);
        if (!world || !prop) return;
        if (prop.locationId !== world.player.locationId) {
          void movePlayerToward(prop.locationId);
          return;
        }
        void useWorldStore.getState().send({ type: "inspect", propId } as never);
      },
      onTargetHover: setHoverTarget,
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
