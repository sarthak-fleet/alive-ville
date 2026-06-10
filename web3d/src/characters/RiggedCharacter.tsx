import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

import type { CharacterAppearance } from "../../../src/types.ts";
import { scaledDelta } from "../controls/runtime.ts";
import { type ActorVisual, stableHash } from "../mapping/visuals.ts";
import { toonGradientMap, toonMaterial } from "../scene/toon.ts";
import type { CharacterAnimationHandle, CombatAnimKind } from "./CharacterModel.tsx";
import { outfitColorsFor, paintOutfit } from "./clothing.ts";

const MODEL_URL = "/assets/characters/ual.glb";
const TARGET_HEIGHT = 1.7;

interface LocomotionEntry {
  clip: string;
  minSpeed: number;
  baseSpeed?: number;
}

const LOCOMOTION: LocomotionEntry[] = [
  { clip: "Idle_Loop", minSpeed: 0 },
  { clip: "Walk_Loop", minSpeed: 0.05, baseSpeed: 1.4 },
  { clip: "Jog_Fwd_Loop", minSpeed: 2.4, baseSpeed: 3.4 },
  { clip: "Sprint_Loop", minSpeed: 4.6, baseSpeed: 6.4 },
];

const COMBAT_CLIPS: Record<CombatAnimKind, { clip: string; durationScale?: number }> = {
  attack1: { clip: "Punch_Jab" },
  attack2: { clip: "Punch_Cross" },
  attack3: { clip: "Sword_Attack" },
  dodge: { clip: "Roll" },
  hit: { clip: "Hit_Chest" },
  telegraph: { clip: "Spell_Simple_Enter" },
};

const GESTURE_CLIPS: Record<"pickup" | "interact", string> = {
  pickup: "PickUp_Table",
  interact: "Interact",
};

interface RiggedCharacterProps {
  visual: ActorVisual;
  appearance?: CharacterAppearance;
  seedId: string;
  /** name + role + description — drives gender presentation cues */
  personaText?: string;
}

type HairStyle = "bald" | "flat" | "spiky" | "ponytail" | "bob" | "buns";

export function isFemalePresenting(appearance: CharacterAppearance | undefined, personaText: string): boolean {
  const text = `${personaText} ${appearance?.sourceLook ?? ""} ${appearance?.outfit ?? ""} ${(appearance?.visualTags ?? []).join(" ")}`.toLowerCase();
  return /\bshe\b|\bher\b|\bhers\b|\bwoman\b|\bgirl\b|\blady\b|female|feminine|dress|skirt/.test(text);
}

function hairStyleFor(appearance: CharacterAppearance | undefined, seedId: string, female: boolean): HairStyle {
  const text = `${appearance?.hair ?? ""} ${appearance?.sourceLook ?? ""} ${(appearance?.visualTags ?? []).join(" ")}`.toLowerCase();
  if (/bald|shaved|hairless/.test(text)) return "bald";
  if (/spik|wild|messy|flame|shonen/.test(text)) return "spiky";
  if (/ponytail|tied|braid|long/.test(text)) return "ponytail";
  if (/bun|space/.test(text)) return "buns";
  if (/bob|short|neat|trim/.test(text)) return "bob";
  const styles: HairStyle[] = female ? ["ponytail", "bob", "buns", "ponytail"] : ["flat", "spiky", "bob", "flat"];
  return styles[stableHash(`${seedId}:hair`) % styles.length]!;
}

const NATURAL_HAIR = ["#23252e", "#3a2e24", "#6e4a32", "#8a6a3c", "#e8c95a", "#b8bcc8", "#742f20"];

function hairColorFor(appearance: CharacterAppearance | undefined, seedId: string): string {
  const text = `${appearance?.hair ?? ""} ${appearance?.sourceLook ?? ""} ${(appearance?.visualTags ?? []).join(" ")}`.toLowerCase();
  if (/black/.test(text)) return "#23252e";
  if (/white|silver/.test(text)) return "#e8e9ef";
  if (/blond|gold|yellow/.test(text)) return "#e8c95a";
  if (/pink/.test(text)) return "#e88aa8";
  if (/green/.test(text)) return "#5da55a";
  if (/blue/.test(text)) return "#5a7fd6";
  if (/red|crimson|orange/.test(text)) return "#c8503c";
  if (/brown|auburn/.test(text)) return "#6e4a32";
  // hash a natural color — accent-colored hair vanished against accent bodies
  return NATURAL_HAIR[stableHash(`${seedId}:haircolor`) % NATURAL_HAIR.length]!;
}

/**
 * Quaternius Universal Animation Library mannequin (CC0), cloned per actor
 * with SkeletonUtils so every character shares one loaded skeleton+clips.
 * The body tints to the actor's palette; procedural hair/eyes/capes attach
 * to the Head/spine bones so schema identity survives the rig swap.
 */
export const RiggedCharacter = forwardRef<CharacterAnimationHandle, RiggedCharacterProps>(function RiggedCharacter(
  { visual, appearance, seedId, personaText = "" },
  ref
) {
  const gltf = useGLTF(MODEL_URL);
  const speedRef = useRef(0);
  const defeatedRef = useRef(false);

  // primitive deps: the visual object's identity churns with every sim tick
  const { color, accentColor, skinColor, bodyShape } = visual;

  const { scene, mixer, actions, normalizeScale, headBone, chestBone, hipsBone } = useMemo(() => {
    const cloned = cloneSkeleton(gltf.scene);
    const box = new THREE.Box3().setFromObject(cloned);
    const height = Math.max(0.01, box.max.y - box.min.y);
    const normalize = TARGET_HEIGHT / height;

    // clothing zones painted as vertex colors over the shared mannequin
    const outfit = outfitColorsFor({ color, accentColor, skinColor, bodyShape }, seedId);
    const bodyMaterial = new THREE.MeshToonMaterial({
      color: new THREE.Color("#ffffff"),
      vertexColors: true,
      gradientMap: toonGradientMap(),
    });
    cloned.traverse((object: THREE.Object3D) => {
      const mesh = object as THREE.SkinnedMesh;
      if (mesh.isSkinnedMesh || (mesh as unknown as THREE.Mesh).isMesh) {
        mesh.geometry = mesh.geometry.clone();
        paintOutfit(mesh.geometry, outfit);
        mesh.material = bodyMaterial;
        mesh.castShadow = true;
        mesh.frustumCulled = false;
      }
    });

    const animMixer = new THREE.AnimationMixer(cloned);
    const clipActions = new Map<string, THREE.AnimationAction>();
    for (const clip of gltf.animations) {
      clipActions.set(clip.name, animMixer.clipAction(clip));
    }
    return {
      scene: cloned,
      mixer: animMixer,
      actions: clipActions,
      normalizeScale: normalize,
      headBone: cloned.getObjectByName("Head") ?? null,
      chestBone: cloned.getObjectByName("spine_03") ?? cloned.getObjectByName("neck_01") ?? null,
      hipsBone: cloned.getObjectByName("pelvis") ?? cloned.getObjectByName("Hips") ?? cloned.getObjectByName("spine_01") ?? null,
    };
  }, [gltf, color, accentColor, skinColor, bodyShape, seedId]);

  // Identity decor (hair/eyes/cape) lives OUTSIDE the skeleton in clean model
  // space and follows its bone every frame — bone-local scale/axis conventions
  // (Unreal-style skeletons) make direct bone parenting unreliable.
  const headDecor = useRef<THREE.Group>(null);
  const chestDecor = useRef<THREE.Group>(null);
  const hipsDecor = useRef<THREE.Group>(null);
  const bindCorrection = useRef<{ head: THREE.Quaternion; chest: THREE.Quaternion; hips: THREE.Quaternion } | null>(null);

  const female = useMemo(() => isFemalePresenting(appearance, personaText), [appearance, personaText]);

  const decor = useMemo(() => {
    const hairStyle = visual.bodyShape === "mechanical" ? "bald" : hairStyleFor(appearance, seedId, female);
    const head = new THREE.Group();
    buildHeadDecor(head, hairStyle, hairColorFor(appearance, seedId), visual);
    let chest: THREE.Group | null = null;
    if (visual.bodyShape === "caped") {
      chest = new THREE.Group();
      const cape = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.03), toonMaterial(visual.accentColor));
      cape.position.set(0, -0.3, -0.16);
      cape.rotation.x = 0.18;
      cape.castShadow = true;
      chest.add(cape);
    }
    let hips: THREE.Group | null = null;
    if (female) {
      hips = new THREE.Group();
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.34, 0.42, 12, 1, true), toonMaterial(visual.accentColor));
      skirt.position.set(0, -0.28, 0);
      skirt.castShadow = true;
      hips.add(skirt);
    }
    return { head, chest, hips };
  }, [appearance, seedId, visual, female]);

  useEffect(() => {
    // bind-pose correction: rotate bone orientation into model axes
    scene.updateWorldMatrix(true, true);
    const modelQuat = new THREE.Quaternion();
    scene.getWorldQuaternion(modelQuat);
    const correctionFor = (bone: THREE.Object3D | null): THREE.Quaternion => {
      const q = new THREE.Quaternion();
      if (!bone) return q;
      bone.getWorldQuaternion(q);
      return q.invert().multiply(modelQuat);
    };
    bindCorrection.current = { head: correctionFor(headBone), chest: correctionFor(chestBone), hips: correctionFor(hipsBone) };
  }, [scene, headBone, chestBone, hipsBone]);

  const currentLocomotion = useRef<string>("");
  const overlayUntil = useRef(0);
  const talkingRef = useRef(false);

  const flashUntil = useRef(0);

  const playOverlay = (clipName: string, fadeIn: number) => {
    const action = actions.get(clipName);
    if (!action) return;
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.fadeIn(fadeIn).play();
    overlayUntil.current = performance.now() + action.getClip().duration * 1000;
    window.setTimeout(() => action.fadeOut(0.12), Math.max(0, action.getClip().duration * 1000 - 120));
  };

  useImperativeHandle(ref, () => ({
    setSpeed: (speed: number) => {
      speedRef.current = speed;
    },
    flash: () => {
      flashUntil.current = performance.now() + 140;
    },
    setTalking: (talking: boolean) => {
      talkingRef.current = talking;
    },
    gesture: (kind: "pickup" | "interact") => {
      playOverlay(GESTURE_CLIPS[kind], 0.12);
    },
    trigger: (kind: CombatAnimKind) => {
      playOverlay(COMBAT_CLIPS[kind].clip, 0.06);
    },
    setDefeated: (defeated: boolean) => {
      if (defeated === defeatedRef.current) return;
      defeatedRef.current = defeated;
      if (defeated) {
        for (const action of actions.values()) action.stop();
        const death = actions.get("Death01");
        if (death) {
          death.reset();
          death.setLoop(THREE.LoopOnce, 1);
          death.clampWhenFinished = true;
          death.play();
        }
        currentLocomotion.current = "";
      }
    },
  }));

  const rootRef = useRef<THREE.Group>(null);
  const tmpVec = useMemo(() => new THREE.Vector3(), []);
  const tmpQuat = useMemo(() => new THREE.Quaternion(), []);
  const tmpQuat2 = useMemo(() => new THREE.Quaternion(), []);

  useFrame((_, rawDelta) => {
    const delta = scaledDelta(rawDelta);
    mixer.update(delta);

    // damage flash: pulse the body material red
    const material = (scene.getObjectByProperty("isSkinnedMesh", true) as THREE.SkinnedMesh | undefined)?.material as
      | THREE.MeshToonMaterial
      | undefined;
    if (material) {
      const flashing = performance.now() < flashUntil.current;
      const target = flashing ? 0.85 : 0;
      if (material.emissiveIntensity !== target) {
        material.emissive.set("#ff4030");
        material.emissiveIntensity = target;
      }
    }

    // decor follows its bone (world -> root-local each frame)
    const root = rootRef.current;
    const correction = bindCorrection.current;
    if (root && correction) {
      const sync = (decorGroup: THREE.Group | null, bone: THREE.Object3D | null, corr: THREE.Quaternion) => {
        if (!decorGroup || !bone) return;
        bone.getWorldPosition(tmpVec);
        root.worldToLocal(tmpVec);
        decorGroup.position.copy(tmpVec);
        bone.getWorldQuaternion(tmpQuat);
        tmpQuat.multiply(corr);
        root.getWorldQuaternion(tmpQuat2);
        decorGroup.quaternion.copy(tmpQuat2.invert()).multiply(tmpQuat);
      };
      sync(headDecor.current, headBone, correction.head);
      sync(chestDecor.current, chestBone, correction.chest);
      sync(hipsDecor.current, hipsBone, correction.hips);
    }

    if (defeatedRef.current) return;
    if (performance.now() < overlayUntil.current) return;

    const speed = speedRef.current;
    let next: LocomotionEntry = LOCOMOTION[0]!;
    for (const entry of LOCOMOTION) if (speed >= entry.minSpeed) next = entry;
    // conversational idle while a dialogue is open
    const targetClip = next.clip === "Idle_Loop" && talkingRef.current ? "Idle_Talking_Loop" : next.clip;
    const action = actions.get(targetClip);
    if (!action) return;
    if (currentLocomotion.current !== targetClip) {
      const previous = actions.get(currentLocomotion.current);
      previous?.fadeOut(0.18);
      action.reset().fadeIn(0.18).play();
      currentLocomotion.current = targetClip;
    }
    if (next.baseSpeed) {
      action.timeScale = THREE.MathUtils.clamp(speed / next.baseSpeed, 0.7, 1.5);
    }
  });

  const baseScale = visual.bodyShape === "broad" ? 1.08 : visual.bodyShape === "small" ? 0.8 : visual.bodyShape === "slim" ? 0.98 : 1;
  const bodyScale = baseScale * (female ? 0.95 : 1);

  return (
    <group ref={rootRef} scale={bodyScale}>
      <primitive object={scene} scale={normalizeScale} />
      <primitive ref={headDecor} object={decor.head} />
      {decor.chest ? <primitive ref={chestDecor} object={decor.chest} /> : null}
      {decor.hips ? <primitive ref={hipsDecor} object={decor.hips} /> : null}
    </group>
  );
});

function buildHeadDecor(outer: THREE.Group, style: HairStyle, hairColor: string, visual: ActorVisual): void {
  const radius = 0.14;
  const hair = toonMaterial(hairColor);
  // head bone sits at the neck; head center is a bit above it
  const group = new THREE.Group();
  group.position.set(0, 0.12, 0);
  outer.add(group);

  // anime eyes — sit at mid-face, not the hairline
  for (const side of [-1, 1]) {
    const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), toonMaterial("#f6f7fb"));
    eyeWhite.scale.set(1, 1.4, 0.5);
    eyeWhite.position.set(side * radius * 0.4, -0.015, radius * 0.92);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), toonMaterial("#1d2330"));
    iris.scale.set(1, 1.4, 0.5);
    iris.position.set(side * radius * 0.4, -0.017, radius * 0.97);
    group.add(eyeWhite, iris);
  }
  if (visual.bodyShape === "mechanical") {
    const visor = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.1, 0.05, 0.05), toonMaterial("#2b3442", visual.accentColor));
    visor.position.set(0, 0.045, radius * 0.72);
    group.add(visor);
  }
  if (style === "bald") return;

  const cap = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.12, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), hair.clone());
  cap.position.set(0, 0.055, -0.01);
  group.add(cap);

  if (style === "spiky") {
    const spikes: Array<[number, number, number, number, number]> = [
      [0, 1.1, 0, -0.2, 0],
      [0.55, 0.95, 0.15, 0.5, 0.4],
      [-0.55, 0.95, 0.15, 0.5, -0.4],
      [0.3, 1.05, -0.45, -0.5, 0.25],
      [-0.3, 1.05, -0.45, -0.5, -0.25],
    ];
    for (const [x, y, z, rx, rz] of spikes) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.3, radius * 0.9, 6), hair);
      spike.position.set(x * radius, y * radius, z * radius);
      spike.rotation.set(rx, 0, rz);
      group.add(spike);
    }
  } else if (style === "ponytail") {
    const tail = new THREE.Mesh(new THREE.CapsuleGeometry(radius * 0.26, radius * 1.2, 4, 8), hair);
    tail.position.set(0, -0.02, -radius * 0.95);
    tail.rotation.x = 0.55;
    group.add(tail);
  } else if (style === "bob") {
    const back = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.1, 14, 10, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.36), hair);
    back.position.set(0, -0.01, -0.02);
    group.add(back);
  } else if (style === "buns") {
    for (const side of [-1, 1]) {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.34, 10, 8), hair);
      bun.position.set(side * radius * 0.68, radius * 0.66, -radius * 0.25);
      group.add(bun);
    }
  }
  if (style !== "spiky") {
    const fringe = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.58, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hair);
    fringe.position.set(0, radius * 0.55, radius * 0.6);
    fringe.rotation.x = 0.5;
    group.add(fringe);
  }
}

useGLTF.preload(MODEL_URL);
