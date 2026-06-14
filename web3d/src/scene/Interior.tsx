import { Billboard, Text } from "@react-three/drei";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { memo, Suspense, useMemo } from "react";
import * as THREE from "three";

import type { CharacterAppearance } from "../../../src/types.ts";
import { RiggedCharacter } from "../characters/RiggedCharacter.tsx";
import { actorVisualFor, clothingColorsFor, stableHash } from "../mapping/visuals.ts";
import type { FurnitureKind, FurnitureModel, InteriorModel } from "../worldgen/interiors.ts";
import { FURNITURE_ASSETS, pickAsset } from "./asset-registry.ts";
import { ToonGlb } from "./kenneyGlb.tsx";
import { brickTexture, crackedWallTexture, lightPoolTexture, plankTexture, tileTexture } from "./textures.ts";
import { toonGradientMap, toonMaterial } from "./toon.ts";

const WALL_THICKNESS = 0.35;
const DOOR_GAP = 2.4;

export const Interior = memo(function Interior({
  interior,
  npcs,
}: {
  interior: InteriorModel;
  npcs: Array<{ id: string; role?: string; description?: string; appearance?: CharacterAppearance }>;
}) {
  const { origin, width, depth, wallHeight, preset } = interior;
  const cx = origin.x + width / 2;
  const cz = origin.z + depth / 2;

  const floorMat = useMemo(() => {
    let texture: THREE.CanvasTexture;
    if (preset.floorTexture === "stone") {
      texture = brickTexture(interior.floorColor).clone();
    } else if (preset.floorTexture === "tile") {
      texture = tileTexture(interior.floorColor).clone();
    } else {
      texture = plankTexture(interior.floorColor).clone();
    }
    texture.repeat.set(width / 5, depth / 5);
    texture.needsUpdate = true;
    return new THREE.MeshToonMaterial({ map: texture, gradientMap: toonGradientMap() });
  }, [interior.floorColor, preset.floorTexture, width, depth]);

  // Walls are semi-transparent so the third-person camera can see into the room
  // from outside (an opaque box hides the player + the exit door). Fresh material
  // per room — never mutate the shared toonMaterial cache.
  const wallMat = useMemo(() => {
    const base: THREE.MeshToonMaterialParameters = { gradientMap: toonGradientMap(), transparent: true, opacity: 0.5, depthWrite: false };
    if (preset.wallTexture === "brick") {
      const texture = brickTexture(interior.wallColor).clone();
      texture.repeat.set(width / 4, wallHeight / 2);
      texture.needsUpdate = true;
      return new THREE.MeshToonMaterial({ ...base, map: texture });
    }
    if (preset.wallTexture === "broken") {
      const texture = crackedWallTexture(interior.wallColor).clone();
      texture.repeat.set(width / 4, wallHeight / 2);
      texture.needsUpdate = true;
      return new THREE.MeshToonMaterial({ ...base, map: texture });
    }
    return new THREE.MeshToonMaterial({ ...base, color: new THREE.Color(interior.wallColor) });
  }, [interior.wallColor, preset.wallTexture, width, wallHeight]);

  const trimMat = toonMaterial(interior.accentColor);

  // south wall (exit side) is split around the door gap
  const gapCenter = interior.exit.x;
  const southZ = origin.z + depth;
  const leftWidth = Math.max(0.1, gapCenter - DOOR_GAP / 2 - origin.x);
  const rightWidth = Math.max(0.1, origin.x + width - (gapCenter + DOOR_GAP / 2));

  // inhabitant npc visual
  const inhabitant = interior.inhabitantId ? npcs.find((n) => n.id === interior.inhabitantId) : null;
  const inhabitantVisual = useMemo(() => {
    if (!inhabitant) return null;
    const fallback = clothingColorsFor(inhabitant.id);
    const base = actorVisualFor(inhabitant.appearance, fallback.color);
    return base.accentColor === base.color ? { ...base, accentColor: fallback.accent } : base;
  }, [inhabitant]);

  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        {/* floor */}
        <mesh position={[cx, -0.05, cz]} receiveShadow material={floorMat}>
          <boxGeometry args={[width + 1, 0.1, depth + 1]} />
        </mesh>
        <CuboidCollider args={[(width + 1) / 2, 0.05, (depth + 1) / 2]} position={[cx, -0.05, cz]} />

        {/* north / west / east walls */}
        <mesh position={[cx, wallHeight / 2, origin.z]} castShadow receiveShadow material={wallMat}>
          <boxGeometry args={[width, wallHeight, WALL_THICKNESS]} />
        </mesh>
        <CuboidCollider args={[width / 2, wallHeight / 2, WALL_THICKNESS / 2]} position={[cx, wallHeight / 2, origin.z]} />
        <mesh position={[origin.x, wallHeight / 2, cz]} castShadow receiveShadow material={wallMat}>
          <boxGeometry args={[WALL_THICKNESS, wallHeight, depth]} />
        </mesh>
        <CuboidCollider args={[WALL_THICKNESS / 2, wallHeight / 2, depth / 2]} position={[origin.x, wallHeight / 2, cz]} />
        <mesh position={[origin.x + width, wallHeight / 2, cz]} castShadow receiveShadow material={wallMat}>
          <boxGeometry args={[WALL_THICKNESS, wallHeight, depth]} />
        </mesh>
        <CuboidCollider args={[WALL_THICKNESS / 2, wallHeight / 2, depth / 2]} position={[origin.x + width, wallHeight / 2, cz]} />

        {/* south wall split around the doorway */}
        <mesh position={[origin.x + leftWidth / 2, wallHeight / 2, southZ]} castShadow receiveShadow material={wallMat}>
          <boxGeometry args={[leftWidth, wallHeight, WALL_THICKNESS]} />
        </mesh>
        <CuboidCollider args={[leftWidth / 2, wallHeight / 2, WALL_THICKNESS / 2]} position={[origin.x + leftWidth / 2, wallHeight / 2, southZ]} />
        <mesh position={[origin.x + width - rightWidth / 2, wallHeight / 2, southZ]} castShadow receiveShadow material={wallMat}>
          <boxGeometry args={[rightWidth, wallHeight, WALL_THICKNESS]} />
        </mesh>
        <CuboidCollider
          args={[rightWidth / 2, wallHeight / 2, WALL_THICKNESS / 2]}
          position={[origin.x + width - rightWidth / 2, wallHeight / 2, southZ]}
        />
        {/* door lintel */}
        <mesh position={[gapCenter, wallHeight - 0.3, southZ]} material={trimMat}>
          <boxGeometry args={[DOOR_GAP + 0.4, 0.6, WALL_THICKNESS + 0.08]} />
        </mesh>
      </RigidBody>

      {/* skirting trim — omitted on abandoned rooms (no intact skirting) */}
      {preset.wallDressing !== "boarded" ? (
        <>
          <mesh position={[cx, 0.12, origin.z + WALL_THICKNESS / 2 + 0.04]} material={trimMat}>
            <boxGeometry args={[width - 0.2, 0.24, 0.06]} />
          </mesh>
          <mesh position={[origin.x + WALL_THICKNESS / 2 + 0.04, 0.12, cz]} material={trimMat}>
            <boxGeometry args={[0.06, 0.24, depth - 0.2]} />
          </mesh>
          <mesh position={[origin.x + width - WALL_THICKNESS / 2 - 0.04, 0.12, cz]} material={trimMat}>
            <boxGeometry args={[0.06, 0.24, depth - 0.2]} />
          </mesh>
        </>
      ) : null}

      {/* wall dressing varies per role */}
      <WallDressing interior={interior} cx={cx} />

      {/* layout feature: one distinguishing structural element per role */}
      <LayoutFeature interior={interior} cx={cx} cz={cz} />

      {interior.furniture.map((piece) => (
        <Furniture key={piece.id} piece={piece} />
      ))}

      {/* ceiling fixture — dim or absent for forge/abandoned */}
      {preset.role !== "abandoned" ? (
        <group position={[cx, 0, cz]}>
          <mesh position={[0, wallHeight - 0.25, 0]} material={toonMaterial("#3a3f4c")}>
            <cylinderGeometry args={[0.05, 0.05, 0.5, 6]} />
          </mesh>
          <mesh position={[0, wallHeight - 0.58, 0]} material={toonMaterial("#ffe7bd", "#ffd9a0")}>
            <sphereGeometry args={[0.2, 12, 10]} />
          </mesh>
          <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[Math.min(width, depth) * 0.9, Math.min(width, depth) * 0.9]} />
            <meshBasicMaterial
              map={lightPoolTexture()}
              color="#ffd9a0"
              transparent
              opacity={preset.role === "forge" ? 0.1 : 0.22}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </group>
      ) : null}

      {/* warm room light — intensity and color vary per role */}
      <RoomLighting interior={interior} cx={cx} />

      <Billboard position={[cx, wallHeight + 1.2, cz]}>
        <Text fontSize={0.7} color="#ffffff" outlineWidth={0.04} outlineColor="#101421" anchorX="center">
          {interior.label}
        </Text>
      </Billboard>

      {/* inhabitant NPC rendered as a decorative character at their anchor */}
      {inhabitantVisual && interior.inhabitantAnchor ? (
        <group
          position={[interior.inhabitantAnchor.x, 0, interior.inhabitantAnchor.z]}
          rotation={[0, interior.inhabitantAnchor.rotationY, 0]}
        >
          <RiggedCharacter
            visual={inhabitantVisual}
            appearance={inhabitant?.appearance}
            seedId={interior.inhabitantId ?? ""}
            personaText={`${inhabitant?.role ?? ""} ${inhabitant?.description ?? ""}`}
          />
        </group>
      ) : null}
    </group>
  );
});

// ---------------------------------------------------------------------------
// Room lighting

function RoomLighting({ interior, cx }: { interior: InteriorModel; cx: number }) {
  const { origin, depth, wallHeight, preset } = interior;
  const cz = origin.z + depth / 2;

  if (preset.role === "abandoned") {
    // only a dim cool crack of daylight through the boarded window
    return <pointLight position={[cx - interior.width * 0.22, wallHeight - 0.5, origin.z + WALL_THICKNESS + 0.5]} color="#9ab8c8" intensity={6} distance={8} decay={2} />;
  }

  if (preset.role === "forge") {
    // primary warm source is the forge/hearth; overhead is very dim
    return (
      <>
        <pointLight position={[cx, wallHeight - 0.4, cz]} color="#b07850" intensity={preset.ambientIntensity} distance={Math.max(interior.width, depth) * 1.4} decay={1.7} />
        {/* extra orange forge glow near hearth/anvil */}
        <pointLight position={[cx - interior.width * 0.18, 0.8, origin.z + depth * 0.3]} color="#ff7020" intensity={14} distance={6} decay={1.8} />
      </>
    );
  }

  if (preset.role === "tavern") {
    // multiple warm pendant-like lights along the length
    return (
      <>
        <pointLight position={[cx, wallHeight - 0.4, cz]} color="#ffc870" intensity={preset.ambientIntensity} distance={Math.max(interior.width, depth) * 1.4} decay={1.7} />
        <pointLight position={[origin.x + interior.width * 0.25, wallHeight - 0.6, cz - depth * 0.2]} color="#ffd070" intensity={14} distance={7} decay={1.9} />
        <pointLight position={[origin.x + interior.width * 0.75, wallHeight - 0.6, cz + depth * 0.2]} color="#ffd070" intensity={14} distance={7} decay={1.9} />
      </>
    );
  }

  // home / default: single warm overhead
  return <pointLight position={[cx, wallHeight - 0.4, cz]} color="#ffd9a8" intensity={preset.ambientIntensity} distance={Math.max(interior.width, depth) * 1.4} decay={1.7} />;
}

// ---------------------------------------------------------------------------
// Wall dressing

const ART_COLORS = ["#7fb0d8", "#d8a26a", "#9cc78a", "#c98aa8", "#b9a2e0", "#e0c878"];

function WallDressing({ interior, cx }: { interior: InteriorModel; cx: number }) {
  const { origin, width, wallHeight, preset } = interior;
  const hash = stableHash(interior.buildingId);
  const backZ = origin.z + WALL_THICKNESS / 2 + 0.06;
  const artA = ART_COLORS[hash % ART_COLORS.length]!;
  const artB = ART_COLORS[(hash >> 3) % ART_COLORS.length]!;
  const artC = ART_COLORS[(hash >> 6) % ART_COLORS.length]!;
  const artY = Math.min(wallHeight - 0.9, 1.9);

  if (preset.wallDressing === "boarded") {
    // abandoned: boarded-up window, no art
    return (
      <group>
        <mesh position={[cx - width * 0.22, artY, backZ]} material={toonMaterial("#2a2520")}>
          <boxGeometry args={[1.5, 1.2, 0.06]} />
        </mesh>
        {/* crossing planks over the window */}
        <mesh position={[cx - width * 0.22, artY, backZ + 0.04]} material={toonMaterial("#5a4830")}>
          <boxGeometry args={[1.4, 0.18, 0.04]} />
        </mesh>
        <mesh position={[cx - width * 0.22, artY, backZ + 0.04]} rotation={[0, 0, 0.55]} material={toonMaterial("#5a4830")}>
          <boxGeometry args={[1.5, 0.14, 0.04]} />
        </mesh>
        <mesh position={[cx - width * 0.22, artY, backZ + 0.04]} rotation={[0, 0, -0.55]} material={toonMaterial("#5a4830")}>
          <boxGeometry args={[1.5, 0.14, 0.04]} />
        </mesh>
      </group>
    );
  }

  if (preset.wallDressing === "banners") {
    // tavern: banner strips and a lantern hook instead of paintings
    return (
      <group>
        {/* window */}
        <mesh position={[cx - width * 0.22, artY, backZ]} material={toonMaterial("#4a4034")}>
          <boxGeometry args={[1.5, 1.2, 0.06]} />
        </mesh>
        <mesh position={[cx - width * 0.22, artY, backZ + 0.035]} material={toonMaterial("#bcd8f0", "#9cc0e8")}>
          <boxGeometry args={[1.3, 1, 0.02]} />
        </mesh>
        <mesh position={[cx - width * 0.22, artY, backZ + 0.05]} material={toonMaterial("#4a4034")}>
          <boxGeometry args={[0.06, 1, 0.02]} />
        </mesh>
        {/* hanging banner strip A */}
        <mesh position={[cx + width * 0.18, artY + 0.2, backZ]} material={toonMaterial(artA)}>
          <boxGeometry args={[0.55, 1.4, 0.04]} />
        </mesh>
        <mesh position={[cx + width * 0.18, artY + 0.96, backZ - 0.02]} material={toonMaterial("#3a2a18")}>
          <boxGeometry args={[0.65, 0.1, 0.06]} />
        </mesh>
        {/* hanging banner strip B */}
        <mesh position={[cx + width * 0.34, artY - 0.1, backZ]} material={toonMaterial(artB)}>
          <boxGeometry args={[0.4, 1.0, 0.04]} />
        </mesh>
        <mesh position={[cx + width * 0.34, artY + 0.46, backZ - 0.02]} material={toonMaterial("#3a2a18")}>
          <boxGeometry args={[0.5, 0.1, 0.06]} />
        </mesh>
      </group>
    );
  }

  if (preset.wallDressing === "many-frames") {
    // home: three small family-portrait frames
    return (
      <group>
        {/* window */}
        <mesh position={[cx - width * 0.22, artY, backZ]} material={toonMaterial("#4a4034")}>
          <boxGeometry args={[1.5, 1.2, 0.06]} />
        </mesh>
        <mesh position={[cx - width * 0.22, artY, backZ + 0.035]} material={toonMaterial("#bcd8f0", "#9cc0e8")}>
          <boxGeometry args={[1.3, 1, 0.02]} />
        </mesh>
        <mesh position={[cx - width * 0.22, artY, backZ + 0.05]} material={toonMaterial("#4a4034")}>
          <boxGeometry args={[0.06, 1, 0.02]} />
        </mesh>
        {/* three small portrait frames */}
        {[0, 0.58, 1.16].map((offsetX, i) => (
          <group key={offsetX}>
            <mesh position={[cx + width * 0.16 + offsetX, artY + (i === 1 ? 0.12 : 0), backZ]} material={toonMaterial("#3d3225")}>
              <boxGeometry args={[0.46, 0.58, 0.05]} />
            </mesh>
            <mesh position={[cx + width * 0.16 + offsetX, artY + (i === 1 ? 0.12 : 0), backZ + 0.03]} material={toonMaterial([artA, artB, artC][i]!)}>
              <boxGeometry args={[0.34, 0.46, 0.02]} />
            </mesh>
          </group>
        ))}
      </group>
    );
  }

  // standard: window + two framed art pieces (forge and default)
  return (
    <group>
      <mesh position={[cx - width * 0.22, artY, backZ]} material={toonMaterial("#4a4034")}>
        <boxGeometry args={[1.5, 1.2, 0.06]} />
      </mesh>
      <mesh position={[cx - width * 0.22, artY, backZ + 0.035]} material={toonMaterial("#bcd8f0", "#9cc0e8")}>
        <boxGeometry args={[1.3, 1, 0.02]} />
      </mesh>
      <mesh position={[cx - width * 0.22, artY, backZ + 0.05]} material={toonMaterial("#4a4034")}>
        <boxGeometry args={[0.06, 1, 0.02]} />
      </mesh>
      {/* two framed pieces */}
      <mesh position={[cx + width * 0.2, artY + 0.1, backZ]} material={toonMaterial("#3d3225")}>
        <boxGeometry args={[0.9, 0.7, 0.05]} />
      </mesh>
      <mesh position={[cx + width * 0.2, artY + 0.1, backZ + 0.03]} material={toonMaterial(artA)}>
        <boxGeometry args={[0.74, 0.54, 0.02]} />
      </mesh>
      <mesh position={[cx + width * 0.34, artY - 0.35, backZ]} material={toonMaterial("#3d3225")}>
        <boxGeometry args={[0.5, 0.5, 0.05]} />
      </mesh>
      <mesh position={[cx + width * 0.34, artY - 0.35, backZ + 0.03]} material={toonMaterial(artB)}>
        <boxGeometry args={[0.38, 0.38, 0.02]} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Layout features: one distinguishing structural element per role

function LayoutFeature({ interior, cx, cz }: { interior: InteriorModel; cx: number; cz: number }) {
  const { origin, width, depth, wallHeight, preset, accentColor } = interior;

  if (preset.role === "tavern") {
    // curtain divider between main floor and a small back area
    const curtainZ = origin.z + depth * 0.6;
    const curtainColor = accentColor;
    return (
      <group>
        {/* curtain rod */}
        <mesh position={[cx, wallHeight * 0.72, curtainZ]} rotation={[0, 0, Math.PI / 2]} material={toonMaterial("#5a4830")}>
          <cylinderGeometry args={[0.025, 0.025, width - 1.2, 6]} />
        </mesh>
        {/* curtain panels — three panels with gaps */}
        {[-1.4, 0, 1.4].map((offset) => (
          <mesh key={offset} position={[cx + offset, wallHeight * 0.44, curtainZ]} material={toonMaterial(curtainColor)}>
            <boxGeometry args={[0.9, wallHeight * 0.58, 0.05]} />
          </mesh>
        ))}
      </group>
    );
  }

  if (preset.role === "forge") {
    // cooling trough: a shallow rectangular pool with blue-tinted water
    const troughX = origin.x + width * 0.72;
    const troughZ = origin.z + depth * 0.38;
    return (
      <group>
        {/* trough body */}
        <mesh position={[troughX, 0.18, troughZ]} castShadow material={toonMaterial("#5b5e66")}>
          <boxGeometry args={[1.8, 0.36, 0.8]} />
        </mesh>
        {/* water surface */}
        <mesh position={[troughX, 0.34, troughZ]}>
          <boxGeometry args={[1.6, 0.04, 0.64]} />
          <meshBasicMaterial color="#2a6a9a" transparent opacity={0.72} depthWrite={false} />
        </mesh>
        {/* exposed beam ceiling strip above anvil area */}
        <mesh position={[cx, wallHeight - 0.18, origin.z + depth * 0.3]} material={toonMaterial("#4a3820")}>
          <boxGeometry args={[width * 0.55, 0.2, 0.32]} />
        </mesh>
        <mesh position={[cx, wallHeight - 0.18, origin.z + depth * 0.7]} material={toonMaterial("#4a3820")}>
          <boxGeometry args={[width * 0.55, 0.2, 0.32]} />
        </mesh>
      </group>
    );
  }

  if (preset.role === "home") {
    // bedroom alcove: a half-wall partition, ~1.5m tall, behind the bed area
    const partitionX = origin.x + width * 0.6;
    return (
      <group>
        <mesh position={[partitionX, 0.75, cz - depth * 0.1]} castShadow material={toonMaterial(interior.wallColor)}>
          <boxGeometry args={[WALL_THICKNESS, 1.5, depth * 0.5]} />
        </mesh>
        <CuboidCollider args={[WALL_THICKNESS / 2, 0.75, depth * 0.25]} position={[partitionX, 0.75, cz - depth * 0.1]} />
      </group>
    );
  }

  if (preset.role === "abandoned") {
    // rubble pile in the northwest corner
    const rubbleX = origin.x + 1.4;
    const rubbleZ = origin.z + 1.4;
    return (
      <group>
        <mesh position={[rubbleX, 0.18, rubbleZ]} material={toonMaterial("#58585e")}>
          <boxGeometry args={[1.6, 0.36, 1.2]} />
        </mesh>
        <mesh position={[rubbleX + 0.3, 0.38, rubbleZ - 0.2]} material={toonMaterial("#4a4e56")}>
          <boxGeometry args={[0.7, 0.28, 0.5]} />
        </mesh>
        <mesh position={[rubbleX - 0.4, 0.32, rubbleZ + 0.3]} material={toonMaterial("#62575a")}>
          <boxGeometry args={[0.5, 0.24, 0.4]} />
        </mesh>
        {/* missing wall corner: a dark void patch to suggest the wall is broken */}
        <mesh position={[origin.x + 0.3, wallHeight * 0.5, origin.z + 0.3]} material={toonMaterial("#161820")}>
          <boxGeometry args={[0.8, wallHeight * 0.7, 0.1]} />
        </mesh>
      </group>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Furniture

/**
 * Approximate target height (in world meters) to scale a Kenney Furniture Kit
 * GLB to, per `FurnitureKind`. The kit ships at ~half-scale relative to our
 * world, so each kind picks a value that makes the prop read as real-room-
 * sized next to the player capsule. Kinds not in this table fall through to
 * the procedural body (forge signature pieces).
 */
const FURNITURE_GLB_HEIGHT: Partial<Record<FurnitureKind, number>> = {
  bed: 0.65,
  table: 0.85,
  chair: 0.95,
  counter: 1.0,
  shelf: 1.85,
  rug: 0.04,
  plant: 1.0,
  crate: 0.7,
};

/** Map worldgen `FurnitureKind` to the matching list in FURNITURE_ASSETS.
 *  Returns null for kinds with no Furniture Kit match (hearth/anvil/barrel
 *  stay procedural so forge identity reads). */
function glbListFor(kind: FurnitureKind): readonly string[] | null {
  switch (kind) {
    case "bed":
      return FURNITURE_ASSETS.bed;
    case "table":
      return FURNITURE_ASSETS.table;
    case "chair":
      return FURNITURE_ASSETS.chair;
    case "counter":
      return FURNITURE_ASSETS.counter;
    case "shelf":
      return FURNITURE_ASSETS.shelf;
    case "rug":
      return FURNITURE_ASSETS.rug;
    case "plant":
      return FURNITURE_ASSETS.plant;
    case "crate":
      return FURNITURE_ASSETS.crate;
    default:
      return null;
  }
}

function Furniture({ piece }: { piece: FurnitureModel }) {
  const wood = toonMaterial("#7a5a3d");
  const woodDark = toonMaterial("#5d4430");
  const base = toonMaterial(piece.color);
  const accent = toonMaterial(piece.accentColor);
  const proceduralBody = (() => {
    switch (piece.kind) {
      case "bed":
        return (
          <>
            <mesh position={[0, 0.25, 0]} castShadow material={woodDark}>
              <boxGeometry args={[1.2, 0.5, 2.2]} />
            </mesh>
            <mesh position={[0, 0.56, 0.1]} castShadow material={toonMaterial("#e8e3d5")}>
              <boxGeometry args={[1.1, 0.18, 1.9]} />
            </mesh>
            <mesh position={[0, 0.62, -0.8]} material={accent}>
              <boxGeometry args={[0.9, 0.16, 0.45]} />
            </mesh>
          </>
        );
      case "table":
        return (
          <>
            <mesh position={[0, 0.72, 0]} castShadow material={wood}>
              <boxGeometry args={[1.5, 0.1, 0.95]} />
            </mesh>
            <mesh position={[0, 0.35, 0]} material={woodDark}>
              <boxGeometry args={[0.16, 0.7, 0.16]} />
            </mesh>
          </>
        );
      case "chair":
        return (
          <>
            <mesh position={[0, 0.4, 0]} castShadow material={wood}>
              <boxGeometry args={[0.5, 0.08, 0.5]} />
            </mesh>
            <mesh position={[0, 0.72, -0.21]} castShadow material={wood}>
              <boxGeometry args={[0.5, 0.7, 0.08]} />
            </mesh>
            <mesh position={[0, 0.2, 0]} material={woodDark}>
              <boxGeometry args={[0.4, 0.4, 0.4]} />
            </mesh>
          </>
        );
      case "counter":
        return (
          <>
            <mesh position={[0, 0.5, 0]} castShadow material={base}>
              <boxGeometry args={[2.6, 1, 0.8]} />
            </mesh>
            <mesh position={[0, 1.03, 0]} castShadow material={wood}>
              <boxGeometry args={[2.8, 0.08, 0.95]} />
            </mesh>
          </>
        );
      case "shelf":
        return (
          <>
            <mesh position={[0, 1, 0]} castShadow material={wood}>
              <boxGeometry args={[1.4, 2, 0.4]} />
            </mesh>
            {[0.5, 1.05, 1.6].map((y) => (
              <mesh key={y} position={[0, y, 0.18]} material={woodDark}>
                <boxGeometry args={[1.3, 0.05, 0.06]} />
              </mesh>
            ))}
          </>
        );
      case "rug":
        return (
          <>
            <mesh position={[0, 0.02, 0]} receiveShadow material={accent}>
              <cylinderGeometry args={[1.15, 1.15, 0.03, 18]} />
            </mesh>
            <mesh position={[0, 0.035, 0]} receiveShadow material={base}>
              <cylinderGeometry args={[0.72, 0.72, 0.015, 18]} />
            </mesh>
          </>
        );
      case "hearth":
        return (
          <>
            <mesh position={[0, 0.55, 0]} castShadow material={toonMaterial("#5b5e66")}>
              <boxGeometry args={[1.4, 1.1, 0.7]} />
            </mesh>
            <mesh position={[0, 0.45, 0.28]} material={toonMaterial("#2b1a10", "#ff9a3d")}>
              <boxGeometry args={[0.8, 0.55, 0.2]} />
            </mesh>
            <pointLight position={[0, 0.6, 0.5]} color="#ff9a3d" intensity={6} distance={5} decay={1.8} />
          </>
        );
      case "anvil":
        return (
          <>
            <mesh position={[0, 0.3, 0]} castShadow material={toonMaterial("#4b505c")}>
              <boxGeometry args={[0.5, 0.6, 0.5]} />
            </mesh>
            <mesh position={[0, 0.66, 0]} castShadow material={toonMaterial("#666c7a")}>
              <boxGeometry args={[1, 0.22, 0.4]} />
            </mesh>
          </>
        );
      case "barrel":
        return (
          <mesh position={[0, 0.45, 0]} castShadow material={wood}>
            <cylinderGeometry args={[0.36, 0.32, 0.9, 12]} />
          </mesh>
        );
      case "crate":
        return (
          <mesh position={[0, 0.4, 0]} castShadow material={wood}>
            <boxGeometry args={[0.8, 0.8, 0.8]} />
          </mesh>
        );
      case "plant":
        return (
          <>
            <mesh position={[0, 0.25, 0]} castShadow material={toonMaterial("#8a5a3a")}>
              <cylinderGeometry args={[0.24, 0.3, 0.5, 10]} />
            </mesh>
            <mesh position={[0, 0.75, 0]} castShadow material={toonMaterial("#5d9c59")}>
              <sphereGeometry args={[0.42, 10, 8]} />
            </mesh>
          </>
        );
    }
  })();

  const glbList = glbListFor(piece.kind);
  const glbHeight = FURNITURE_GLB_HEIGHT[piece.kind];
  const glbUrl = glbList && glbList.length > 0 ? pickAsset(glbList, stableHash(piece.id)) : null;

  // Visual body: try a Kenney GLB for kinds we've curated, fall back to the
  // procedural primitives below the Suspense boundary so a missing/streaming
  // GLB still draws something sensible.
  const body = glbUrl && glbHeight ? (
    <Suspense fallback={proceduralBody}>
      <ToonGlb url={glbUrl} targetHeight={glbHeight} outline={false} />
    </Suspense>
  ) : (
    proceduralBody
  );

  const solid = piece.kind !== "rug";
  return (
    <group position={[piece.x, 0, piece.z]} rotation={[0, piece.rotationY, 0]}>
      {solid ? (
        <RigidBody type="fixed" colliders={false}>
          {body}
          <CuboidCollider args={[0.7, 0.6, 0.55]} position={[0, 0.6, 0]} />
        </RigidBody>
      ) : (
        body
      )}
    </group>
  );
}
