import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { memo, useMemo } from "react";
import * as THREE from "three";

import { shiftColor } from "../worldgen/district.ts";
import type { WorldModel } from "../worldgen/index.ts";
import { crosswalkTexture, speckleTexture, streetTexture } from "./textures.ts";
import { toonGradientMap, toonMaterial } from "./toon.ts";

const APRON = 14;
const manholeMat = new THREE.MeshBasicMaterial({ color: "#23272f" });
const manholeRimMat = new THREE.MeshBasicMaterial({ color: "#3b414d" });

export const CityGround = memo(function CityGround({ model, baseColor }: { model: WorldModel; baseColor: string }) {
  const { bounds } = model;
  const width = bounds.maxX - bounds.minX + APRON * 2;
  const depth = bounds.maxZ - bounds.minZ + APRON * 2;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const edgeMat = toonMaterial("#3a4150");

  const groundMat = useMemo(() => {
    const texture = speckleTexture(shiftColor(baseColor, 0.06)).clone();
    texture.repeat.set(width / 14, depth / 14);
    texture.needsUpdate = true;
    return new THREE.MeshToonMaterial({ map: texture, gradientMap: toonGradientMap() });
  }, [baseColor, width, depth]);

  const streetSegments = useMemo(
    () =>
      model.streets.flatMap((street) =>
        segments(street.points).map((segment) => {
          const length = segment.length + street.width * 0.9;
          const texture = streetTexture().clone();
          texture.repeat.set(1, Math.max(1, Math.round(length / 5)));
          texture.needsUpdate = true;
          return {
            ...segment,
            width: street.width,
            length,
            material: new THREE.MeshToonMaterial({ map: texture, gradientMap: toonGradientMap() }),
          };
        })
      ),
    [model]
  );

  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        <mesh position={[cx, -0.09, cz]} receiveShadow material={groundMat}>
          <boxGeometry args={[width, 0.16, depth]} />
        </mesh>
        <CuboidCollider args={[width / 2, 0.08, depth / 2]} position={[cx, -0.08, cz]} />
        {/* outer walls so the player cannot fall off the world */}
        <CuboidCollider args={[width / 2, 6, 0.5]} position={[cx, 6, cz - depth / 2]} />
        <CuboidCollider args={[width / 2, 6, 0.5]} position={[cx, 6, cz + depth / 2]} />
        <CuboidCollider args={[0.5, 6, depth / 2]} position={[cx - width / 2, 6, cz]} />
        <CuboidCollider args={[0.5, 6, depth / 2]} position={[cx + width / 2, 6, cz]} />
      </RigidBody>
      {streetSegments.map((segment, index) => (
        <mesh
          key={index}
          position={[segment.cx, 0.012, segment.cz]}
          rotation={[0, segment.angle, 0]}
          receiveShadow
          material={segment.material}
        >
          <boxGeometry args={[segment.width, 0.024, segment.length]} />
        </mesh>
      ))}
      {/* manholes: one per longer street segment, nudged off the centerline */}
      {streetSegments
        .filter((segment) => segment.length > 14)
        .map((segment, index) => (
          <group key={`mh-${index}`} position={[segment.cx, 0.028, segment.cz]} rotation={[0, segment.angle, 0]}>
            <mesh position={[index % 2 === 0 ? 1.1 : -1.1, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} material={manholeMat}>
              <circleGeometry args={[0.55, 16]} />
            </mesh>
            <mesh position={[index % 2 === 0 ? 1.1 : -1.1, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} material={manholeRimMat}>
              <ringGeometry args={[0.42, 0.5, 16]} />
            </mesh>
          </group>
        ))}
      {/* crosswalks at district gates */}
      {model.gates.map((gate, index) => (
        <mesh
          key={`cw-${index}`}
          position={[gate.x, 0.026, gate.z]}
          rotation={[-Math.PI / 2, 0, gate.rotationY]}
        >
          <planeGeometry args={[6.4, 3]} />
          <meshBasicMaterial map={crosswalkTexture()} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-1} />
        </mesh>
      ))}
      {/* every building has a real door */}
      {model.doors.map((door) => {
        const rotY = Math.atan2(door.outsideX - door.x, door.outsideZ - door.z);
        return (
          <group key={door.buildingId} position={[door.x, 0, door.z]} rotation={[0, rotY, 0]}>
            <mesh position={[0, 1.25, 0.1]} castShadow material={toonMaterial("#4a3527")}>
              <boxGeometry args={[1.4, 2.5, 0.16]} />
            </mesh>
            <mesh position={[0, 2.58, 0.12]} material={toonMaterial("#ffe9b0", "#ffe9b0")}>
              <sphereGeometry args={[0.1, 8, 6]} />
            </mesh>
          </group>
        );
      })}
      {model.gates.map((gate, index) => (
        <group key={index} position={[gate.x, 0, gate.z]} rotation={[0, gate.rotationY, 0]}>
          <mesh position={[-3.2, 1.8, 0]} castShadow material={edgeMat}>
            <cylinderGeometry args={[0.18, 0.24, 3.6, 8]} />
          </mesh>
          <mesh position={[3.2, 1.8, 0]} castShadow material={edgeMat}>
            <cylinderGeometry args={[0.18, 0.24, 3.6, 8]} />
          </mesh>
          <mesh position={[0, 3.7, 0]} castShadow material={edgeMat}>
            <boxGeometry args={[7.4, 0.35, 0.4]} />
          </mesh>
          {/* hanging gate lantern */}
          <mesh position={[0, 3.3, 0]} material={toonMaterial("#ffe9b0", "#ffe9b0")}>
            <sphereGeometry args={[0.16, 10, 8]} />
          </mesh>
        </group>
      ))}
    </>
  );
});

function segments(points: Array<{ x: number; z: number }>) {
  const result: Array<{ cx: number; cz: number; length: number; angle: number }> = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index]!;
    const b = points[index + 1]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    result.push({
      cx: (a.x + b.x) / 2,
      cz: (a.z + b.z) / 2,
      length: Math.hypot(dx, dz),
      angle: Math.atan2(dx, dz),
    });
  }
  return result;
}
