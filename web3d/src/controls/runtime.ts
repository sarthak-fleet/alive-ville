import * as THREE from 'three';

/**
 * High-frequency (per-frame) shared state kept outside zustand so the 60fps
 * game loop never triggers React re-renders.
 */
export const playerPosition = new THREE.Vector3(0, 0, 0);
export const playerHeading = { value: 0 };
export const cameraState = {
  yaw: 0,
  /** When set, PlayerController defers camera placement to this override each frame. */
  override: null as { eye: THREE.Vector3; lookAt: THREE.Vector3 } | null,
};
/** decaying impulse applied as positional camera noise (combat hits, big events) */
export const cameraShake = { value: 0 };

export function addCameraShake(amount: number): void {
  cameraShake.value = Math.min(0.6, Math.max(cameraShake.value, amount));
}

/** hitstop / slow-mo: scales frame deltas for movement and animation */
const timeScale = { scale: 1, until: 0 };

export function hitstop(durationMs: number, scale = 0.05): void {
  timeScale.scale = scale;
  timeScale.until = performance.now() + durationMs;
}

export function scaledDelta(delta: number): number {
  return performance.now() < timeScale.until ? delta * timeScale.scale : delta;
}

export function knockback(npcId: string, direction: { x: number; z: number }, force: number): void {
  const actor = npcRegistry.get(npcId);
  if (!actor?.node) return;
  actor.node.position.x += direction.x * force;
  actor.node.position.z += direction.z * force;
}

/** player gesture hook, filled by the controller once its rig mounts */
export const playerGestureHook: { fire: ((kind: 'pickup' | 'interact') => void) | null } = {
  fire: null,
};

/** player flash hook: triggers a brief red emissive on the player rig */
export const playerFlashHook: { fire: (() => void) | null } = { fire: null };

/** combat toast hook: fires a HUD toast for in-world combat events (defeat, etc.) */
export const combatToastHook: { fire: ((text: string, kind: 'defeat' | 'info') => void) | null } = {
  fire: null,
};

export function playerGesture(kind: 'pickup' | 'interact'): void {
  playerGestureHook.fire?.(kind);
}

/** one-shot teleport consumed by the player controller (door transitions) */
export const teleportRequest: { target: { x: number; z: number } | null } = { target: null };

export function requestTeleport(x: number, z: number): void {
  teleportRequest.target = { x, z };
}

export interface LiveActor {
  position: THREE.Vector3;
  npcId: string;
  /** scene node, for knockback nudges */
  node?: THREE.Object3D;
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
  (window as unknown as Record<string, unknown>)['__game'] = {
    playerPosition,
    npcRegistry,
    cameraState,
    requestTeleport,
  };
}
