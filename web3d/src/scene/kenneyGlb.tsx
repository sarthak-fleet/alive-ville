// react-refresh/only-export-components is fine to ignore here: this file
// pairs a small hook with the component that consumes it, matching the
// `RiggedCharacter.tsx` pattern elsewhere in the scene layer.
/* eslint-disable react-refresh/only-export-components */
import { Outlines, useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { clone as cloneScene } from 'three/addons/utils/SkeletonUtils.js';

import { toonGradientMap } from './toon.ts';

/**
 * Cached intrinsic bounds (in model space) per GLB url. Used to size GLBs
 * to a target footprint without re-walking the geometry per instance.
 */
const boundsCache = new Map<
  string,
  { min: THREE.Vector3; max: THREE.Vector3; size: THREE.Vector3 }
>();

function getBounds(
  url: string,
  scene: THREE.Object3D
): { size: THREE.Vector3; min: THREE.Vector3 } {
  const cached = boundsCache.get(url);
  if (cached) return cached;
  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  box.getSize(size);
  const entry = { min: box.min.clone(), max: box.max.clone(), size };
  boundsCache.set(url, entry);
  return entry;
}

/**
 * Load a Kenney GLB, deep-clone it, and rebuild every mesh material as
 * `MeshToonMaterial`. This preserves the toon look (gradient ramp + outlines)
 * across the GLBs while keeping the original per-mesh colors from Kenney's
 * stock vertex/texture data.
 *
 * Results are memoized per (url) so each scene placement gets its own cloned
 * scene + materials (callers may scale/tint per-instance).
 */
function useToonGlb(
  url: string
): { scene: THREE.Group; size: THREE.Vector3; min: THREE.Vector3 } | null {
  // useGLTF caches the parsed gltf by url, so this is a single network/parse.
  const gltf = useGLTF(url) as { scene: THREE.Group };

  return useMemo(() => {
    if (!gltf?.scene) return null;
    const root = cloneScene(gltf.scene) as THREE.Group;
    const gradient = toonGradientMap();

    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
      const original = mesh.material as THREE.Material | THREE.Material[];
      const materials = Array.isArray(original) ? original : [original];
      const swapped = materials.map((mat) => {
        // Pull color from the source standard/basic material; fall back to white.
        const src = mat as THREE.MeshStandardMaterial & {
          color?: THREE.Color;
          map?: THREE.Texture | null;
        };
        const color = src.color ? src.color.clone() : new THREE.Color('#ffffff');
        return new THREE.MeshToonMaterial({
          color,
          map: src.map ?? null,
          gradientMap: gradient,
        });
      });
      mesh.material = Array.isArray(original) ? swapped : swapped[0]!;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    const { size, min } = getBounds(url, gltf.scene);
    return { scene: root, size, min };
  }, [gltf, url]);
}

const OUTLINE = '#101421';
const OUTLINE_THICKNESS = 0.03;

interface ToonGlbProps {
  url: string;
  /** Optional uniform scale (after height/size normalization, if any). */
  scale?: number;
  /** If set, the GLB is uniformly scaled so its tallest dimension equals this. */
  targetHeight?: number;
  /** If set, the GLB is non-uniformly scaled to fit this XYZ footprint. */
  targetSize?: [number, number, number];
  rotationY?: number;
  position?: [number, number, number];
  outline?: boolean;
}

/**
 * Drop-in renderer for a Kenney GLB with toon materials + optional outlines.
 * Returns `null` if the GLB hasn't loaded yet (Suspense in the parent handles
 * the loading state) — callers should wrap in <Suspense fallback={…}> to
 * preserve the existing procedural visuals while the asset streams in.
 */
export function ToonGlb({
  url,
  scale = 1,
  targetHeight,
  targetSize,
  rotationY = 0,
  position = [0, 0, 0],
  outline = true,
}: ToonGlbProps) {
  const result = useToonGlb(url);
  if (!result) return null;
  const { scene, size, min } = result;

  let sx = scale;
  let sy = scale;
  let sz = scale;
  if (targetSize) {
    sx = (targetSize[0] / Math.max(size.x, 0.001)) * scale;
    sy = (targetSize[1] / Math.max(size.y, 0.001)) * scale;
    sz = (targetSize[2] / Math.max(size.z, 0.001)) * scale;
  } else if (targetHeight) {
    const uniform = (targetHeight / Math.max(size.y, 0.001)) * scale;
    sx = uniform;
    sy = uniform;
    sz = uniform;
  }
  // Lift so the GLB sits on the parent's local y=0 plane (Kenney models often
  // have origins below the geometry; min.y can be negative or positive).
  const yLift = -min.y * sy;

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <group scale={[sx, sy, sz]} position={[0, yLift, 0]}>
        <primitive object={scene} />
        {outline ? (
          <Outlines thickness={OUTLINE_THICKNESS} color={OUTLINE} screenspace={false} />
        ) : null}
      </group>
    </group>
  );
}
