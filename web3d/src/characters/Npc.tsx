import { Billboard, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import type { Npc as NpcData, Quest } from "../../../src/types.ts";
import { missSwoosh, telegraphSting } from "../audio/sfx.ts";
import {
  CHIP_DAMAGE,
  MELEE_RANGE,
  MELEE_STRIKE_RANGE,
  nextChipDelay,
  STANCE_EXIT_RANGE,
  STANCE_RANGE,
  STRAFE_SPEED,
} from "../combat/pacing.ts";
import { applyIncomingHit, playerCombatState } from "../combat/player-fsm.ts";
import { useCombatStore } from "../combat/store.ts";
import { npcRegistry, playerPosition, registerNpc, scaledDelta, unregisterNpc } from "../controls/runtime.ts";
import { useDirectorStore } from "../director/store.ts";
import { useUiStore } from "../store/ui.ts";
import { findDistrictPath, type WorldModel } from "../worldgen/index.ts";
import type { PlacedNpcSpawn } from "../worldgen/placements.ts";
import { rngFor } from "../worldgen/rng.ts";
import { ArchetypeCharacter } from "./ArchetypeCharacter.tsx";
import { archetypeFor } from "./archetypes.ts";
import { useBanterStore } from "./banter.ts";
import type { CharacterAnimationHandle } from "./CharacterModel.tsx";
import { followersStore } from "./followers.ts";

const WALK_SPEED = 1.15;
const TRAVEL_SPEED = 3.4;
const WANDER_RADIUS = 3.2;

const CHASE_SPEED = 3.0;
const RETREAT_SPEED = 2.2;
const RETREAT_HP_FRACTION = 0.25;
/** Shortened telegraph for client chip attacks. */
const CHIP_TELEGRAPH_S = 0.25;
/** Post-strike recovery pause before the next chip cycle begins. */
const CHIP_RECOVER_S = 0.22;

type EnemyAiState = "approach" | "telegraph" | "strike" | "recover" | "strafe" | "retreat";

interface NpcProps {
  npc: NpcData;
  worldId: string;
  spawn: PlacedNpcSpawn;
  model: WorldModel;
  quests: Quest[];
  /** showcase mode: stand at the spawn anchor (idle only), face the player when near */
  staticMode?: boolean;
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

export function Npc({ npc, worldId, spawn, model, quests, staticMode }: NpcProps) {
  const group = useRef<THREE.Group>(null);
  const animation = useRef<CharacterAnimationHandle>(null);
  const labelRef = useRef<THREE.Group>(null);
  // position prop must stay constant: movement is imperative, and a reactive
  // position would teleport the node whenever the sim relocates the NPC
  const [initialSpawn] = useState(() => ({ x: spawn.x, z: spawn.z, heading: spawn.heading }));
  const personaText = `${npc.name} ${npc.role ?? ""} ${npc.description ?? ""}`;
  // Quaternius archetype rigs (CC0, fully animated, per-instance cloned) are the
  // primary models — far higher quality + variety than the procedural mannequin,
  // which stays as the fallback for personas no archetype matches. The anime VRM
  // path (VrmCharacter.tsx + vrm.ts) is shelved as beta while we lean on the
  // stronger stylized asset libraries.
  const archetypeKey = useMemo(
    () => archetypeFor(personaText, npc.role ?? "", npc.appearance?.visualTags ?? [], npc.id),
    [personaText, npc.role, npc.appearance?.visualTags, npc.id]
  );
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
    // strafe + chip cadence
    /** Current lateral strafe sign: +1 or -1. */
    strafeSign: (rngFor(worldId, npc.id, "strafe")() < 0.5 ? 1 : -1) as 1 | -1,
    /** Time when strafe direction should flip (seconds). */
    strafeFlipAt: 0,
    /** Time when the next chip attack window opens (seconds). */
    nextChipAt: 0,
    /** Whether the NPC is in active combat stance (entered STANCE_RANGE). */
    inStance: false,
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

    // showcase: agents hold their spot (idle only) and turn to face the player
    // when they come near — no wandering, travel, or combat.
    if (staticMode) {
      animation.current?.setSpeed(0);
      const dx = playerPosition.x - node.position.x;
      const dz = playerPosition.z - node.position.z;
      if (dx * dx + dz * dz < 30) {
        s.heading = dampAngle(s.heading, Math.atan2(dx, dz), 5, delta);
        node.rotation.y = s.heading;
      }
      syncRegistry(npc.id, node.position);
      return;
    }

    // story cutscenes pause combat AI (ambient behavior continues below)
    const inCutscene = Boolean(useDirectorStore.getState().cutscene);

    // hostile combat AI takes priority over ambient behavior
    if (enemy?.hostile && playerCombatState.kind !== "dead" && !inCutscene) {
      updateEnemyAi(npc.id, npc.name, s, node, time, delta, animation.current, visualHitPoint(node));
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
    if (distance < 0.12) {
      animation.current?.setSpeed(0);
    } else {
      const direction = s.wanderTarget.clone().sub(node.position).normalize();
      // ease speed down on approach so the walk ramps into idle instead of
      // snapping; feed the SAME speed to the animation so feet match the body
      const speed = Math.min(WALK_SPEED, distance * 1.8);
      node.position.addScaledVector(direction, speed * delta);
      s.heading = dampAngle(s.heading, Math.atan2(direction.x, direction.z), 7, delta);
      node.rotation.y = s.heading;
      animation.current?.setSpeed(speed);
    }
    syncRegistry(npc.id, node.position);
  });

  const hasOpenQuest = quests.some((quest) => quest.giverId === npc.id && (quest.status ?? "open") === "open");
  const defeated = Boolean(enemy?.defeated) || Boolean(npc.combat?.defeated);
  const hostile = Boolean(enemy?.hostile) && !defeated;

  // Corpse despawn: keep the death animation visible for a beat, then hide
  // the NPC client-side so the world stops feeling like a morgue. The sim
  // still tracks them as defeated — coming back later they stay gone.
  const [corpseHidden, setCorpseHidden] = useState(false);
  // reset at render when the NPC revives (render-time keyed reset, not setState-in-effect)
  const [corpseTrackedDefeated, setCorpseTrackedDefeated] = useState(defeated);
  if (corpseTrackedDefeated !== defeated) {
    setCorpseTrackedDefeated(defeated);
    if (!defeated) setCorpseHidden(false);
  }
  useEffect(() => {
    if (!defeated) return undefined;
    const t = window.setTimeout(() => setCorpseHidden(true), 6000);
    return () => window.clearTimeout(t);
  }, [defeated]);

  if (corpseHidden) return null;

  return (
    <group ref={group} position={[initialSpawn.x, 0, initialSpawn.z]} rotation={[0, initialSpawn.heading, 0]}>
      <ArchetypeCharacter ref={animation} archetype={archetypeKey} />
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
  strafeSign: 1 | -1;
  strafeFlipAt: number;
  nextChipAt: number;
  inStance: boolean;
  rng: () => number;
}

function visualHitPoint(node: THREE.Group): { x: number; y: number; z: number } {
  return { x: node.position.x, y: node.position.y + 1.2, z: node.position.z };
}

function updateEnemyAi(
  npcId: string,
  npcName: string,
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
  const nowMs = performance.now();

  // Stance entry/exit hysteresis: only engage combat AI when player is close
  if (!s.inStance) {
    if (distance <= STANCE_RANGE) {
      s.inStance = true;
      // seed the first chip delay from this moment
      s.nextChipAt = time + nextChipDelay(s.rng) / 1000;
    } else {
      // player too far — stand still, face them loosely
      animation?.setSpeed(0);
      s.heading = dampAngle(s.heading, faceYaw, 4, delta);
      node.rotation.y = s.heading;
      return;
    }
  } else if (distance > STANCE_EXIT_RANGE && s.aiState !== "telegraph" && s.aiState !== "strike") {
    // dropped out of stance range — exit stance and stop
    s.inStance = false;
    s.aiState = "approach";
    animation?.setSpeed(0);
    return;
  }

  // ── approach ────────────────────────────────────────────────────────────────
  if (s.aiState === "approach") {
    if (lowHp && distance < 6) {
      s.aiState = "retreat";
      s.aiUntil = time + 2.2;
      animation?.setTelegraph?.(false);
    } else if (distance <= MELEE_RANGE) {
      // Within melee range: start strafing and wait for chip timer
      s.aiState = "strafe";
      if (time > s.strafeFlipAt) {
        s.strafeFlipAt = time + 3 + s.rng() * 2;
      }
    } else if (distance <= MELEE_STRIKE_RANGE && time >= s.nextChipAt) {
      // Close enough and chip timer fired: telegraph
      _startTelegraph(s, store, time, nowMs, animation, hitPoint);
    } else {
      // Close in
      const step = toPlayer.normalize().multiplyScalar(Math.min(CHASE_SPEED * delta, Math.max(0, distance - MELEE_RANGE)));
      node.position.add(step);
      animation?.setSpeed(CHASE_SPEED);
    }
    s.heading = dampAngle(s.heading, faceYaw, 10, delta);
    node.rotation.y = s.heading;
    if (s.aiState === "approach") return;
  }

  // ── strafe ──────────────────────────────────────────────────────────────────
  if (s.aiState === "strafe") {
    // Flip direction every 3-5 s
    if (time >= s.strafeFlipAt) {
      s.strafeSign = s.strafeSign === 1 ? -1 : 1;
      s.strafeFlipAt = time + 3 + s.rng() * 2;
    }

    // Exit strafe conditions
    if (lowHp && distance < 6) {
      s.aiState = "retreat";
      s.aiUntil = time + 2.2;
      animation?.setTelegraph?.(false);
    } else if (distance > MELEE_STRIKE_RANGE + 0.5) {
      // player backed away — close in
      s.aiState = "approach";
    } else if (time >= s.nextChipAt) {
      // chip timer fired: start the attack sequence
      _startTelegraph(s, store, time, nowMs, animation, hitPoint);
    } else {
      // lateral step: perpendicular to toPlayer in XZ plane
      const right = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).normalize();
      const step = right.multiplyScalar(s.strafeSign * STRAFE_SPEED * delta);
      node.position.add(step);
      animation?.setSpeed(STRAFE_SPEED);
      // keep facing the player
      s.heading = dampAngle(s.heading, faceYaw, 10, delta);
      node.rotation.y = s.heading;
      return;
    }
    s.heading = dampAngle(s.heading, faceYaw, 10, delta);
    node.rotation.y = s.heading;
    if (s.aiState === "strafe") return;
  }

  // ── telegraph ───────────────────────────────────────────────────────────────
  if (s.aiState === "telegraph") {
    animation?.setSpeed(0);
    s.heading = dampAngle(s.heading, faceYaw, 6, delta);
    node.rotation.y = s.heading;
    if (time >= s.aiUntil) {
      s.aiState = "strike";
      s.aiUntil = time + 0.18;
      animation?.trigger("attack1");
      animation?.setTelegraph?.(false);
    }
    return;
  }

  // ── strike ───────────────────────────────────────────────────────────────────
  if (s.aiState === "strike") {
    animation?.setSpeed(0);
    if (!s.struck && distance <= MELEE_STRIKE_RANGE) {
      s.struck = true;
      // chip=true: floor prevents player from being downed by client-side chips
      const landed = applyIncomingHit(
        playerCombatState,
        nowMs,
        CHIP_DAMAGE,
        { x: playerPosition.x, y: playerPosition.y + 1.2, z: playerPosition.z },
        npcName,
        true
      );
      if (!landed) {
        // dodged — near-miss whoosh
        missSwoosh();
        store.addVfx({
          kind: "dust",
          x: playerPosition.x,
          y: playerPosition.y + 0.9,
          z: playerPosition.z,
          color: "#c0c8d8",
          startedAt: nowMs,
          expiresAt: nowMs + 320,
        });
      }
    }
    if (time >= s.aiUntil) {
      s.aiState = "recover";
      s.aiUntil = time + CHIP_RECOVER_S;
    }
    return;
  }

  // ── recover ──────────────────────────────────────────────────────────────────
  if (s.aiState === "recover") {
    animation?.setSpeed(0);
    if (time >= s.aiUntil) {
      // Schedule next chip: jittered interval counted from NOW (post-recover)
      s.nextChipAt = time + nextChipDelay(s.rng) / 1000;
      // Resume strafing if still in melee range, otherwise approach
      s.aiState = distance <= MELEE_STRIKE_RANGE + 0.5 ? "strafe" : "approach";
    }
    return;
  }

  // ── retreat ──────────────────────────────────────────────────────────────────
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

/** Start telegraph state and emit the VFX + audio cue. */
function _startTelegraph(
  s: EnemyAiContext,
  store: ReturnType<typeof useCombatStore.getState>,
  time: number,
  nowMs: number,
  animation: CharacterAnimationHandle | null,
  hitPoint: { x: number; y: number; z: number }
): void {
  s.aiState = "telegraph";
  s.aiUntil = time + CHIP_TELEGRAPH_S;
  s.struck = false;
  animation?.trigger("telegraph");
  animation?.setTelegraph?.(true);
  telegraphSting();
  store.addVfx({
    kind: "telegraph",
    ...hitPoint,
    color: "#ff8830",
    startedAt: nowMs,
    expiresAt: nowMs + CHIP_TELEGRAPH_S * 1000,
  });
}


function dampAngle(current: number, target: number, lambda: number, delta: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-lambda * delta));
}
