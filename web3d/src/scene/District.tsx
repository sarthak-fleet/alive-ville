import { Billboard, Outlines, Text } from "@react-three/drei";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { memo, Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { stableHash } from "../mapping/visuals.ts";
import { shiftColor } from "../worldgen/district.ts";
import type { BuildingModel, DistrictModel, ItemPlacement, PropModel } from "../worldgen/index.ts";
import type { InteractablePlacement } from "../worldgen/model.ts";
import { mulberry32, seedFromString } from "../worldgen/rng.ts";
import { BUILDING_ASSETS, NATURE_ASSETS, pickAsset } from "./asset-registry.ts";
import { ToonGlb } from "./kenneyGlb.tsx";
import { registerOccluder, unregisterOccluder } from "./occlusion.ts";
import { facadeMaterial, lightPoolTexture, pavingTexture, speckleTexture } from "./textures.ts";
import { toonGradientMap, toonMaterial } from "./toon.ts";

const OUTLINE = "#101421";
const OUTLINE_THICKNESS = 0.035;
const CORNERS: Array<[number, number]> = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

export const District = memo(function District({ district, night }: { district: DistrictModel; night: boolean }) {
  const cx = district.origin.x + district.width / 2;
  const cz = district.origin.z + district.depth / 2;
  return (
    <group>
      <Ground district={district} cx={cx} cz={cz} />
      {/* one warm light per district at night — per-lamp lights are far too expensive */}
      {night ? (
        <pointLight
          position={[district.courtyard.x, 4.5, district.courtyard.z]}
          color="#ffe2ae"
          intensity={26}
          distance={district.courtyard.radius * 3.2}
          decay={1.6}
        />
      ) : null}
      {district.buildings.map((building) => (
        <Building key={building.id} building={building} night={night} courtyard={district.courtyard} />
      ))}
      {district.props.map((prop) => (
        <Prop key={prop.id} prop={prop} night={night} />
      ))}
      {/* billboard: a flat Text reads mirrored from behind */}
      <Billboard position={[cx, 11, cz]}>
        <Text fontSize={1.1} color="#ffffff" outlineWidth={0.06} outlineColor={OUTLINE} anchorX="center" fillOpacity={0.85}>
          {district.name}
        </Text>
      </Billboard>
    </group>
  );
});

function Ground({ district, cx, cz }: { district: DistrictModel; cx: number; cz: number }) {
  const plotMat = useMemo(() => {
    const texture = speckleTexture(shiftColor(district.palette.ground, 0.22)).clone();
    texture.repeat.set(district.width / 9, district.depth / 9);
    texture.needsUpdate = true;
    return new THREE.MeshToonMaterial({ map: texture, gradientMap: toonGradientMap() });
  }, [district.palette.ground, district.width, district.depth]);

  const walkMat = useMemo(() => {
    const texture = pavingTexture(shiftColor(district.palette.ground, 0.38)).clone();
    const tiles = (district.courtyard.radius + 2) / 3.2;
    texture.repeat.set(tiles, tiles);
    texture.needsUpdate = true;
    return new THREE.MeshToonMaterial({ map: texture, gradientMap: toonGradientMap() });
  }, [district.palette.ground, district.courtyard.radius]);

  return (
    <group>
      {/* plot slab (visual only; the shared CityGround provides the collider) */}
      <mesh position={[cx, 0.004, cz]} receiveShadow material={plotMat}>
        <boxGeometry args={[district.width, 0.008, district.depth]} />
      </mesh>
      <mesh position={[district.courtyard.x, 0.018, district.courtyard.z]} receiveShadow material={walkMat}>
        <cylinderGeometry args={[district.courtyard.radius + 2, district.courtyard.radius + 2, 0.02, 40]} />
      </mesh>
    </group>
  );
}

function Building({ building, night, courtyard }: { building: BuildingModel; night: boolean; courtyard: { x: number; z: number } }) {
  const roofMat = toonMaterial(building.roofColor);
  const facade = facadeMaterial(building.bodyColor, building.accentColor, building.floors, building.id, night, toonGradientMap());
  const buildingRef = useRef<THREE.Group>(null);

  useEffect(() => {
    const group = buildingRef.current;
    if (!group) return;
    registerOccluder(group);
    return () => unregisterOccluder(group);
  }, []);

  const extras = useMemo(() => {
    const rng = mulberry32(seedFromString(`${building.id}:extras`));
    const roofBoxes: Array<{ x: number; z: number; size: number }> = [];
    let antenna: { x: number; z: number; height: number } | null = null;
    if (building.floors >= 3) {
      const count = 1 + Math.floor(rng() * 2);
      for (let index = 0; index < count; index += 1) {
        roofBoxes.push({
          x: (rng() - 0.5) * (building.width - 1.4),
          z: (rng() - 0.5) * (building.depth - 1.4),
          size: 0.6 + rng() * 0.5,
        });
      }
      if (rng() > 0.45) {
        antenna = { x: (rng() - 0.5) * (building.width - 1), z: (rng() - 0.5) * (building.depth - 1), height: 1.6 + rng() * 1.6 };
      }
    }
    // awning over the courtyard-facing face on low buildings
    let awning: { x: number; z: number; rotY: number } | null = null;
    if (building.floors <= 2 && rng() > 0.5) {
      const dx = courtyard.x - building.x;
      const dz = courtyard.z - building.z;
      if (Math.abs(dx) > Math.abs(dz)) {
        awning = { x: (Math.sign(dx) * building.width) / 2 + Math.sign(dx) * 0.35, z: 0, rotY: dx > 0 ? Math.PI / 2 : -Math.PI / 2 };
      } else {
        awning = { x: 0, z: (Math.sign(dz) * building.depth) / 2 + Math.sign(dz) * 0.35, rotY: dz > 0 ? 0 : Math.PI };
      }
    }
    return { roofBoxes, antenna, awning };
  }, [building, courtyard.x, courtyard.z]);

  // Pick a deterministic Kenney shell variant per building id; the GLB is
  // scaled to fit the procedural footprint so colliders + worldgen layout
  // remain unchanged. The procedural facade box is the Suspense fallback so
  // a missing/failing GLB degrades to the previous look automatically.
  const shellUrl = useMemo(() => {
    const list = BUILDING_ASSETS.shell;
    return list.length > 0 ? pickAsset(list, seedFromString(`${building.id}:shell`)) : null;
  }, [building.id]);
  const proceduralFacade = (
    <mesh position={[0, building.height / 2, 0]} castShadow receiveShadow material={facade}>
      <boxGeometry args={[building.width, building.height, building.depth]} />
      <Outlines thickness={OUTLINE_THICKNESS} color={OUTLINE} />
    </mesh>
  );

  return (
    <RigidBody type="fixed" colliders={false}>
      <group ref={buildingRef} position={[building.x, 0, building.z]}>
        {shellUrl ? (
          <Suspense fallback={proceduralFacade}>
            <ToonGlb
              url={shellUrl}
              position={[0, 0, 0]}
              targetSize={[building.width, building.height, building.depth]}
              outline={false}
            />
          </Suspense>
        ) : (
          proceduralFacade
        )}
        <mesh position={[0, building.height + 0.25, 0]} castShadow material={roofMat}>
          <boxGeometry args={[building.width + 0.5, 0.5, building.depth + 0.5]} />
        </mesh>
        {/* corner pilasters + storefront cornice: cheap geometry that breaks the flat-box read */}
        {CORNERS.map(([sx, sz], index) => (
          <mesh
            key={index}
            position={[(sx * building.width) / 2, building.height / 2, (sz * building.depth) / 2]}
            castShadow
            material={toonMaterial(shiftColor(building.bodyColor, -0.22))}
          >
            <boxGeometry args={[0.24, building.height, 0.24]} />
          </mesh>
        ))}
        {building.floors > 1 ? (
          <mesh
            position={[0, building.height / building.floors + 0.04, 0]}
            castShadow
            material={toonMaterial(shiftColor(building.bodyColor, -0.22))}
          >
            <boxGeometry args={[building.width + 0.34, 0.2, building.depth + 0.34]} />
          </mesh>
        ) : null}
        {extras.roofBoxes.map((box, index) => (
          <mesh key={index} position={[box.x, building.height + 0.5 + box.size / 2, box.z]} castShadow material={toonMaterial(shiftColor(building.roofColor, 0.15))}>
            <boxGeometry args={[box.size, box.size, box.size]} />
          </mesh>
        ))}
        {extras.antenna ? (
          <mesh
            position={[extras.antenna.x, building.height + 0.5 + extras.antenna.height / 2, extras.antenna.z]}
            material={toonMaterial("#39414f")}
          >
            <cylinderGeometry args={[0.035, 0.05, extras.antenna.height, 6]} />
          </mesh>
        ) : null}
        {extras.awning ? (
          <group position={[extras.awning.x, 2.5, extras.awning.z]} rotation={[0, extras.awning.rotY, 0]}>
            <mesh rotation={[0.45, 0, 0]} castShadow material={toonMaterial(building.accentColor)}>
              <boxGeometry args={[2.6, 0.07, 1]} />
            </mesh>
          </group>
        ) : null}
      </group>
      <CuboidCollider
        args={[building.width / 2, building.height / 2, building.depth / 2]}
        position={[building.x, building.height / 2, building.z]}
      />
    </RigidBody>
  );
}

function Prop({ prop, night }: { prop: PropModel; night: boolean }) {
  const baseMat = toonMaterial(prop.color);
  const accentMat = toonMaterial(prop.accentColor, prop.kind === "lamp" ? prop.accentColor : undefined);
  return (
    <group position={[prop.x, 0, prop.z]} rotation={[0, prop.rotationY, 0]}>
      {prop.kind === "lamp" ? (
        <>
          <mesh position={[0, 1.6, 0]} castShadow material={baseMat}>
            <cylinderGeometry args={[0.07, 0.1, 3.2, 8]} />
          </mesh>
          <mesh position={[0, 3.3, 0]} material={accentMat}>
            <sphereGeometry args={[0.28, 12, 8]} />
          </mesh>
          {night ? (
            <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[7, 7]} />
              <meshBasicMaterial
                map={lightPoolTexture()}
                color="#ffc878"
                transparent
                opacity={0.5}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
          ) : null}
        </>
      ) : prop.kind === "bench" ? (
        <mesh position={[0, 0.3, 0]} castShadow material={baseMat}>
          <boxGeometry args={[1.8, 0.6, 0.6]} />
        </mesh>
      ) : prop.kind === "planter" ? (
        <Planter prop={prop} baseMat={baseMat} />
      ) : prop.kind === "crate" ? (
        <mesh position={[0, 0.45, 0]} castShadow material={baseMat}>
          <boxGeometry args={[0.9, 0.9, 0.9]} />
        </mesh>
      ) : prop.kind === "dummy" ? (
        <>
          <mesh position={[0, 0.9, 0]} castShadow material={baseMat}>
            <cylinderGeometry args={[0.16, 0.2, 1.8, 8]} />
          </mesh>
          <mesh position={[0, 1.95, 0]} castShadow material={accentMat}>
            <sphereGeometry args={[0.3, 10, 8]} />
          </mesh>
        </>
      ) : prop.kind === "stall" ? (
        <>
          <mesh position={[0, 0.55, 0]} castShadow material={baseMat}>
            <boxGeometry args={[2, 1.1, 1]} />
          </mesh>
          <mesh position={[0, 2, 0]} castShadow material={accentMat}>
            <boxGeometry args={[2.3, 0.12, 1.4]} />
          </mesh>
          <mesh position={[-1, 1.4, 0]} material={baseMat}>
            <cylinderGeometry args={[0.05, 0.05, 1.4, 6]} />
          </mesh>
          <mesh position={[1, 1.4, 0]} material={baseMat}>
            <cylinderGeometry args={[0.05, 0.05, 1.4, 6]} />
          </mesh>
        </>
      ) : prop.kind === "tree" ? (
        <Tree prop={prop} />
      ) : prop.kind === "bush" ? (
        <NatureProp prop={prop} kind="bush" baseMat={baseMat} targetHeight={0.75} />
      ) : prop.kind === "grass" ? (
        <NatureProp prop={prop} kind="grass" baseMat={baseMat} targetHeight={0.5} />
      ) : prop.kind === "flower" ? (
        <NatureProp prop={prop} kind="flower" baseMat={baseMat} targetHeight={0.4} />
      ) : prop.kind === "rock" ? (
        <NatureProp prop={prop} kind="rock" baseMat={baseMat} targetHeight={0.5} />
      ) : prop.kind === "mushroom" ? (
        <NatureProp prop={prop} kind="mushroom" baseMat={baseMat} targetHeight={0.5} />
      ) : prop.kind === "fence" ? (
        <Fence prop={prop} baseMat={baseMat} />
      ) : (
        // sign
        <>
          <mesh position={[0, 1, 0]} castShadow material={baseMat}>
            <cylinderGeometry args={[0.06, 0.08, 2, 6]} />
          </mesh>
          <mesh position={[0, 1.9, 0]} castShadow material={accentMat}>
            <boxGeometry args={[1.1, 0.7, 0.08]} />
          </mesh>
        </>
      )}
    </group>
  );
}

function Tree({ prop }: { prop: PropModel }) {
  const hash = stableHash(prop.id);
  const scale = 0.85 + ((hash >> 4) % 40) / 100;
  const trunk = toonMaterial(prop.accentColor);
  const foliage = toonMaterial(prop.color);
  const foliageDark = toonMaterial(shiftColor(prop.color, -0.18));

  // Pick a Kenney tree GLB deterministically. Falls back to the procedural
  // capsule + spheres below the Suspense boundary if the GLB is missing or
  // still streaming.
  const treeUrl = useMemo(() => {
    const list = NATURE_ASSETS.tree;
    return list.length > 0 ? pickAsset(list, hash) : null;
  }, [hash]);

  const proceduralTree = (
    <group scale={scale}>
      <mesh position={[0, 1, 0]} castShadow material={trunk}>
        <cylinderGeometry args={[0.14, 0.22, 2, 7]} />
      </mesh>
      <mesh position={[0, 2.5, 0]} castShadow material={foliage}>
        <sphereGeometry args={[1.15, 12, 9]} />
        <Outlines thickness={OUTLINE_THICKNESS} color={OUTLINE} />
      </mesh>
      <mesh position={[0.55, 1.95, 0.25]} castShadow material={foliageDark}>
        <sphereGeometry args={[0.72, 10, 8]} />
      </mesh>
      <mesh position={[-0.5, 3.1, -0.2]} castShadow material={foliageDark}>
        <sphereGeometry args={[0.6, 10, 8]} />
      </mesh>
    </group>
  );

  if (!treeUrl) return proceduralTree;
  // Kenney nature trees are ~1m model units; normalize to ~3.2m city scale
  // and let the per-prop hash apply the same variance as the procedural path.
  const targetHeight = 3.2 * scale;
  return (
    <Suspense fallback={proceduralTree}>
      <ToonGlb url={treeUrl} targetHeight={targetHeight} rotationY={((hash >> 8) % 360) * (Math.PI / 180)} outline={false} />
    </Suspense>
  );
}

/**
 * Generic Kenney nature-prop renderer (bush/grass/flower/rock/mushroom).
 * Mirrors the Tree pattern: deterministic asset pick + Suspense fallback to a
 * tiny procedural shape so a missing GLB still reads as ground cover.
 */
function NatureProp({
  prop,
  kind,
  baseMat,
  targetHeight,
}: {
  prop: PropModel;
  kind: "bush" | "grass" | "flower" | "rock" | "mushroom";
  baseMat: THREE.Material;
  targetHeight: number;
}) {
  const hash = stableHash(prop.id);
  const url = useMemo(() => {
    const list = NATURE_ASSETS[kind];
    return list.length > 0 ? pickAsset(list, hash) : null;
  }, [kind, hash]);

  const fallback = (
    <mesh position={[0, targetHeight / 2, 0]} castShadow material={baseMat}>
      <sphereGeometry args={[targetHeight * 0.5, 8, 6]} />
    </mesh>
  );

  if (!url) return fallback;
  return (
    <Suspense fallback={fallback}>
      <ToonGlb
        url={url}
        targetHeight={targetHeight + ((hash >> 6) % 15) / 100}
        rotationY={((hash >> 8) % 360) * (Math.PI / 180)}
        outline={false}
      />
    </Suspense>
  );
}

/**
 * Kenney fence post/run segment. Rotation is provided by worldgen so the
 * fence line aligns with its plot edge.
 */
function Fence({ prop, baseMat }: { prop: PropModel; baseMat: THREE.Material }) {
  const hash = stableHash(prop.id);
  const url = useMemo(() => {
    const list = BUILDING_ASSETS.fence;
    return list.length > 0 ? pickAsset(list, hash) : null;
  }, [hash]);

  const fallback = (
    <mesh position={[0, 0.5, 0]} castShadow material={baseMat}>
      <boxGeometry args={[1.5, 1, 0.08]} />
    </mesh>
  );

  if (!url) return fallback;
  return (
    <Suspense fallback={fallback}>
      <ToonGlb url={url} targetHeight={1.0} outline={false} />
    </Suspense>
  );
}

/**
 * Planter: prefers Kenney planter GLB; falls back to the original procedural
 * box + foliage sphere so existing scenes keep their look.
 */
function Planter({ prop, baseMat }: { prop: PropModel; baseMat: THREE.Material }) {
  const hash = stableHash(prop.id);
  const url = useMemo(() => {
    const list = BUILDING_ASSETS.planter;
    return list.length > 0 ? pickAsset(list, hash) : null;
  }, [hash]);

  const fallback = (
    <>
      <mesh position={[0, 0.3, 0]} castShadow material={baseMat}>
        <boxGeometry args={[1.2, 0.6, 1.2]} />
      </mesh>
      <mesh position={[0, 0.95, 0]} castShadow material={toonMaterial("#5d9c59")}>
        <sphereGeometry args={[0.55, 10, 8]} />
      </mesh>
    </>
  );

  if (!url) return fallback;
  return (
    <Suspense fallback={fallback}>
      <ToonGlb url={url} targetHeight={0.5} outline={false} />
    </Suspense>
  );
}

export function ItemMarker({ item }: { item: ItemPlacement }) {
  const material = toonMaterial(item.visual.color, item.visual.emissiveColor);
  return (
    <group position={[item.x, 0, item.z]}>
      <mesh position={[0, 0.7, 0]} castShadow material={material} userData={{ interaction: { kind: "item", id: item.itemId, label: item.name, verb: "Pick up" } }}>
        {item.visual.shape === "note" ? (
          <boxGeometry args={[0.5, 0.04, 0.36]} />
        ) : item.visual.shape === "gear" ? (
          <torusGeometry args={[0.28, 0.1, 8, 12]} />
        ) : item.visual.shape === "core" ? (
          <octahedronGeometry args={[0.32]} />
        ) : (
          <icosahedronGeometry args={[0.26]} />
        )}
        <Outlines thickness={OUTLINE_THICKNESS} color={OUTLINE} />
      </mesh>
    </group>
  );
}

export function InteractableMarker({ prop }: { prop: InteractablePlacement }) {
  const material = toonMaterial(prop.inspected ? "#5b6678" : "#cfd8e8", prop.inspected ? undefined : prop.accentColor);
  return (
    <group position={[prop.x, 0, prop.z]}>
      <mesh position={[0, 0.55, 0]} castShadow material={material} userData={{ interaction: { kind: "prop", id: prop.propId, label: prop.name, verb: "Inspect" } }}>
        <boxGeometry args={[0.8, 1.1, 0.8]} />
        <Outlines thickness={OUTLINE_THICKNESS} color={OUTLINE} />
      </mesh>
    </group>
  );
}
