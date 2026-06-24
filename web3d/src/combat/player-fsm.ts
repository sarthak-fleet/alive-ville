import * as THREE from 'three';

import { knockback, npcRegistry, playerPosition } from '../controls/runtime.ts';
import { chipDamageAllowed } from './pacing.ts';
import { useCombatStore } from './store.ts';

export type PlayerCombatStateKind = 'free' | 'attack' | 'dodge' | 'hitstun' | 'dead';

export interface AttackSpec {
  kind: 'attack1' | 'attack2' | 'attack3';
  durationMs: number;
  activeAtMs: number;
  damage: number;
  lungeSpeed: number;
}

const COMBO: AttackSpec[] = [
  { kind: 'attack1', durationMs: 380, activeAtMs: 160, damage: 22, lungeSpeed: 2.4 },
  { kind: 'attack2', durationMs: 380, activeAtMs: 150, damage: 26, lungeSpeed: 2.8 },
  { kind: 'attack3', durationMs: 520, activeAtMs: 230, damage: 40, lungeSpeed: 3.6 },
];

const ATTACK_RANGE = 2.3;
const ATTACK_HALF_ANGLE = Math.PI / 2.6;
const DODGE_DURATION_MS = 450;
const DODGE_SPEED = 9;
const DODGE_COOLDOWN_MS = 250;
const HITSTUN_MS = 320;
const COMBO_BUFFER_WINDOW = 1;
const LOCK_RANGE = 18;

export interface PlayerCombatState {
  kind: PlayerCombatStateKind;
  stateStartedAt: number;
  comboIndex: number;
  attackDidHit: boolean;
  bufferedAttack: boolean;
  dodgeDirection: THREE.Vector3;
  dodgeReadyAt: number;
  diedAt: number;
}

export function createPlayerCombatState(): PlayerCombatState {
  return {
    kind: 'free',
    stateStartedAt: 0,
    comboIndex: 0,
    attackDidHit: false,
    bufferedAttack: false,
    dodgeDirection: new THREE.Vector3(),
    dodgeReadyAt: 0,
    diedAt: 0,
  };
}

/** Singleton: the live player combat state, shared between the controller and enemy AI. */
export const playerCombatState = createPlayerCombatState();

export interface CombatInput {
  attackPressed: boolean;
  dodgePressed: boolean;
  lockPressed: boolean;
}

export const combatInput: CombatInput = {
  attackPressed: false,
  dodgePressed: false,
  lockPressed: false,
};

export interface CombatFrame {
  /** locked movement: FSM controls velocity this frame */
  moveLock: boolean;
  /** world-space velocity the FSM wants while locked (m/s) */
  velocity: THREE.Vector3;
  /** animation trigger emitted this frame, if any */
  trigger: AttackSpec['kind'] | 'dodge' | 'hit' | null;
  /** face this yaw while locked */
  faceYaw: number | null;
}

export interface CombatUpdateArgs {
  state: PlayerCombatState;
  nowMs: number;
  heading: number;
  moveDirection: THREE.Vector3;
  moving: boolean;
}

/** Advance the player combat FSM one frame. Pure relative to scene state; side effects go through the combat store. */
export function updatePlayerCombat({
  state,
  nowMs,
  heading,
  moveDirection,
  moving,
}: CombatUpdateArgs): CombatFrame {
  const store = useCombatStore.getState();
  const frame: CombatFrame = {
    moveLock: false,
    velocity: new THREE.Vector3(),
    trigger: null,
    faceYaw: null,
  };

  if (store.playerDown && state.kind !== 'dead') {
    state.kind = 'dead';
    state.stateStartedAt = nowMs;
    state.diedAt = nowMs;
  }

  if (state.kind === 'dead') {
    consumeInputs();
    frame.moveLock = true;
    return frame;
  }

  if (combatInput.lockPressed) {
    combatInput.lockPressed = false;
    store.setLockTarget(store.lockTargetId ? null : nearestLockTarget());
  }

  const elapsed = nowMs - state.stateStartedAt;

  if (state.kind === 'attack') {
    const spec = COMBO[state.comboIndex]!;
    if (combatInput.attackPressed) {
      combatInput.attackPressed = false;
      if (elapsed > spec.activeAtMs * COMBO_BUFFER_WINDOW) state.bufferedAttack = true;
    }
    if (combatInput.dodgePressed && nowMs >= state.dodgeReadyAt) {
      enterDodge(state, frame, nowMs, moveDirection, moving, heading);
      return frame;
    }
    combatInput.dodgePressed = false;

    frame.moveLock = true;
    const lockYaw = yawTowardLockTarget(store.lockTargetId);
    frame.faceYaw = lockYaw ?? heading;
    if (elapsed < spec.activeAtMs + 80) {
      frame.velocity = forwardOf(frame.faceYaw).multiplyScalar(
        spec.lungeSpeed * (1 - elapsed / spec.durationMs)
      );
    }
    if (!state.attackDidHit && elapsed >= spec.activeAtMs) {
      state.attackDidHit = true;
      performHit(spec, frame.faceYaw);
    }
    if (elapsed >= spec.durationMs) {
      if (state.bufferedAttack && state.comboIndex < COMBO.length - 1) {
        state.comboIndex += 1;
        state.bufferedAttack = false;
        state.attackDidHit = false;
        state.stateStartedAt = nowMs;
        frame.trigger = COMBO[state.comboIndex]!.kind;
      } else {
        state.kind = 'free';
        state.comboIndex = 0;
        state.bufferedAttack = false;
      }
    }
    return frame;
  }

  if (state.kind === 'dodge') {
    combatInput.attackPressed = false;
    combatInput.dodgePressed = false;
    frame.moveLock = true;
    frame.velocity = state.dodgeDirection
      .clone()
      .multiplyScalar(DODGE_SPEED * (1 - (elapsed / DODGE_DURATION_MS) * 0.55));
    if (elapsed >= DODGE_DURATION_MS) {
      state.kind = 'free';
      state.dodgeReadyAt = nowMs + DODGE_COOLDOWN_MS;
    }
    return frame;
  }

  if (state.kind === 'hitstun') {
    combatInput.attackPressed = false;
    combatInput.dodgePressed = false;
    frame.moveLock = true;
    if (elapsed >= HITSTUN_MS) state.kind = 'free';
    return frame;
  }

  // free
  if (combatInput.dodgePressed && nowMs >= state.dodgeReadyAt) {
    enterDodge(state, frame, nowMs, moveDirection, moving, heading);
    return frame;
  }
  combatInput.dodgePressed = false;
  if (combatInput.attackPressed) {
    combatInput.attackPressed = false;
    state.kind = 'attack';
    state.comboIndex = 0;
    state.attackDidHit = false;
    state.bufferedAttack = false;
    state.stateStartedAt = nowMs;
    frame.trigger = 'attack1';
    const lockYaw = yawTowardLockTarget(store.lockTargetId);
    frame.faceYaw = lockYaw ?? heading;
    frame.moveLock = true;
  }
  return frame;
}

/**
 * Player took a hit: enter hitstun unless dodging (i-frames) or dead.
 *
 * @param chip - When true this is a client-paced chip attack; damage is
 *   clamped so the player cannot be brought below CHIP_HP_FLOOR_FRACTION.
 *   Only server-authoritative hits (chip=false) can down the player.
 */
export function applyIncomingHit(
  state: PlayerCombatState,
  nowMs: number,
  damage: number,
  at: { x: number; y: number; z: number },
  attackerName?: string,
  chip = false
): boolean {
  if (state.kind === 'dodge' || state.kind === 'dead') return false;
  const store = useCombatStore.getState();
  let actualDamage = damage;
  if (chip) {
    actualDamage = chipDamageAllowed(store.playerHp, store.playerMaxHp, damage);
    if (actualDamage <= 0) return false;
  }
  store.damagePlayer(actualDamage, at, attackerName);
  if (state.kind !== 'hitstun') {
    state.kind = 'hitstun';
    state.stateStartedAt = nowMs;
  }
  return true;
}

function enterDodge(
  state: PlayerCombatState,
  frame: CombatFrame,
  nowMs: number,
  moveDirection: THREE.Vector3,
  moving: boolean,
  heading: number
): void {
  combatInput.dodgePressed = false;
  state.kind = 'dodge';
  state.stateStartedAt = nowMs;
  state.dodgeDirection = moving ? moveDirection.clone().normalize() : forwardOf(heading);
  frame.trigger = 'dodge';
  frame.moveLock = true;
  frame.faceYaw = Math.atan2(state.dodgeDirection.x, state.dodgeDirection.z);
}

function performHit(spec: AttackSpec, faceYaw: number): void {
  const store = useCombatStore.getState();
  const forward = forwardOf(faceYaw);
  const levelMultiplier = 1 + (store.playerLevel - 1) * 0.15;
  for (const actor of npcRegistry.values()) {
    const enemy = store.enemies[actor.npcId];
    if (enemy?.defeated) continue;
    const offset = actor.position.clone().sub(playerPosition);
    offset.y = 0;
    const distance = offset.length();
    if (distance > ATTACK_RANGE) continue;
    const angle = forward.angleTo(offset.normalize());
    if (angle > ATTACK_HALF_ANGLE) continue;
    store.damageEnemy(actor.npcId, Math.round(spec.damage * levelMultiplier), {
      x: actor.position.x,
      y: actor.position.y + 1.2,
      z: actor.position.z,
    });
    knockback(actor.npcId, { x: forward.x, z: forward.z }, spec.kind === 'attack3' ? 0.7 : 0.3);
  }
}

function nearestLockTarget(): string | null {
  const store = useCombatStore.getState();
  let best: { id: string; distance: number } | null = null;
  for (const actor of npcRegistry.values()) {
    const enemy = store.enemies[actor.npcId];
    if (enemy?.defeated) continue;
    const distance = actor.position.distanceTo(playerPosition);
    if (distance < LOCK_RANGE && (!best || distance < best.distance))
      best = { id: actor.npcId, distance };
  }
  return best?.id ?? null;
}

function yawTowardLockTarget(lockTargetId: string | null): number | null {
  if (!lockTargetId) return null;
  const actor = npcRegistry.get(lockTargetId);
  if (!actor) return null;
  return Math.atan2(actor.position.x - playerPosition.x, actor.position.z - playerPosition.z);
}

function forwardOf(yaw: number): THREE.Vector3 {
  return new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
}

function consumeInputs(): void {
  combatInput.attackPressed = false;
  combatInput.dodgePressed = false;
  combatInput.lockPressed = false;
}
