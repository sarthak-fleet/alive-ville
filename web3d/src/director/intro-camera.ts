import * as THREE from 'three';

/** smoothstep ease: maps t ∈ [0,1] → [0,1] with ease-in-out */
export function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/**
 * Pure helper: computes camera eye + lookAt for the intro dolly.
 *
 * At t=0: high and wide (40m up, 28m back) over the player's district.
 * At t=1: settles to normal third-person position (~6.5m back, pitch ~0.42).
 *
 * Pure function — no DOM, no React, no runtime module — safe to unit-test in Node.
 */
export function introCameraPose(
  t: number,
  playerPos: { x: number; y: number; z: number }
): { eye: THREE.Vector3; lookAt: THREE.Vector3 } {
  const eased = smoothstep(t);

  // height: 40m at start → ~5.5m at end
  const height = 40 - (40 - 5.5) * eased;

  // horizontal distance: 28m at start → 6.5m at end
  const hDist = 28 - (28 - 6.5) * eased;

  // yaw: slight orbital arc as camera descends
  const yaw = Math.PI * 0.28 * (1 - eased);

  const eye = new THREE.Vector3(
    playerPos.x + Math.sin(yaw) * hDist,
    playerPos.y + height,
    playerPos.z + Math.cos(yaw) * hDist
  );

  // lookAt: lerp from high above to normal player-head height
  const lookAtY = playerPos.y + 1.4 + (1 - eased) * 12;
  const lookAt = new THREE.Vector3(playerPos.x, lookAtY, playerPos.z);

  return { eye, lookAt };
}
