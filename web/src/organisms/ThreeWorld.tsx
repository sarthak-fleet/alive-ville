import { useEffect, useRef } from "react";

import type { World } from "../../../src/types.ts";
import { useWorldStore } from "../store/world.ts";
import { ThreeWorldRenderer } from "../three/world-scene.ts";
import { movePlayerToward } from "../world-travel.ts";

export function ThreeWorld() {
  const world = useWorldStore((state) => state.world);
  const hostRef = useRef<HTMLDivElement>(null);
  const currentLocation = world?.locations.find((location) => location.id === world.player.locationId) ?? null;
  const destinations = world ? reachableLocations(world) : [];

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
    });
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
    };
  }, []);

  return (
    <div className="three-stage">
      <div className="three-overlay" aria-label="3D travel">
        <span>At {currentLocation?.name ?? "Unknown"}</span>
        <div className="three-location-strip">
          {destinations.map((location) => (
            <button type="button" key={location.id} onClick={() => void movePlayerToward(location.id)}>
              Go {location.name}
            </button>
          ))}
        </div>
      </div>
      <div ref={hostRef} className="three-host" aria-label="3D world view" />
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
