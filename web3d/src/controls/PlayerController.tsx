import { useFrame, useThree } from "@react-three/fiber";
import { CapsuleCollider, type RapierRigidBody, RigidBody, useRapier } from "@react-three/rapier";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import type { World } from "../../../src/types.ts";
import { type CharacterAnimationHandle, CharacterModel } from "../characters/CharacterModel.tsx";
import { combatInput, playerCombatState, updatePlayerCombat } from "../combat/player-fsm.ts";
import { useCombatStore } from "../combat/store.ts";
import { useDirectorStore } from "../director/store.ts";
import { actorVisualFor } from "../mapping/visuals.ts";
import { useUiStore } from "../store/ui.ts";
import { useWorldStore } from "../store/world.ts";
import type { DistrictModel, WorldModel } from "../worldgen/index.ts";
import type { WorldPlacements } from "../worldgen/placements.ts";
import { attachInput, input } from "./input.ts";
import { cameraShake, cameraState, npcRegistry, playerHeading, playerPosition, teleportRequest } from "./runtime.ts";

const WALK_SPEED = 3.2;
const RUN_SPEED = 6.2;
const INTERACT_RANGE = 2.6;
const CAPSULE_HALF_HEIGHT = 0.55;
const CAPSULE_RADIUS = 0.35;
/** capsule center sits at half-height + radius above the feet */
const CAPSULE_CENTER_Y = CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS;

interface PlayerControllerProps {
  world: World;
  model: WorldModel;
  placements: WorldPlacements;
  activeDistrict: DistrictModel;
}

export function PlayerController({ world, model, placements, activeDistrict }: PlayerControllerProps) {
  const body = useRef<RapierRigidBody>(null);
  const modelGroup = useRef<THREE.Group>(null);
  const animation = useRef<CharacterAnimationHandle>(null);
  const { world: physicsWorld } = useRapier();
  const gl = useThree((state) => state.gl);
  const setInteractionTarget = useUiStore((state) => state.setInteractionTarget);

  const visual = useMemo(() => actorVisualFor(world.player.appearance, "#58a6ff"), [world.player.appearance]);

  const state = useRef({
    yaw: 0,
    pitch: 0.42,
    distance: 7.5,
    verticalVelocity: 0,
    heading: 0,
    dragging: false,
    lastScan: 0,
    pendingDistrict: null as string | null,
    pendingSince: 0,
    moveInFlight: false,
    velocity: new THREE.Vector3(),
    lookTarget: new THREE.Vector3(),
    lookInitialized: false,
    fov: 50,
    lastDust: 0,
  });

  // initial spawn only — crossing districts must NOT re-apply the position prop
  const [initialSpawn] = useState(() => ({ x: activeDistrict.playerSpawn.x, z: activeDistrict.playerSpawn.z }));

  // teleport to the new spawn when a different world is loaded
  const worldIdRef = useRef(world.id);
  useEffect(() => {
    if (worldIdRef.current === world.id) return;
    worldIdRef.current = world.id;
    body.current?.setTranslation(
      { x: activeDistrict.playerSpawn.x, y: CAPSULE_CENTER_Y + 0.2, z: activeDistrict.playerSpawn.z },
      true
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on world identity change
  }, [world.id]);

  const controllerRef = useRef<ReturnType<typeof physicsWorld.createCharacterController> | null>(null);

  useEffect(() => {
    const c = physicsWorld.createCharacterController(0.05);
    c.enableAutostep(0.6, 0.25, true);
    c.enableSnapToGround(0.6);
    c.setApplyImpulsesToDynamicBodies(true);
    controllerRef.current = c;
    return () => {
      controllerRef.current = null;
      physicsWorld.removeCharacterController(c);
    };
  }, [physicsWorld]);

  useEffect(() => attachInput(), []);

  // camera: pointer-lock mouse look (standard third-person scheme).
  // First click captures the pointer; mouse then rotates the camera and click
  // attacks. Esc releases (browser default). Drag-orbit remains as fallback
  // while unlocked so the game is still controllable without capture.
  useEffect(() => {
    const element = gl.domElement;
    const s = state.current;
    const isLocked = () => document.pointerLockElement === element;
    let downAt = 0;
    let dragDistance = 0;
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (isLocked()) {
        combatInput.attackPressed = true;
        return;
      }
      if (!useUiStore.getState().dialogueNpcId) {
        // unsupported environments (headless, some iframes) fall back to drag-orbit
        try {
          const result = element.requestPointerLock() as unknown;
          if (result instanceof Promise) result.catch(() => {});
        } catch {
          // drag-orbit fallback below still works
        }
      }
      s.dragging = true;
      downAt = performance.now();
      dragDistance = 0;
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // capture is best-effort; drag still tracks via pointermove
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (isLocked()) {
        s.yaw -= event.movementX * 0.0026;
        s.pitch = THREE.MathUtils.clamp(s.pitch + event.movementY * 0.0022, 0.06, 1.25);
        return;
      }
      if (!s.dragging) return;
      dragDistance += Math.abs(event.movementX) + Math.abs(event.movementY);
      s.yaw -= event.movementX * 0.0042;
      s.pitch = THREE.MathUtils.clamp(s.pitch + event.movementY * 0.0032, 0.06, 1.25);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!isLocked() && s.dragging && dragDistance < 6 && performance.now() - downAt < 320) {
        combatInput.attackPressed = true;
      }
      s.dragging = false;
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    };
    const onWheel = (event: WheelEvent) => {
      s.distance = THREE.MathUtils.clamp(s.distance + event.deltaY * 0.012, 3.5, 42);
    };
    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerup", onPointerUp);
    element.addEventListener("pointercancel", onPointerUp);
    element.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", onPointerUp);
      element.removeEventListener("pointercancel", onPointerUp);
      element.removeEventListener("wheel", onWheel);
      if (isLocked()) document.exitPointerLock();
    };
  }, [gl]);

  // typing in dialogue needs the cursor back
  const dialogueOpen = useUiStore((uiState) => Boolean(uiState.dialogueNpcId));
  useEffect(() => {
    if (dialogueOpen && document.pointerLockElement === gl.domElement) document.exitPointerLock();
  }, [dialogueOpen, gl]);

  useFrame((frame, delta) => {
    const rigidBody = body.current;
    const controller = controllerRef.current;
    if (!rigidBody || !controller) return;
    const s = state.current;

    // door transitions request a one-shot teleport
    if (teleportRequest.target) {
      const { x, z } = teleportRequest.target;
      teleportRequest.target = null;
      rigidBody.setNextKinematicTranslation({ x, y: CAPSULE_CENTER_Y + 0.2, z });
      playerPosition.set(x, 0, z);
      s.velocity.set(0, 0, 0);
      s.lookInitialized = false;
      return;
    }

    // director cutscene: camera orbits the focus actor, player is frozen
    const cutscene = useDirectorStore.getState().cutscene;
    if (cutscene) {
      const elapsed = performance.now() - cutscene.startedAt;
      if (elapsed >= cutscene.durationMs) {
        useDirectorStore.getState().endCutscene();
        return;
      }
      const focusActor = npcRegistry.get(cutscene.actorId);
      const focus = focusActor
        ? focusActor.position
        : new THREE.Vector3(playerPosition.x, playerPosition.y, playerPosition.z);
      const t = elapsed / cutscene.durationMs;
      const yaw = s.yaw + 0.6 + t * 0.55;
      const distance = 6.5 - t * 1.8;
      const eye = new THREE.Vector3(
        focus.x + Math.sin(yaw) * distance,
        focus.y + 2.6 - t * 0.9,
        focus.z + Math.cos(yaw) * distance
      );
      frame.camera.position.lerp(eye, 1 - Math.exp(-4 * delta));
      frame.camera.lookAt(focus.x, focus.y + 1.5, focus.z);
      animation.current?.setSpeed(0);
      return;
    }

    // movement direction relative to camera yaw
    const moveX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const moveZ = (input.back ? 1 : 0) - (input.forward ? 1 : 0);
    const moving = moveX !== 0 || moveZ !== 0;
    const speed = input.run ? RUN_SPEED : WALK_SPEED;

    const direction = new THREE.Vector3(moveX, 0, moveZ);
    if (moving) {
      direction.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw);
    }

    // combat FSM (attacks, dodge, hitstun, death) can take over movement
    const combatFrame = updatePlayerCombat({
      state: playerCombatState,
      nowMs: performance.now(),
      heading: s.heading,
      moveDirection: direction,
      moving,
    });
    if (combatFrame.trigger) animation.current?.trigger(combatFrame.trigger);
    if (combatFrame.faceYaw !== null) s.heading = combatFrame.faceYaw;

    // death → respawn at the active courtyard
    if (playerCombatState.kind === "dead" && performance.now() - playerCombatState.diedAt > 3200) {
      rigidBody.setNextKinematicTranslation({
        x: activeDistrict.playerSpawn.x,
        y: CAPSULE_CENTER_Y + 0.2,
        z: activeDistrict.playerSpawn.z,
      });
      playerCombatState.kind = "free";
      useCombatStore.getState().respawnPlayer();
      return;
    }

    // gravity
    const grounded = controller.computedGrounded();
    s.verticalVelocity = grounded ? -0.6 : s.verticalVelocity - 22 * delta;

    // smooth acceleration/deceleration; combat states drive velocity directly
    if (combatFrame.moveLock) {
      s.velocity.copy(combatFrame.velocity);
    } else {
      const target = direction.clone().multiplyScalar(speed);
      const damp = 1 - Math.exp(-(moving ? 11 : 8.5) * delta);
      s.velocity.lerp(target, damp);
      if (s.velocity.lengthSq() < 0.0004) s.velocity.set(0, 0, 0);
    }
    const desired = new THREE.Vector3(
      s.velocity.x * delta,
      s.verticalVelocity * delta,
      s.velocity.z * delta
    );

    const collider = rigidBody.collider(0);
    controller.computeColliderMovement(collider, desired);
    const movement = controller.computedMovement();
    const current = rigidBody.translation();
    const next = {
      x: current.x + movement.x,
      y: current.y + movement.y,
      z: current.z + movement.z,
    };
    rigidBody.setNextKinematicTranslation(next);

    playerPosition.set(next.x, next.y - CAPSULE_CENTER_Y, next.z);

    // face movement direction (combat may have set heading directly)
    const headingBefore = s.heading;
    if (combatFrame.moveLock && modelGroup.current) {
      modelGroup.current.rotation.y = s.heading;
      playerHeading.value = s.heading;
    } else if (moving && modelGroup.current) {
      const target = Math.atan2(direction.x, direction.z);
      s.heading = dampAngle(s.heading, target, 12, delta);
      modelGroup.current.rotation.y = s.heading;
      playerHeading.value = s.heading;
    }
    // lean into turns
    if (modelGroup.current) {
      let turn = s.heading - headingBefore;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      const targetLean = THREE.MathUtils.clamp((-turn / Math.max(delta, 0.001)) * 0.018, -0.13, 0.13);
      modelGroup.current.rotation.z += (targetLean - modelGroup.current.rotation.z) * (1 - Math.exp(-8 * delta));
    }
    const horizontalSpeed = s.velocity.length();
    animation.current?.setSpeed(combatFrame.moveLock ? 0 : horizontalSpeed);

    // run dust puffs
    if (!combatFrame.moveLock && horizontalSpeed > 4.4 && grounded && frame.clock.elapsedTime - s.lastDust > 0.22) {
      s.lastDust = frame.clock.elapsedTime;
      useCombatStore.getState().addVfx({
        kind: "dust",
        x: playerPosition.x - Math.sin(s.heading) * 0.3,
        y: playerPosition.y + 0.12,
        z: playerPosition.z - Math.cos(s.heading) * 0.3,
        color: "#cbc3b4",
        startedAt: performance.now(),
        expiresAt: performance.now() + 420,
      });
    }

    // follow camera with speed-reactive FOV and impact shake
    const targetFov = 50 + (playerCombatState.kind === "dodge" ? 8 : input.run && horizontalSpeed > 4 ? 6 : 0);
    s.fov += (targetFov - s.fov) * (1 - Math.exp(-6 * delta));
    const perspective = frame.camera as THREE.PerspectiveCamera;
    if (Math.abs(perspective.fov - s.fov) > 0.05) {
      perspective.fov = s.fov;
      perspective.updateProjectionMatrix();
    }
    cameraShake.value *= Math.exp(-6.5 * delta);
    const shake = cameraShake.value;
    const eye = new THREE.Vector3(
      playerPosition.x + Math.sin(s.yaw) * Math.cos(s.pitch) * s.distance,
      playerPosition.y + 1.4 + Math.sin(s.pitch) * s.distance,
      playerPosition.z + Math.cos(s.yaw) * Math.cos(s.pitch) * s.distance
    );
    frame.camera.position.lerp(eye, 1 - Math.exp(-10 * delta));
    if (shake > 0.004) {
      frame.camera.position.x += (Math.random() - 0.5) * shake;
      frame.camera.position.y += (Math.random() - 0.5) * shake * 0.7;
      frame.camera.position.z += (Math.random() - 0.5) * shake;
    }
    if (!s.lookInitialized) {
      s.lookTarget.set(playerPosition.x, playerPosition.y + 1.4, playerPosition.z);
      s.lookInitialized = true;
    }
    s.lookTarget.lerp(new THREE.Vector3(playerPosition.x, playerPosition.y + 1.4, playerPosition.z), 1 - Math.exp(-14 * delta));
    frame.camera.lookAt(s.lookTarget);
    cameraState.yaw = s.yaw;

    // interaction scan + district-crossing detection at ~10Hz
    if (frame.clock.elapsedTime - s.lastScan > 0.1) {
      s.lastScan = frame.clock.elapsedTime;
      setInteractionTarget(scanInteractions(world, placements, model));

      const here = model.districts.find(
        (d) =>
          playerPosition.x >= d.origin.x &&
          playerPosition.x <= d.origin.x + d.width &&
          playerPosition.z >= d.origin.z &&
          playerPosition.z <= d.origin.z + d.depth
      );
      if (here && here.locationId !== world.player.locationId) {
        if (s.pendingDistrict !== here.locationId) {
          s.pendingDistrict = here.locationId;
          s.pendingSince = frame.clock.elapsedTime;
        } else if (frame.clock.elapsedTime - s.pendingSince > 1 && !s.moveInFlight) {
          s.moveInFlight = true;
          void useWorldStore
            .getState()
            .send({ type: "move", locationId: here.locationId })
            .finally(() => {
              s.moveInFlight = false;
            });
        }
      } else {
        s.pendingDistrict = null;
      }
    }
  });

  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      position={[initialSpawn.x, CAPSULE_CENTER_Y + 0.2, initialSpawn.z]}
      enabledRotations={[false, false, false]}
    >
      <CapsuleCollider args={[CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS]} />
      <group ref={modelGroup} position={[0, -CAPSULE_CENTER_Y, 0]}>
        <CharacterModel ref={animation} visual={visual} appearance={world.player.appearance} seedId="player" />
      </group>
    </RigidBody>
  );
}

function scanInteractions(world: World, placements: WorldPlacements, model: WorldModel) {
  let best: { kind: "npc" | "item" | "prop" | "door"; id: string; label: string; verb: string; distance: number } | null = null;

  const interiorDistrictId = useUiStore.getState().interiorDistrictId;
  if (interiorDistrictId) {
    // inside: the only interaction is the exit door
    const interior = model.interiors.find((entry) => entry.districtId === interiorDistrictId);
    if (interior) {
      const distance = Math.hypot(interior.exit.x - playerPosition.x, interior.exit.z - playerPosition.z);
      if (distance < INTERACT_RANGE) {
        return { kind: "door" as const, id: interior.districtId, label: interior.label, verb: "Leave" };
      }
    }
    return null;
  }

  for (const door of model.doors) {
    const distance = Math.hypot(door.x - playerPosition.x, door.z - playerPosition.z);
    if (distance < INTERACT_RANGE && (!best || distance < best.distance)) {
      best = { kind: "door", id: door.districtId, label: door.label, verb: "Enter", distance };
    }
  }

  const combatEnemies = useCombatStore.getState().enemies;
  for (const actor of npcRegistry.values()) {
    const distance = actor.position.distanceTo(playerPosition);
    if (distance < INTERACT_RANGE && (!best || distance < best.distance)) {
      const npc = world.npcs.find((entry) => entry.id === actor.npcId);
      const enemy = combatEnemies[actor.npcId];
      if (npc && !npc.combat?.defeated && !enemy?.defeated && !enemy?.hostile) {
        best = { kind: "npc", id: npc.id, label: npc.name, verb: "Talk to", distance };
      }
    }
  }
  for (const item of placements.items) {
    const distance = Math.hypot(item.x - playerPosition.x, item.z - playerPosition.z);
    if (distance < INTERACT_RANGE && (!best || distance < best.distance)) {
      best = { kind: "item", id: item.itemId, label: item.name, verb: "Pick up", distance };
    }
  }
  for (const prop of placements.interactables) {
    const distance = Math.hypot(prop.x - playerPosition.x, prop.z - playerPosition.z);
    if (distance < INTERACT_RANGE && (!best || distance < best.distance)) {
      best = { kind: "prop", id: prop.propId, label: prop.name, verb: "Inspect", distance };
    }
  }
  return best ? { kind: best.kind, id: best.id, label: best.label, verb: best.verb } : null;
}

function dampAngle(current: number, target: number, lambda: number, delta: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-lambda * delta));
}
