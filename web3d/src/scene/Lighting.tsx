import { useMemo } from 'react';
import * as THREE from 'three';

import type { World } from '../../../src/types.ts';
import { type SceneMood, sceneMoodForClock } from '../mapping/mood.ts';

const skyTextureCache = new Map<string, THREE.CanvasTexture>();

function css(base: string, toward: string, amount: number): string {
  return `#${new THREE.Color(base).lerp(new THREE.Color(toward), amount).getHexString()}`;
}

/** vertical gradient dome: deep zenith, tinted horizon glow, hazy base */
function skyGradientTexture(mood: SceneMood): THREE.CanvasTexture {
  const key = `${mood.phase}:${mood.skyColor}:${mood.fogColor}`;
  const cached = skyTextureCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const glow =
    mood.phase === 'night'
      ? css(mood.fogColor, '#ffb070', 0.16)
      : mood.phase === 'dawn'
        ? css(mood.fogColor, '#ff9a6a', 0.5)
        : mood.phase === 'dusk'
          ? css(mood.fogColor, '#ff8a5a', 0.55)
          : css(mood.skyColor, '#ffffff', 0.4);
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, css(mood.skyColor, '#000000', 0.45));
  gradient.addColorStop(0.5, mood.skyColor);
  gradient.addColorStop(0.74, css(mood.skyColor, glow, 0.55));
  gradient.addColorStop(0.82, glow);
  gradient.addColorStop(0.88, css(mood.fogColor, '#000000', 0.1));
  gradient.addColorStop(1, css(mood.fogColor, '#000000', 0.35));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 8, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  skyTextureCache.set(key, texture);
  return texture;
}

export function Lighting({ world, target }: { world: World; target: { x: number; z: number } }) {
  const mood: SceneMood = useMemo(() => sceneMoodForClock(world), [world]);
  const sunTarget = useMemo(() => new THREE.Object3D(), []);
  const skyTexture = useMemo(() => skyGradientTexture(mood), [mood]);

  return (
    <>
      <color attach="background" args={[mood.skyColor]} />
      <fogExp2 attach="fog" args={[mood.fogColor, mood.fogDensity]} />
      <mesh position={[target.x, 0, target.z]}>
        <sphereGeometry args={[500, 24, 18]} />
        <meshBasicMaterial map={skyTexture} side={THREE.BackSide} fog={false} depthWrite={false} />
      </mesh>
      <ambientLight intensity={0.5} color="#ffffff" />
      <hemisphereLight
        args={[mood.hemisphereSky, mood.hemisphereGround, mood.hemisphereIntensity * 1.4]}
      />
      <primitive object={sunTarget} position={[target.x, 0, target.z]} />
      <directionalLight
        color={mood.sunColor}
        intensity={mood.sunIntensity}
        position={[
          target.x + mood.sunPosition.x * 0.4,
          mood.sunPosition.y * 0.6,
          target.z + mood.sunPosition.z * 0.4,
        ]}
        target={sunTarget}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={1}
        shadow-camera-far={140}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
      />
    </>
  );
}
