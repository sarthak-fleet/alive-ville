import { Text } from "@react-three/drei";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { memo } from "react";

import type { FurnitureModel, InteriorModel } from "../worldgen/interiors.ts";
import { toonMaterial } from "./toon.ts";

const WALL_THICKNESS = 0.35;
const DOOR_GAP = 2.4;

export const Interior = memo(function Interior({ interior }: { interior: InteriorModel }) {
  const { origin, width, depth, wallHeight } = interior;
  const cx = origin.x + width / 2;
  const cz = origin.z + depth / 2;
  const floorMat = toonMaterial(interior.floorColor);
  const wallMat = toonMaterial(interior.wallColor);
  const trimMat = toonMaterial(interior.accentColor);

  // south wall (exit side) is split around the door gap
  const gapCenter = interior.exit.x;
  const southZ = origin.z + depth;
  const leftWidth = Math.max(0.1, gapCenter - DOOR_GAP / 2 - origin.x);
  const rightWidth = Math.max(0.1, origin.x + width - (gapCenter + DOOR_GAP / 2));

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

      {/* skirting trim */}
      <mesh position={[cx, 0.12, origin.z + WALL_THICKNESS / 2 + 0.04]} material={trimMat}>
        <boxGeometry args={[width - 0.2, 0.24, 0.06]} />
      </mesh>

      {interior.furniture.map((piece) => (
        <Furniture key={piece.id} piece={piece} />
      ))}

      {/* warm room light */}
      <pointLight position={[cx, wallHeight - 0.4, cz]} color="#ffd9a8" intensity={30} distance={Math.max(width, depth) * 1.4} decay={1.7} />

      <Text position={[cx, wallHeight + 1.2, cz]} fontSize={0.7} color="#ffffff" outlineWidth={0.04} outlineColor="#101421" anchorX="center">
        {interior.label}
      </Text>
    </group>
  );
});

function Furniture({ piece }: { piece: FurnitureModel }) {
  const wood = toonMaterial("#7a5a3d");
  const woodDark = toonMaterial("#5d4430");
  const base = toonMaterial(piece.color);
  const accent = toonMaterial(piece.accentColor);
  const body = (() => {
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
          <mesh position={[0, 0.02, 0]} receiveShadow material={accent}>
            <cylinderGeometry args={[1.15, 1.15, 0.03, 18]} />
          </mesh>
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
