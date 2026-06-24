import { memo, useMemo } from 'react';
import * as THREE from 'three';

import type { WorldModel } from '../worldgen/index.ts';
import { mulberry32, seedFromString } from '../worldgen/rng.ts';
import { toonGradientMap } from './toon.ts';

/**
 * Distant silhouette ring so the world doesn't end at an empty apron.
 * Pure backdrop: no shadows, no colliders, a sparse emissive speckle at night.
 */
export const Skyline = memo(function Skyline({
  model,
  worldId,
  night,
}: {
  model: WorldModel;
  worldId: string;
  night: boolean;
}) {
  const { bounds } = model;

  const towers = useMemo(() => {
    const rng = mulberry32(seedFromString(`${worldId}:skyline`));
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;
    const radius = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2 + 90;
    const result: Array<{ x: number; z: number; w: number; h: number; d: number; tone: number }> =
      [];
    const count = 46;
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2 + rng() * 0.1;
      const distance = radius + rng() * 70;
      result.push({
        x: cx + Math.cos(angle) * distance,
        z: cz + Math.sin(angle) * distance,
        w: 10 + rng() * 22,
        h: 14 + rng() * 46,
        d: 10 + rng() * 22,
        tone: rng(),
      });
    }
    return result;
  }, [bounds, worldId]);

  const materials = useMemo(() => {
    const make = (color: string) =>
      new THREE.MeshToonMaterial({
        color: new THREE.Color(color),
        gradientMap: toonGradientMap(),
        ...(night ? { emissive: new THREE.Color('#3a3550'), emissiveIntensity: 0.22 } : {}),
      });
    return [make(night ? '#171c2c' : '#5c6a82'), make(night ? '#131826' : '#4e5c74')];
  }, [night]);

  return (
    <group>
      {towers.map((tower, index) => (
        <mesh
          key={index}
          position={[tower.x, tower.h / 2, tower.z]}
          material={materials[tower.tone > 0.5 ? 0 : 1]}
        >
          <boxGeometry args={[tower.w, tower.h, tower.d]} />
        </mesh>
      ))}
    </group>
  );
});
