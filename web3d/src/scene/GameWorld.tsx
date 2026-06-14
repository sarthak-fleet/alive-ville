import { Stars } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, FXAA, ToneMapping, Vignette } from "@react-three/postprocessing";
import { Physics } from "@react-three/rapier";
import { ToneMappingMode } from "postprocessing";
import { Perf } from "r3f-perf";
import { Suspense, useEffect, useMemo } from "react";

import { isNight, type World } from "../../../src/types.ts";
import { playTrack } from "../audio/music.ts";
import { Npc } from "../characters/Npc.tsx";
import { useCombatStore } from "../combat/store.ts";
import { CombatVfx } from "../combat/Vfx.tsx";
import { PlayerController } from "../controls/PlayerController.tsx";
import { setCaptureCanvas } from "../platform/clip.ts";
import { useUiStore } from "../store/ui.ts";
import { cityModelFor } from "../worldgen/cache.ts";
import { interiorForBuilding } from "../worldgen/interiors.ts";
import { computePlacements } from "../worldgen/placements.ts";
import { CityGround } from "./CityGround.tsx";
import { District, InteractableMarker, ItemMarker } from "./District.tsx";
import { Interior } from "./Interior.tsx";
import { Lighting } from "./Lighting.tsx";
import { Skyline } from "./Skyline.tsx";

// low-end escape hatch + debugging: ?nofx disables the post-processing chain
const POST_FX_ENABLED = typeof window === "undefined" || !new URLSearchParams(window.location.search).has("nofx");
// ?perf shows the r3f-perf profiler overlay (FPS, draw calls, triangles, GPU/CPU ms)
const PERF_ENABLED = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("perf");

/** Registers the renderer's canvas for clip capture (must live inside <Canvas>). */
function CaptureRegistrar(): null {
  const canvas = useThree((state) => state.gl.domElement);
  useEffect(() => {
    setCaptureCanvas(canvas);
    return () => setCaptureCanvas(null);
  }, [canvas]);
  return null;
}

export function GameWorld({ world }: { world: World }) {
  const model = cityModelFor(world);
  const placements = useMemo(() => computePlacements(world, model.districts), [world, model]);
  const night = isNight(world.clock);
  const interiorBuildingId = useUiStore((state) => state.interiorBuildingId);
  const activeInterior = interiorBuildingId ? interiorForBuilding(world, model, interiorBuildingId) : null;

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === "undefined") return;
    const debug = (window as unknown as Record<string, unknown>)["__game"] as Record<string, unknown> | undefined;
    if (debug) {
      debug["doors"] = model.doors;
      debug["items"] = placements.items;
    }
  }, [model, placements]);

  const activeDistrict = model.districts.find((district) => district.locationId === world.player.locationId) ?? model.districts[0];

  // pick the ambient music track from the player's current context. interior
  // wins over district; combat overrides everything; otherwise the district
  // name hints city vs village and time-of-day selects day vs night variants.
  const inCombat = useCombatStore((state) => Object.values(state.enemies).some((enemy) => enemy.hostile && !enemy.defeated));
  const musicKey = (() => {
    if (inCombat) return "combat" as const;
    if (activeInterior) return "interior" as const;
    const label = `${activeDistrict?.name ?? ""} ${activeDistrict?.roleText ?? ""}`.toLowerCase();
    const isCity = /city|metro|downtown|plaza|capital|street|market|skyline|tower/.test(label);
    if (isCity) return "city" as const;
    return night ? ("village-night" as const) : ("village-day" as const);
  })();

  useEffect(() => {
    playTrack(musicKey);
  }, [musicKey]);

  if (!activeDistrict) return null;

  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{
        fov: 50,
        near: 0.1,
        far: 600,
        position: [activeDistrict.playerSpawn.x, 6, activeDistrict.playerSpawn.z + 9],
      }}
      style={{ position: "absolute", inset: 0 }}
    >
      <CaptureRegistrar />
      {PERF_ENABLED ? <Perf position="top-left" /> : null}
      <Suspense fallback={null}>
        <Physics gravity={[0, -22, 0]}>
          <Lighting world={world} target={{ x: activeDistrict.courtyard.x, z: activeDistrict.courtyard.z }} />
          {night ? <Stars radius={300} depth={60} count={2200} factor={5} saturation={0.1} fade speed={0.6} /> : null}
          <CityGround model={model} baseColor={activeDistrict.palette.ground} />
          <Skyline model={model} worldId={world.id} night={night} />
          {model.districts.map((district) => (
            <District key={district.locationId} district={district} night={night} />
          ))}
          {activeInterior ? (
            <Interior key={activeInterior.buildingId} interior={activeInterior} npcs={world.npcs} />
          ) : null}
          {placements.items.map((item) => (
            <ItemMarker key={item.itemId} item={item} />
          ))}
          {placements.interactables.map((prop) => (
            <InteractableMarker key={prop.propId} prop={prop} />
          ))}
          {world.npcs.map((npc) => {
            const spawn = placements.npcSpawns[npc.id];
            if (!spawn) return null;
            // hide exterior render for NPCs currently inhabiting the active interior
            if (activeInterior?.inhabitantId === npc.id) return null;
            return <Npc key={npc.id} npc={npc} worldId={world.id} spawn={spawn} model={model} quests={world.quests ?? []} />;
          })}
          <PlayerController world={world} model={model} placements={placements} activeDistrict={activeDistrict} />
          <CombatVfx />
        </Physics>
        {/* FXAA instead of MSAA: post-AA is far cheaper than a multisampled buffer.
            ToneMapping is mandatory: EffectComposer disables three's default ACES
            pass, and without it the whole scene renders flat and dark. */}
        {POST_FX_ENABLED ? (
          <EffectComposer multisampling={0}>
            <Bloom mipmapBlur intensity={night ? 0.85 : 0.4} luminanceThreshold={0.82} luminanceSmoothing={0.2} />
            <Vignette eskil={false} offset={0.34} darkness={0.38} />
            <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
            <FXAA />
          </EffectComposer>
        ) : null}
      </Suspense>
    </Canvas>
  );
}
