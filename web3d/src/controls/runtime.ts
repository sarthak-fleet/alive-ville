import * as THREE from "three";

/**
 * High-frequency (per-frame) shared state kept outside zustand so the 60fps
 * game loop never triggers React re-renders.
 */
export const playerPosition = new THREE.Vector3(0, 0, 0);
export const playerHeading = { value: 0 };
export const cameraState = { yaw: 0 };
/** decaying impulse applied as positional camera noise (combat hits, big events) */
export const cameraShake = { value: 0 };

export function addCameraShake(amount: number): void {
  cameraShake.value = Math.min(0.6, Math.max(cameraShake.value, amount));
}

/** one-shot teleport consumed by the player controller (door transitions) */
export const teleportRequest: { target: { x: number; z: number } | null } = { target: null };

export function requestTeleport(x: number, z: number): void {
  teleportRequest.target = { x, z };
}

export interface LiveActor {
  position: THREE.Vector3;
  npcId: string;
}

export const npcRegistry = new Map<string, LiveActor>();

export function registerNpc(npcId: string): LiveActor {
  const actor: LiveActor = { position: new THREE.Vector3(), npcId };
  npcRegistry.set(npcId, actor);
  return actor;
}

export function unregisterNpc(npcId: string): void {
  npcRegistry.delete(npcId);
}

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>)["__game"] = { playerPosition, npcRegistry, cameraState };
}
