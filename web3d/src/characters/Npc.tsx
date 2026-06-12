import { Billboard, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import type { Npc as NpcData, Quest } from "../../../src/types.ts";
import { applyIncomingHit, playerCombatState } from "../combat/player-fsm.ts";
import { useCombatStore } from "../combat/store.ts";
import { npcRegistry, playerPosition, registerNpc, scaledDelta, unregisterNpc } from "../controls/runtime.ts";
import { useDirectorStore } from "../director/store.ts";
import { actorVisualFor, clothingColorsFor } from "../mapping/visuals.ts";
import { useUiStore } from "../store/ui.ts";
import { findDistrictPath, type WorldModel } from "../worldgen/index.ts";
import type { PlacedNpcSpawn } from "../worldgen/placements.ts";
import { rngFor } from "../worldgen/rng.ts";
import { useBanterStore } from "./banter.ts";
import type { CharacterAnimationHandle } from "./CharacterModel.tsx";
import { followersStore } from "./followers.ts";
import { RiggedCharacter } from "./RiggedCharacter.tsx";

const WALK_SPEED = 1.15;
const TRAVEL_SPEED = 3.4;
const WANDER_RADIUS = 3.2;

const CHASE_SPEED = 3.0;
const RETREAT_SPEED = 2.2;
const STRIKE_REACH = 2.1;
const STRIKE_DAMAGE = 11;
const TELEGRAPH_S = 0.42;
const RECOVER_S = 0.95;
const RETREAT_HP_FRACTION = 0.25;

type EnemyAiState = "approach" | "telegraph" | "strike" | "recover" | "retreat";

interface NpcProps {
  npc: NpcData;
  worldId: string;
  spawn: PlacedNpcSpawn;
  model: WorldModel;
  quests: Quest[];
}

type AmbientRole = "shopkeeper" | "patroller" | "idler" | "wanderer";

function ambientRoleFor(npc: NpcData): AmbientRole {
  const text = `${npc.role ?? ""} ${npc.description ?? ""}`.toLowerCase();
  if (/merchant|shop|keeper|vendor|clerk|innkeep|trader|bartend/.test(text)) return "shopkeeper";
  if (/guard|patrol|hero|watch|officer|rider|soldier|knight/.test(text)) return "patroller";
  if (/elder|old |child|kid|sage|sitting/.test(text)) return "idler";
  return "wanderer";
}

/** higher tier = more agency = acts more often and roams further */
function agencyFor(npc: NpcData): number {
  if (npc.tier === "quest") return 1;
  if (npc.tier === "background") return 0.45;
  return 0.7;
}

export function Npc({ npc, worldId, spawn, model, quests }: NpcProps) {
  const group = useRef<THREE.Group>(null);
  const animation = useRef<CharacterAnimationHandle>(null);
  const labelRef = useRef<THREE.Group>(null);
  // position prop must stay constant: movement is imperative, and a reactive
  // position would teleport the node whenever the sim relocates the NPC
  const [initialSpawn] = useState(() => ({ x: spawn.x, z: spawn.z, heading: spawn.heading }));
  const visual = useMemo(() => {
    const fallback = clothingColorsFor(npc.id);
    const base = actorVisualFor(npc.appearance, fallback.color);
    return base.accentColor === base.color ? { ...base, accentColor: fallback.accent } : base;
  }, [npc.appearance, npc.id]);
  const personaText = `${npc.name} ${npc.role ?? ""} ${npc.description ?? ""}`;
  const inDialogue = useUiStore((state) => state.dialogueNpcId === npc.id);
  const banter = useBanterStore((state) => state.byNpc[npc.id]);
  const enemy = useCombatStore((state) => state.enemies[npc.id]);
  const lockedOn = useCombatStore((state) => state.lockTargetId === npc.id);

  const state = useRef({
    rng: rngFor(worldId, npc.id, "wander"),
    districtId: spawn.districtId,
    travelWaypoints: null as Array<{ x: number; z: number }> | null,
    wanderTarget: new THREE.Vector3(spawn.x, 0, spawn.z),
    wanderCenter: { x: spawn.x, z: spawn.z },
    waitUntil: 0,
    heading: spawn.heading,
    aiState: "approach" as EnemyAiState,
    aiUntil: 0,
    struck: false,
    patrolAngle: 0,
  });

  const ambientRole = useMemo(() => ambientRoleFor(npc), [npc]);
  const agency = agencyFor(npc);

  // routine anchor: shopkeepers hold position at their district's stall/counter, idlers at a bench
  const routineAnchor = useMemo(() => {
    const district = model.districts.find((entry) => entry.locationId === spawn.districtId);
    if (!district) return null;
    if (ambientRole === "shopkeeper") {
      const stall = district.props.find((prop) => prop.kind === "stall") ?? district.props.find((prop) => prop.kind === "crate");
      if (stall) return { x: stall.x + 0.9, z: stall.z + 0.4 };
    }
    if (ambientRole === "idler") {
      const bench = district.props.find((prop) => prop.kind === "bench");
      if (bench) return { x: bench.x + 0.4, z: bench.z + 0.7 };
    }
    return null;
  }, [model, spawn.districtId, ambientRole]);

  useEffect(() => {
    const actor = registerNpc(npc.id);
    actor.position.copy(group.current?.position ?? new THREE.Vector3(spawn.x, 0, spawn.z));
    actor.node = group.current ?? undefined;
    return () => unregisterNpc(npc.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- register once per npc
  }, [npc.id]);

  // hit feedback: flash + flinch when this NPC loses HP
  const prevHp = useRef<number | null>(null);
  useEffect(() => {
    const hp = enemy?.hp ?? null;
    if (hp !== null && prevHp.current !== null && hp < prevHp.current && !enemy?.defeated) {
      animation.current?.trigger("hit");
      animation.current?.flash?.();
    }
    prevHp.current = hp;
  }, [enemy?.hp, enemy?.defeated]);

  // sim moved this NPC to another district: walk there along the street graph
  useEffect(() => {
    const s = state.current;
    s.wanderCenter = { x: spawn.x, z: spawn.z };
    if (spawn.districtId === s.districtId) return;
    const path = findDistrictPath(model.nav, s.districtId, spawn.districtId) ?? [];
    s.travelWaypoints = [...path.slice(1), { x: spawn.x, z: spawn.z }];
    s.districtId = spawn.districtId;
    s.wanderTarget.set(spawn.x, 0, spawn.z);
  }, [spawn.districtId, spawn.x, spawn.z, model]);

  useFrame((frame, rawDelta) => {
    const delta = scaledDelta(rawDelta);
    const node = group.current;
    if (!node) return;
    const s = state.current;
    const time = frame.clock.elapsedTime;

    // labels only read up close — far away they're just noise
    const label = labelRef.current;
    if (label) label.visible = node.position.distanceTo(frame.camera.position) < 26;

    animation.current?.setTalking?.(inDialogue);

    const clientDefeated = Boolean(enemy?.defeated) || Boolean(npc.combat?.defeated);
    animation.current?.setDefeated(clientDefeated);
    if (clientDefeated) {
      animation.current?.setSpeed(0);
      syncRegistry(npc.id, node.position);
      return;
    }

    // story cutscenes pause combat AI (ambient behavior continues below)
    const inCutscene = Boolean(useDirectorStore.getState().cutscene);

    // hostile combat AI takes priority over ambient behavior
    if (enemy?.hostile && playerCombatState.kind !== "dead" && !inCutscene) {
      updateEnemyAi(npc.id, s, node, time, delta, animation.current, visualHitPoint(node));
      syncRegistry(npc.id, node.position);
      return;
    }

    if (inDialogue && !s.travelWaypoints) {
      animation.current?.setSpeed(0);
      const toPlayer = Math.atan2(playerPosition.x - node.position.x, playerPosition.z - node.position.z);
      s.heading = dampAngle(s.heading, toPlayer, 8, delta);
      node.rotation.y = s.heading;
      syncRegistry(npc.id, node.position);
      return;
    }

    if (s.travelWaypoints && s.travelWaypoints.length > 0) {
      const next = s.travelWaypoints[0]!;
      const target = new THREE.Vector3(next.x, 0, next.z);
      const distance = node.position.distanceTo(target);
      if (distance < 0.3) {
        s.travelWaypoints.shift();
        if (s.travelWaypoints.length === 0) {
          s.travelWaypoints = null;
          s.waitUntil = time + 1;
        }
      } else {
        const direction = target.clone().sub(node.position).normalize();
        node.position.addScaledVector(direction, Math.min(TRAVEL_SPEED * delta, distance));
        s.heading = dampAngle(s.heading, Math.atan2(direction.x, direction.z), 10, delta);
        node.rotation.y = s.heading;
        animation.current?.setSpeed(TRAVEL_SPEED);
      }
      syncRegistry(npc.id, node.position);
      return;
    }

    // companion mode: trail the player everywhere.
    // Keyed on either the dialogue-initiated client store OR the authoritative sim flag so
    // that reloads / world imports don't drop the follower.
    if (followersStore.has(npc.id) || npc.followingPlayer) {
      const toPlayer = playerPosition.clone().sub(node.position);
      toPlayer.y = 0;
      const distance = toPlayer.length();
      if (distance > 30) {
        // catch up after teleports (doors, respawns)
        node.position.set(playerPosition.x - 1.6, 0, playerPosition.z - 1.6);
      } else if (distance > 2.2) {
        const speed = distance > 7 ? 6.4 : 3.6;
        const step = toPlayer.normalize().multiplyScalar(Math.min(speed * delta, distance - 2));
        node.position.add(step);
        s.heading = dampAngle(s.heading, Math.atan2(toPlayer.x, toPlayer.z), 10, delta);
        node.rotation.y = s.heading;
        animation.current?.setSpeed(speed);
      } else {
        animation.current?.setSpeed(0);
        s.heading = dampAngle(s.heading, Math.atan2(playerPosition.x - node.position.x, playerPosition.z - node.position.z), 6, delta);
        node.rotation.y = s.heading;
      }
      syncRegistry(npc.id, node.position);
      return;
    }

    // mid-conversation with another NPC: stop and face them
    const liveBanter = useBanterStore.getState().byNpc[npc.id];
    if (liveBanter && performance.now() < liveBanter.until) {
      animation.current?.setSpeed(0);
      animation.current?.setTalking?.(true);
      const partner = npcRegistry.get(liveBanter.partnerId);
      if (partner) {
        s.heading = dampAngle(s.heading, Math.atan2(partner.position.x - node.position.x, partner.position.z - node.position.z), 8, delta);
        node.rotation.y = s.heading;
      }
      syncRegistry(npc.id, node.position);
      return;
    }

    // ambient routine targets
    if (time > s.waitUntil) {
      if (s.waitUntil !== 0) {
        if (ambientRole === "shopkeeper" && routineAnchor) {
          const jitter = 0.35;
          s.wanderTarget.set(routineAnchor.x + (s.rng() - 0.5) * jitter, 0, routineAnchor.z + (s.rng() - 0.5) * jitter);
        } else if (ambientRole === "patroller") {
          const district = model.districts.find((entry) => entry.locationId === s.districtId);
          if (district) {
            s.patrolAngle += 0.9 + s.rng() * 0.5;
            const radius = district.courtyard.radius * 1.05;
            s.wanderTarget.set(
              district.courtyard.x + Math.cos(s.patrolAngle) * radius,
              0,
              district.courtyard.z + Math.sin(s.patrolAngle) * radius
            );
          }
        } else if (ambientRole === "idler" && routineAnchor) {
          s.wanderTarget.set(routineAnchor.x + (s.rng() - 0.5) * 0.8, 0, routineAnchor.z + (s.rng() - 0.5) * 0.8);
        } else {
          const angle = s.rng() * Math.PI * 2;
          const radius = s.rng() * WANDER_RADIUS;
          s.wanderTarget.set(s.wanderCenter.x + Math.cos(angle) * radius, 0, s.wanderCenter.z + Math.sin(angle) * radius);
        }
      }
      const idle = ambientRole === "idler" ? 7 : ambientRole === "shopkeeper" ? 5 : 2;
      s.waitUntil = time + (idle + s.rng() * 4) / agency;
    }

    const distance = node.position.distanceTo(s.wanderTarget);
    if (distance < 0.15) {
      animation.current?.setSpeed(0);
    } else {
      const direction = s.wanderTarget.clone().sub(node.position).normalize();
      node.position.addScaledVector(direction, Math.min(WALK_SPEED * delta, distance));
      s.heading = dampAngle(s.heading, Math.atan2(direction.x, direction.z), 10, delta);
      node.rotation.y = s.heading;
      animation.current?.setSpeed(WALK_SPEED);
    }
    syncRegistry(npc.id, node.position);
  });

  const hasOpenQuest = quests.some((quest) => quest.giverId === npc.id && (quest.status ?? "open") === "open");
  const defeated = Boolean(enemy?.defeated) || Boolean(npc.combat?.defeated);
  const hostile = Boolean(enemy?.hostile) && !defeated;

  return (
    <group ref={group} position={[initialSpawn.x, 0, initialSpawn.z]} rotation={[0, initialSpawn.heading, 0]}>
      <RiggedCharacter ref={animation} visual={visual} appearance={npc.appearance} seedId={npc.id} personaText={personaText} />
      {banter ? (
        <Billboard position={[0, 2.75, 0]}>
          <mesh position={[0, 0, -0.01]}>
            <planeGeometry args={[Math.min(2.6, 0.6 + banter.text.length * 0.024), 0.62]} />
            <meshBasicMaterial color={banter.confrontation ? "#3a1418" : "#10141f"} transparent opacity={0.88} depthWrite={false} />
          </mesh>
          <Text
            fontSize={0.13}
            maxWidth={Math.min(2.4, 0.5 + banter.text.length * 0.024)}
            color={banter.confrontation ? "#ffb3a8" : "#e8ecf5"}
            outlineWidth={0.008}
            outlineColor="#0a0d16"
            anchorX="center"
            anchorY="middle"
            textAlign="center"
          >
            {banter.text}
          </Text>
        </Billboard>
      ) : null}
      <Billboard ref={labelRef} position={[0, 2.2, 0]}>
        <Text
          fontSize={0.19}
          color={defeated ? "#8b93a3" : hostile ? "#ff7a6a" : "#e8ecf5"}
          fillOpacity={0.92}
          outlineWidth={0.014}
          outlineColor="#101421"
          outlineOpacity={0.75}
          anchorX="center"
        >
          {npc.name}
        </Text>
        {hasOpenQuest && !defeated && !hostile ? (
          <Text position={[0, 0.34, 0]} fontSize={0.4} color="#ffd84d" outlineWidth={0.03} outlineColor="#3d2a05" anchorX="center">
            !
          </Text>
        ) : null}
        {hostile && enemy ? (
          <group position={[0, 0.32, 0]}>
            <mesh>
              <planeGeometry args={[1.3, 0.13]} />
              <meshBasicMaterial color="#1a1010" transparent opacity={0.85} depthWrite={false} />
            </mesh>
            <mesh position={[-(1.26 * (1 - enemy.hp / enemy.maxHp)) / 2, 0, 0.001]}>
              <planeGeometry args={[Math.max(0.01, 1.26 * (enemy.hp / enemy.maxHp)), 0.09]} />
              <meshBasicMaterial color="#ff5a4a" depthWrite={false} />
            </mesh>
          </group>
        ) : null}
        {lockedOn && !defeated ? (
          <Text position={[0, 0.62, 0]} fontSize={0.34} color="#ffd84d" outlineWidth={0.03} outlineColor="#3d2a05" anchorX="center">
            ◆
          </Text>
        ) : null}
      </Billboard>
    </group>
  );
}

function syncRegistry(npcId: string, position: THREE.Vector3): void {
  const actor = npcRegistry.get(npcId);
  if (actor) actor.position.copy(position);
}

interface EnemyAiContext {
  heading: number;
  aiState: EnemyAiState;
  aiUntil: number;
  struck: boolean;
}

function visualHitPoint(node: THREE.Group): { x: number; y: number; z: number } {
  return { x: node.position.x, y: node.position.y + 1.2, z: node.position.z };
}

function updateEnemyAi(
  npcId: string,
  s: EnemyAiContext,
  node: THREE.Group,
  time: number,
  delta: number,
  animation: CharacterAnimationHandle | null,
  hitPoint: { x: number; y: number; z: number }
): void {
  const store = useCombatStore.getState();
  const enemy = store.enemies[npcId];
  const toPlayer = playerPosition.clone().sub(node.position);
  toPlayer.y = 0;
  const distance = toPlayer.length();
  const faceYaw = Math.atan2(toPlayer.x, toPlayer.z);

  const lowHp = enemy ? enemy.hp / enemy.maxHp < RETREAT_HP_FRACTION : false;

  if (s.aiState === "approach") {
    if (lowHp && distance < 6) {
      s.aiState = "retreat";
      s.aiUntil = time + 2.2;
    } else if (distance <= STRIKE_REACH * 0.85) {
      s.aiState = "telegraph";
      s.aiUntil = time + TELEGRAPH_S;
      s.struck = false;
      animation?.trigger("telegraph");
      store.addVfx({
        kind: "telegraph",
        ...hitPoint,
        color: "#ff6a5a",
        startedAt: performance.now(),
        expiresAt: performance.now() + TELEGRAPH_S * 1000,
      });
    } else {
      const step = toPlayer.normalize().multiplyScalar(Math.min(CHASE_SPEED * delta, Math.max(0, distance - 1.2)));
      node.position.add(step);
      animation?.setSpeed(CHASE_SPEED);
    }
    s.heading = dampAngle(s.heading, faceYaw, 10, delta);
    node.rotation.y = s.heading;
    if (s.aiState === "approach") return;
  }

  if (s.aiState === "telegraph") {
    animation?.setSpeed(0);
    s.heading = dampAngle(s.heading, faceYaw, 6, delta);
    node.rotation.y = s.heading;
    if (time >= s.aiUntil) {
      s.aiState = "strike";
      s.aiUntil = time + 0.18;
      animation?.trigger("attack1");
    }
    return;
  }

  if (s.aiState === "strike") {
    animation?.setSpeed(0);
    if (!s.struck && distance <= STRIKE_REACH) {
      s.struck = true;
      applyIncomingHit(playerCombatState, performance.now(), STRIKE_DAMAGE, {
        x: playerPosition.x,
        y: playerPosition.y + 1.2,
        z: playerPosition.z,
      });
    }
    if (time >= s.aiUntil) {
      s.aiState = "recover";
      s.aiUntil = time + RECOVER_S;
    }
    return;
  }

  if (s.aiState === "recover") {
    animation?.setSpeed(0);
    if (time >= s.aiUntil) s.aiState = "approach";
    return;
  }

  // retreat
  if (time >= s.aiUntil || distance > 9) {
    s.aiState = "approach";
    return;
  }
  const away = toPlayer.normalize().multiplyScalar(-RETREAT_SPEED * delta);
  node.position.add(away);
  s.heading = dampAngle(s.heading, faceYaw, 10, delta);
  node.rotation.y = s.heading;
  animation?.setSpeed(RETREAT_SPEED);
}

function dampAngle(current: number, target: number, lambda: number, delta: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-lambda * delta));
}
