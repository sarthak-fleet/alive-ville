import { Outlines } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { forwardRef, useImperativeHandle, useRef } from "react";
import type * as THREE from "three";

import type { CharacterAppearance } from "../../../src/types.ts";
import { type ActorVisual, stableHash } from "../mapping/visuals.ts";
import { toonMaterial } from "../scene/toon.ts";

const OUTLINE = "#101421";
const OUTLINE_THICKNESS = 0.022;

interface Proportions {
  scale: number;
  torsoWidth: number;
  torsoHeight: number;
  headRadius: number;
  limbThickness: number;
  shoulderWidth: number;
}

const PROPORTIONS: Record<ActorVisual["bodyShape"], Proportions> = {
  average: { scale: 1, torsoWidth: 0.46, torsoHeight: 0.62, headRadius: 0.27, limbThickness: 0.1, shoulderWidth: 0.56 },
  broad: { scale: 1.07, torsoWidth: 0.6, torsoHeight: 0.66, headRadius: 0.27, limbThickness: 0.14, shoulderWidth: 0.78 },
  slim: { scale: 1.02, torsoWidth: 0.38, torsoHeight: 0.64, headRadius: 0.25, limbThickness: 0.085, shoulderWidth: 0.46 },
  small: { scale: 0.76, torsoWidth: 0.42, torsoHeight: 0.5, headRadius: 0.32, limbThickness: 0.095, shoulderWidth: 0.5 },
  caped: { scale: 1.03, torsoWidth: 0.48, torsoHeight: 0.64, headRadius: 0.27, limbThickness: 0.1, shoulderWidth: 0.6 },
  mechanical: { scale: 1.05, torsoWidth: 0.52, torsoHeight: 0.64, headRadius: 0.25, limbThickness: 0.13, shoulderWidth: 0.68 },
};

export type CombatAnimKind = "attack1" | "attack2" | "attack3" | "dodge" | "hit" | "telegraph";

export interface CharacterAnimationHandle {
  /** speed in m/s; 0 = idle */
  setSpeed: (speed: number) => void;
  /** play a short combat animation overlay */
  trigger: (kind: CombatAnimKind) => void;
  /** enter/leave the defeated pose (rig plays Death01; procedural lies down) */
  setDefeated: (defeated: boolean) => void;
  /** brief red damage flash (optional) */
  flash?: () => void;
  /** conversational idle while a dialogue is open (optional) */
  setTalking?: (talking: boolean) => void;
  /** one-shot non-combat gesture (optional; rig only) */
  gesture?: (kind: "pickup" | "interact") => void;
}

const COMBAT_ANIM_MS: Record<CombatAnimKind, number> = {
  attack1: 320,
  attack2: 320,
  attack3: 460,
  dodge: 450,
  hit: 280,
  telegraph: 400,
};

interface CharacterModelProps {
  visual: ActorVisual;
  appearance?: CharacterAppearance;
  seedId: string;
}

type HairStyle = "bald" | "flat" | "spiky" | "ponytail" | "bob" | "buns";

function hairStyleFor(appearance: CharacterAppearance | undefined, seedId: string): HairStyle {
  const text = `${appearance?.hair ?? ""} ${appearance?.sourceLook ?? ""} ${(appearance?.visualTags ?? []).join(" ")}`.toLowerCase();
  if (/bald|shaved|hairless/.test(text)) return "bald";
  if (/spik|wild|messy|flame|shonen/.test(text)) return "spiky";
  if (/ponytail|tied|braid|long/.test(text)) return "ponytail";
  if (/bun|space/.test(text)) return "buns";
  if (/bob|short|neat|trim/.test(text)) return "bob";
  const styles: HairStyle[] = ["flat", "spiky", "bob", "ponytail"];
  return styles[stableHash(`${seedId}:hair`) % styles.length]!;
}

function hairColorFor(appearance: CharacterAppearance | undefined, accent: string): string {
  const text = `${appearance?.hair ?? ""} ${appearance?.sourceLook ?? ""} ${(appearance?.visualTags ?? []).join(" ")}`.toLowerCase();
  if (/black/.test(text)) return "#23252e";
  if (/white|silver/.test(text)) return "#e8e9ef";
  if (/blond|gold|yellow/.test(text)) return "#e8c95a";
  if (/pink/.test(text)) return "#e88aa8";
  if (/green/.test(text)) return "#5da55a";
  if (/blue/.test(text)) return "#5a7fd6";
  if (/red|crimson|orange/.test(text)) return "#c8503c";
  if (/brown|auburn/.test(text)) return "#6e4a32";
  return accent;
}

/**
 * Procedural anime-chibi character v2: capsule torso, two-segment limbs with
 * elbow/knee flex, expressive face, hair styles, outfit layers. ~1.7m tall at
 * scale 1, origin at feet. Animation runs imperatively via the handle.
 */
export const CharacterModel = forwardRef<CharacterAnimationHandle, CharacterModelProps>(function CharacterModel(
  { visual, appearance, seedId },
  ref
) {
  const p = PROPORTIONS[visual.bodyShape];
  const speedRef = useRef(0);
  const combatAnim = useRef<{ kind: CombatAnimKind; startedAt: number } | null>(null);
  const phaseRef = useRef((stableHash(seedId) % 100) / 16);

  const root = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const leftForearm = useRef<THREE.Group>(null);
  const rightForearm = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const leftShin = useRef<THREE.Group>(null);
  const rightShin = useRef<THREE.Group>(null);
  const cape = useRef<THREE.Mesh>(null);
  const ponytail = useRef<THREE.Group>(null);

  const defeatedRef = useRef(false);

  useImperativeHandle(ref, () => ({
    setSpeed: (speed: number) => {
      speedRef.current = speed;
    },
    trigger: (kind: CombatAnimKind) => {
      combatAnim.current = { kind, startedAt: performance.now() };
    },
    setDefeated: (defeated: boolean) => {
      defeatedRef.current = defeated;
    },
  }));

  useFrame((_, delta) => {
    if (root.current) {
      // defeated: lie down (procedural rigs have no death clip)
      const targetX = defeatedRef.current ? -Math.PI / 2 : 0;
      root.current.rotation.x += (targetX - root.current.rotation.x) * Math.min(1, delta * 8);
      root.current.position.y = defeatedRef.current ? 0.3 : 0;
      if (defeatedRef.current) return;
    }
    const speed = speedRef.current;
    const walking = speed > 0.05;
    const running = speed > 4.2;
    phaseRef.current += delta * (walking ? Math.max(4.6, speed * 2.6) : 1.5);
    const phase = phaseRef.current;
    const swing = walking ? Math.min(0.9, 0.42 + speed * 0.085) : 0;
    const sinP = Math.sin(phase);
    const cosP = Math.cos(phase);

    // legs: hip swing + knee flex on the back-swing (no knee hyperextension)
    if (leftLeg.current && leftShin.current) {
      leftLeg.current.rotation.x = sinP * swing;
      leftShin.current.rotation.x = walking ? Math.max(0, -sinP) * swing * 1.15 : 0;
    }
    if (rightLeg.current && rightShin.current) {
      rightLeg.current.rotation.x = -sinP * swing;
      rightShin.current.rotation.x = walking ? Math.max(0, sinP) * swing * 1.15 : 0;
    }
    // arms: counter-swing with relaxed elbow bend
    if (leftArm.current && leftForearm.current) {
      leftArm.current.rotation.x = -sinP * swing * 0.85;
      leftArm.current.rotation.z = 0.1;
      leftForearm.current.rotation.x = walking ? -0.35 - Math.max(0, sinP) * 0.3 : -0.12 - Math.sin(phase * 0.8) * 0.03;
    }
    if (rightArm.current && rightForearm.current) {
      rightArm.current.rotation.x = sinP * swing * 0.85;
      rightArm.current.rotation.z = -0.1;
      rightForearm.current.rotation.x = walking ? -0.35 - Math.max(0, -sinP) * 0.3 : -0.12 - Math.sin(phase * 0.8 + 1) * 0.03;
    }
    if (torso.current) {
      // bounce, breath, and a forward lean that grows with speed
      torso.current.position.y = walking ? Math.abs(Math.sin(phase)) * (running ? 0.06 : 0.035) : Math.sin(phase * 0.7) * 0.012;
      torso.current.rotation.x = walking ? (running ? 0.18 : 0.07) : 0;
      torso.current.rotation.y = walking ? sinP * 0.07 : 0;
      torso.current.rotation.z = 0;
    }
    if (head.current) {
      head.current.rotation.x = walking ? -(running ? 0.1 : 0.04) : Math.sin(phase * 0.7 + 0.6) * 0.02;
      head.current.rotation.z = walking ? cosP * 0.03 : 0;
    }
    if (cape.current) {
      cape.current.rotation.x = 0.14 + (walking ? (running ? 0.55 : 0.3) + sinP * 0.07 : Math.sin(phase * 0.7) * 0.05);
    }
    if (ponytail.current) {
      ponytail.current.rotation.x = (walking ? 0.32 : 0.1) + Math.sin(phase * (walking ? 1 : 0.7)) * 0.08;
    }

    // combat overlay poses
    const anim = combatAnim.current;
    if (anim) {
      const elapsed = performance.now() - anim.startedAt;
      const duration = COMBAT_ANIM_MS[anim.kind];
      if (elapsed >= duration) {
        combatAnim.current = null;
      } else {
        const t = elapsed / duration;
        const punch = Math.sin(Math.min(1, t * 1.6) * Math.PI);
        if (anim.kind === "attack1" && rightArm.current && rightForearm.current) {
          rightArm.current.rotation.x = -punch * 1.9;
          rightForearm.current.rotation.x = -0.15 + punch * 0.1;
          if (torso.current) torso.current.rotation.y = -punch * 0.45;
        } else if (anim.kind === "attack2" && leftArm.current && leftForearm.current) {
          leftArm.current.rotation.x = -punch * 1.9;
          leftForearm.current.rotation.x = -0.15 + punch * 0.1;
          if (torso.current) torso.current.rotation.y = punch * 0.45;
        } else if (anim.kind === "attack3") {
          for (const arm of [leftArm.current, rightArm.current]) if (arm) arm.rotation.x = -punch * 2.3;
          for (const forearm of [leftForearm.current, rightForearm.current]) if (forearm) forearm.rotation.x = -0.1;
          if (torso.current) torso.current.rotation.x = punch * 0.3;
        } else if (anim.kind === "dodge" && torso.current) {
          torso.current.rotation.x = Math.sin(t * Math.PI) * 0.95;
        } else if (anim.kind === "hit" && torso.current) {
          torso.current.rotation.x = -Math.sin(t * Math.PI) * 0.38;
          if (head.current) head.current.rotation.x = -Math.sin(t * Math.PI) * 0.2;
        } else if (anim.kind === "telegraph" && rightArm.current) {
          rightArm.current.rotation.x = -Math.min(1, t * 2) * 2.1;
          if (torso.current) torso.current.rotation.y = -Math.min(1, t * 2) * 0.32;
        }
      }
    }
  });

  const outfit = toonMaterial(visual.color);
  const outfitDark = toonMaterial(shadeHex(visual.color, -0.22));
  const accent = toonMaterial(visual.accentColor);
  const skinColor = visual.bodyShape === "mechanical" ? "#aeb6c4" : visual.skinColor;
  const skin = toonMaterial(skinColor);
  const hairStyle = visual.bodyShape === "mechanical" ? "bald" : hairStyleFor(appearance, seedId);
  const hair = toonMaterial(hairColorFor(appearance, visual.accentColor));

  const legLength = 0.78;
  const hipY = legLength;
  const torsoCenter = hipY + p.torsoHeight / 2;
  const shoulderY = hipY + p.torsoHeight - 0.05;
  const headCenter = hipY + p.torsoHeight + p.headRadius + 0.07;
  const upperLimb = 0.3;
  const lowerLimb = 0.3;

  return (
    <group ref={root} scale={p.scale}>
      <group ref={torso}>
        {/* hips */}
        <mesh position={[0, hipY + 0.04, 0]} castShadow material={outfitDark}>
          <cylinderGeometry args={[p.torsoWidth * 0.46, p.torsoWidth * 0.52, 0.18, 12]} />
        </mesh>
        {/* torso capsule, slightly tapered */}
        <mesh position={[0, torsoCenter + 0.03, 0]} castShadow material={outfit}>
          <capsuleGeometry args={[p.torsoWidth * 0.5, p.torsoHeight * 0.62, 4, 12]} />
          <Outlines thickness={OUTLINE_THICKNESS} color={OUTLINE} />
        </mesh>
        {/* collar */}
        <mesh position={[0, shoulderY + 0.07, 0]} material={accent}>
          <cylinderGeometry args={[p.headRadius * 0.62, p.headRadius * 0.78, 0.1, 12]} />
        </mesh>
        {/* belt */}
        <mesh position={[0, hipY + 0.15, 0]} material={accent}>
          <cylinderGeometry args={[p.torsoWidth * 0.51, p.torsoWidth * 0.51, 0.07, 12]} />
        </mesh>
        {/* shoulders */}
        <mesh position={[-p.shoulderWidth / 2, shoulderY, 0]} castShadow material={outfit}>
          <sphereGeometry args={[p.limbThickness * 1.5, 10, 8]} />
        </mesh>
        <mesh position={[p.shoulderWidth / 2, shoulderY, 0]} castShadow material={outfit}>
          <sphereGeometry args={[p.limbThickness * 1.5, 10, 8]} />
        </mesh>

        {/* head */}
        <group ref={head} position={[0, headCenter, 0]}>
          <mesh castShadow material={skin}>
            <sphereGeometry args={[p.headRadius, 20, 16]} />
            <Outlines thickness={OUTLINE_THICKNESS} color={OUTLINE} />
          </mesh>
          {/* anime eyes: white, iris, highlight */}
          {[-1, 1].map((side) => (
            <group key={side} position={[side * p.headRadius * 0.4, 0.015, p.headRadius * 0.82]}>
              <mesh material={toonMaterial("#f6f7fb")} scale={[1, 1.5, 0.55]}>
                <sphereGeometry args={[0.052, 10, 8]} />
              </mesh>
              <mesh position={[0, -0.004, 0.024]} material={toonMaterial("#1d2330")} scale={[1, 1.45, 0.5]}>
                <sphereGeometry args={[0.032, 8, 8]} />
              </mesh>
              <mesh position={[0.012, 0.015, 0.042]} material={toonMaterial("#ffffff")}>
                <sphereGeometry args={[0.01, 6, 6]} />
              </mesh>
              {/* brow */}
              <mesh position={[0, 0.085, 0.012]} rotation={[0, 0, side * -0.18]} material={hair}>
                <boxGeometry args={[0.085, 0.018, 0.02]} />
              </mesh>
            </group>
          ))}
          {/* mouth */}
          <mesh position={[0, -p.headRadius * 0.42, p.headRadius * 0.86]} material={toonMaterial("#9c5a55")}>
            <boxGeometry args={[0.05, 0.014, 0.012]} />
          </mesh>
          {/* hair */}
          <Hair style={hairStyle} radius={p.headRadius} material={hair} ponytailRef={ponytail} />
          {visual.bodyShape === "mechanical" ? (
            <mesh position={[0, 0.03, p.headRadius * 0.72]} material={toonMaterial("#2b3442", visual.accentColor)}>
              <boxGeometry args={[p.headRadius * 1.6, 0.09, 0.1]} />
            </mesh>
          ) : null}
        </group>

        {/* arms: upper + forearm with elbow */}
        {([-1, 1] as const).map((side) => (
          <group
            key={side}
            ref={side === -1 ? leftArm : rightArm}
            position={[side * (p.shoulderWidth / 2 + 0.02), shoulderY, 0]}
          >
            <mesh position={[0, -upperLimb / 2, 0]} castShadow material={outfit}>
              <capsuleGeometry args={[p.limbThickness, upperLimb * 0.7, 4, 8]} />
            </mesh>
            <group ref={side === -1 ? leftForearm : rightForearm} position={[0, -upperLimb, 0]}>
              <mesh position={[0, -lowerLimb / 2, 0]} castShadow material={outfit}>
                <capsuleGeometry args={[p.limbThickness * 0.86, lowerLimb * 0.7, 4, 8]} />
              </mesh>
              <mesh position={[0, -lowerLimb - 0.03, 0]} material={skin}>
                <sphereGeometry args={[p.limbThickness * 0.95, 8, 7]} />
              </mesh>
            </group>
          </group>
        ))}

        {/* cape */}
        {visual.bodyShape === "caped" ? (
          <mesh
            ref={cape}
            position={[0, shoulderY + 0.02, -(p.torsoWidth * 0.42)]}
            rotation={[0.14, 0, 0]}
            castShadow
            material={toonMaterial(visual.accentColor)}
          >
            <boxGeometry args={[p.shoulderWidth + 0.14, 0.95, 0.03]} />
            <Outlines thickness={OUTLINE_THICKNESS} color={OUTLINE} />
          </mesh>
        ) : null}
      </group>

      {/* legs: thigh + shin with knee */}
      {([-1, 1] as const).map((side) => (
        <group key={side} ref={side === -1 ? leftLeg : rightLeg} position={[side * p.torsoWidth * 0.27, hipY, 0]}>
          <mesh position={[0, -upperLimb / 2, 0]} castShadow material={outfitDark}>
            <capsuleGeometry args={[p.limbThickness * 1.12, upperLimb * 0.62, 4, 8]} />
          </mesh>
          <group ref={side === -1 ? leftShin : rightShin} position={[0, -upperLimb, 0]}>
            <mesh position={[0, -lowerLimb / 2, 0]} castShadow material={outfitDark}>
              <capsuleGeometry args={[p.limbThickness * 0.92, lowerLimb * 0.6, 4, 8]} />
            </mesh>
            {/* boot */}
            <mesh position={[0, -lowerLimb - 0.05, 0.05]} castShadow material={accent}>
              <boxGeometry args={[p.limbThickness * 2.3, 0.13, p.limbThickness * 3.4]} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
});

function Hair({
  style,
  radius,
  material,
  ponytailRef,
}: {
  style: HairStyle;
  radius: number;
  material: THREE.Material;
  ponytailRef: React.RefObject<THREE.Group | null>;
}) {
  if (style === "bald") return null;
  return (
    <group>
      {/* base cap for every style */}
      <mesh position={[0, radius * 0.28, -0.02]} castShadow material={material}>
        <sphereGeometry args={[radius * 1.06, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58]} />
        <Outlines thickness={OUTLINE_THICKNESS} color={OUTLINE} />
      </mesh>
      {style === "spiky" ? (
        <>
          {[
            [0, 0.95, 0, -0.2, 0],
            [0.5, 0.82, 0.15, 0.5, 0.4],
            [-0.5, 0.82, 0.15, 0.5, -0.4],
            [0.28, 0.9, -0.4, -0.5, 0.25],
            [-0.28, 0.9, -0.4, -0.5, -0.25],
          ].map(([x, y, z, rx, rz], index) => (
            <mesh
              key={index}
              position={[x! * radius, y! * radius, z! * radius]}
              rotation={[rx!, 0, rz!]}
              castShadow
              material={material}
            >
              <coneGeometry args={[radius * 0.3, radius * 0.85, 6]} />
            </mesh>
          ))}
        </>
      ) : null}
      {style === "ponytail" ? (
        <group ref={ponytailRef} position={[0, radius * 0.55, -radius * 0.75]}>
          <mesh position={[0, -radius * 0.55, -radius * 0.12]} rotation={[0.5, 0, 0]} castShadow material={material}>
            <capsuleGeometry args={[radius * 0.24, radius * 1.15, 4, 8]} />
          </mesh>
        </group>
      ) : null}
      {style === "bob" ? (
        <mesh position={[0, -radius * 0.12, -radius * 0.28]} castShadow material={material}>
          <sphereGeometry args={[radius * 1.04, 14, 10, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.36]} />
        </mesh>
      ) : null}
      {style === "buns" ? (
        <>
          <mesh position={[radius * 0.62, radius * 0.62, -radius * 0.25]} castShadow material={material}>
            <sphereGeometry args={[radius * 0.32, 10, 8]} />
          </mesh>
          <mesh position={[-radius * 0.62, radius * 0.62, -radius * 0.25]} castShadow material={material}>
            <sphereGeometry args={[radius * 0.32, 10, 8]} />
          </mesh>
        </>
      ) : null}
      {/* front fringe except for spiky */}
      {style !== "spiky" ? (
        <mesh position={[0, radius * 0.52, radius * 0.62]} rotation={[0.5, 0, 0]} castShadow material={material}>
          <sphereGeometry args={[radius * 0.55, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
        </mesh>
      ) : null}
    </group>
  );
}

function shadeHex(hex: string, amount: number): string {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  const channels = [16, 8, 0].map((shift) => {
    const channel = (value >> shift) & 0xff;
    const next = amount >= 0 ? channel + (255 - channel) * amount : channel * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(next)));
  });
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}
