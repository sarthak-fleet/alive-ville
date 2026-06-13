import { Outlines, useGLTF } from "@react-three/drei";
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
import {
  buildFaceMesh,
  buildHairV2Extra,
  buildRoleSilhouetteMeshes,
  buildVariation,
  type FaceVariant,
  faceVariantFor,
  type HairStyleV2,
  hairStyleV2For,
  roleSilhouetteFor,
} from "./identity.ts";

const MODEL_URL = `${import.meta.env.BASE_URL}assets/characters/ual.glb`;
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
  /** renders a stronger outline so the player reads as protagonist at a glance */
  protagonist?: boolean;
}

export function isFemalePresenting(appearance: CharacterAppearance | undefined, personaText: string): boolean {
  const text = `${personaText} ${appearance?.sourceLook ?? ""} ${appearance?.outfit ?? ""} ${(appearance?.visualTags ?? []).join(" ")}`.toLowerCase();
  // word boundaries matter: "dressed as a gentleman" must not read as feminine
  return /\bshe\b|\bher\b|\bhers\b|\bwoman\b|\bgirl\b|\blady\b|female|feminine|\bdress\b|\bskirt\b/.test(text);
}

function hairStyleFor(appearance: CharacterAppearance | undefined, seedId: string, female: boolean): HairStyleV2 {
  const text = `${appearance?.hair ?? ""} ${appearance?.sourceLook ?? ""} ${(appearance?.visualTags ?? []).join(" ")}`;
  return hairStyleV2For(text, seedId, female);
}

const NATURAL_HAIR = ["#23252e", "#3a2e24", "#6e4a32", "#8a6a3c", "#e8c95a", "#b8bcc8", "#742f20"];

interface AccessorySet {
  hat: boolean;
  muzzle: boolean;
  tengu: boolean;
  scarf: boolean;
  sword: boolean;
  headband: boolean;
  hairPin: boolean;
  glasses: boolean;
}

function appearanceText(appearance: CharacterAppearance | undefined, personaText: string): string {
  return `${personaText} ${appearance?.sourceLook ?? ""} ${appearance?.outfit ?? ""} ${appearance?.hair ?? ""} ${(appearance?.visualTags ?? []).join(" ")}`.toLowerCase();
}

function accessoriesFor(text: string): AccessorySet {
  return {
    hat: /fedora|top hat|\bhat\b|cap\b/.test(text),
    muzzle: /muzzle|bamboo/.test(text),
    tengu: /tengu/.test(text),
    scarf: /scarf|muffler/.test(text),
    sword: /sword|katana|blade|nichirin|slayer|samurai/.test(text),
    headband: /headband|forehead protector|shinobi|ninja/.test(text),
    hairPin: /butterfly|hairpin|kanzashi|ornament/.test(text),
    glasses: /glasses|spectacles|monocle/.test(text),
  };
}

function outfitCutFor(text: string, seedId: string, female: boolean): { shortSleeves: boolean; shorts: boolean } {
  const hash = stableHash(`${seedId}:cut`);
  const longSleeved = /kimono|haori|robe|suit|uniform|cloak|coat|jacket/.test(text);
  const shortSleeves = /sleeveless|tank|bare arms|short sleeve/.test(text) || (!longSleeved && hash % 3 === 0);
  const shorts = !female && (/shorts/.test(text) || hash % 5 === 0);
  return { shortSleeves, shorts };
}

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
  { visual, appearance, seedId, personaText = "", protagonist = false },
  ref
) {
  const gltf = useGLTF(MODEL_URL);
  const speedRef = useRef(0);
  const defeatedRef = useRef(false);

  // primitive deps: the visual object's identity churns with every sim tick
  const { color, accentColor, skinColor, bodyShape } = visual;
  const lookText = appearanceText(appearance, personaText);

  const { scene, mixer, actions, normalizeScale, headBone, chestBone, hipsBone } = useMemo(() => {
    const cloned = cloneSkeleton(gltf.scene);
    const box = new THREE.Box3().setFromObject(cloned);
    const height = Math.max(0.01, box.max.y - box.min.y);
    const normalize = TARGET_HEIGHT / height;

    // clothing zones painted as vertex colors over the shared mannequin
    const outfit = outfitColorsFor({ color, accentColor, skinColor, bodyShape }, seedId);
    const cut = outfitCutFor(lookText, seedId, isFemalePresenting(appearance, personaText));
    const bodyMaterial = new THREE.MeshToonMaterial({
      color: new THREE.Color("#ffffff"),
      vertexColors: true,
      gradientMap: toonGradientMap(),
    });
    cloned.traverse((object: THREE.Object3D) => {
      const mesh = object as THREE.SkinnedMesh;
      if (mesh.isSkinnedMesh || (mesh as unknown as THREE.Mesh).isMesh) {
        mesh.geometry = mesh.geometry.clone();
        paintOutfit(mesh.geometry, outfit, cut);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lookText/appearance identities churn per tick; the strings below capture what matters
  }, [gltf, color, accentColor, skinColor, bodyShape, seedId, lookText]);

  // Identity decor (hair/eyes/cape) lives OUTSIDE the skeleton in clean model
  // space and follows its bone every frame — bone-local scale/axis conventions
  // (Unreal-style skeletons) make direct bone parenting unreliable.
  const headDecor = useRef<THREE.Group>(null);
  const chestDecor = useRef<THREE.Group>(null);
  const hipsDecor = useRef<THREE.Group>(null);
  const bindCorrection = useRef<{ head: THREE.Quaternion; chest: THREE.Quaternion; hips: THREE.Quaternion } | null>(null);

  const female = useMemo(() => isFemalePresenting(appearance, personaText), [appearance, personaText]);

  const decor = useMemo(() => {
    const accessories = accessoriesFor(lookText);
    const hairStyle = visual.bodyShape === "mechanical" ? "bald" : accessories.hat ? "flat" : hairStyleFor(appearance, seedId, female);
    const head = new THREE.Group();
    buildHeadDecor(head, hairStyle, hairColorFor(appearance, seedId), visual, accessories, faceVariantFor(seedId, personaText));

    // Role silhouette — one per character, first match
    const role = roleSilhouetteFor(lookText);
    const roleDecor = buildRoleSilhouetteMeshes(role, visual.accentColor);

    // Chest group: cape / scarf / role chest piece
    let chest: THREE.Group | null = null;
    const needsChest = visual.bodyShape === "caped" || accessories.scarf || roleDecor.chest !== null;
    if (needsChest) {
      chest = new THREE.Group();
      if (visual.bodyShape === "caped") {
        const cape = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.03), toonMaterial(visual.accentColor));
        cape.position.set(0, -0.3, -0.16);
        cape.rotation.x = 0.18;
        cape.castShadow = true;
        chest.add(cape);
      }
      if (accessories.scarf) {
        const scarf = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.16, 10, 1, true), toonMaterial("#a02828"));
        scarf.position.set(0, 0.16, 0);
        chest.add(scarf);
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.3, 0.03), toonMaterial("#a02828"));
        tail.position.set(0.08, -0.02, -0.14);
        tail.rotation.x = 0.2;
        chest.add(tail);
      }
      if (roleDecor.chest) {
        chest.add(...roleDecor.chest.children.map((c) => c.clone()));
      }
    }

    // Hips group: skirt / sword / role hips piece
    let hips: THREE.Group | null = null;
    const needsHips = female || accessories.sword || roleDecor.hips !== null;
    if (needsHips) {
      hips = new THREE.Group();
      if (female) {
        const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.34, 0.42, 12, 1, true), toonMaterial(visual.accentColor));
        skirt.position.set(0, -0.28, 0);
        skirt.castShadow = true;
        hips.add(skirt);
      }
      if (accessories.sword) {
        // sheathed katana on the left hip
        const scabbard = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.86, 6), toonMaterial("#1c1f2a"));
        scabbard.position.set(-0.2, -0.05, -0.05);
        scabbard.rotation.z = 1.18;
        scabbard.rotation.x = 0.22;
        scabbard.castShadow = true;
        hips.add(scabbard);
        const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.2, 6), toonMaterial(visual.accentColor));
        hilt.position.set(-0.55, 0.1, -0.13);
        hilt.rotation.z = 1.18;
        hilt.rotation.x = 0.22;
        hips.add(hilt);
      }
      if (roleDecor.hips) {
        hips.add(...roleDecor.hips.children.map((c) => c.clone()));
      }
    }
    return { head, chest, hips };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- appearance identity churns per tick; lookText captures it
  }, [lookText, seedId, personaText, visual.bodyShape, visual.color, visual.accentColor, female]);

  // per-clone GPU resources (painted geometry + body material) must be freed
  // or long sessions with world switches leak VRAM
  useEffect(() => {
    return () => {
      scene.traverse((object: THREE.Object3D) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh || (mesh as unknown as THREE.SkinnedMesh).isSkinnedMesh) {
          mesh.geometry?.dispose();
          if (mesh.material && !Array.isArray(mesh.material)) mesh.material.dispose();
        }
      });
    };
  }, [scene]);

  // Decor groups (head/chest/hips) are rebuilt independently from the skeleton
  // and their geometries leak if not freed on decor change or unmount.
  // Geometries are always per-instance (new THREE.XxxGeometry per builder call).
  // Materials come from toonMaterial()/faceTextureCache caches — never dispose them.
  useEffect(() => {
    const disposeDecorGeometry = (group: THREE.Object3D) => {
      group.traverse((object: THREE.Object3D) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh) mesh.geometry?.dispose();
      });
    };
    return () => {
      disposeDecorGeometry(decor.head);
      if (decor.chest) disposeDecorGeometry(decor.chest);
      if (decor.hips) disposeDecorGeometry(decor.hips);
    };
  }, [decor]);

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

  // prime the idle pose immediately on every (re)mount of the mixer — the
  // appearance memo upstream can rebuild scene+mixer+actions mid-session,
  // which strands the previously-scheduled action on the dead mixer. without
  // an unconditional re-play here, a stationary actor (the player at spawn)
  // would render the bind pose forever
  useEffect(() => {
    const idle = actions.get("Idle_Loop");
    if (!idle) return;
    idle.play();
    currentLocomotion.current = "Idle_Loop";
    mixer.update(0);
  }, [actions, mixer]);

  const flashUntil = useRef(0);
  const telegraphUntil = useRef(0);

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
    setTelegraph: (active: boolean) => {
      telegraphUntil.current = active ? performance.now() + 600 : 0;
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

    // damage flash (red) and telegraph pulse (orange) on the body material
    const material = (scene.getObjectByProperty("isSkinnedMesh", true) as THREE.SkinnedMesh | undefined)?.material as
      | THREE.MeshToonMaterial
      | undefined;
    if (material) {
      const now = performance.now();
      const flashing = now < flashUntil.current;
      const telegraphing = !flashing && now < telegraphUntil.current;
      if (flashing) {
        material.emissive.set("#ff4030");
        material.emissiveIntensity = 0.85;
      } else if (telegraphing) {
        // oscillate intensity to give a pulsing "winding up" look
        const pulse = 0.28 + Math.sin(now * 0.018) * 0.18;
        material.emissive.set("#ff8830");
        material.emissiveIntensity = pulse;
      } else {
        if (material.emissiveIntensity !== 0) material.emissiveIntensity = 0;
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

  // Uniform height: every NPC stands at the same root scale. bodyShape and
  // gender skew width on the skeleton instead so silhouettes still differ.
  const variation = buildVariation(seedId, personaText);
  const bodyShapeWidthScale = visual.bodyShape === "broad" ? 1.12 : visual.bodyShape === "slim" ? 0.92 : 1;
  const bodyScale = 1;
  // skeleton-level width scale: apply bodyShape + seeded variation; kept within ±12% of bodyScale
  const skeletonWidthScale = bodyShapeWidthScale * variation.widthScale;

  return (
    // Root group: uniform bodyScale — decor bone-follow inherits this and stays round
    <group ref={rootRef} scale={bodyScale}>
      {/* Non-uniform width only on the skeleton primitive so decor groups stay unsquished */}
      <primitive object={scene} scale={[normalizeScale * skeletonWidthScale, normalizeScale, normalizeScale * skeletonWidthScale]} />
      <primitive ref={headDecor} object={decor.head} />
      {decor.chest ? <primitive ref={chestDecor} object={decor.chest} /> : null}
      {decor.hips ? <primitive ref={hipsDecor} object={decor.hips} /> : null}
      {protagonist ? <Outlines thickness={0.055} color="#c8382a" screenspace={false} /> : null}
    </group>
  );
});

function buildHeadDecor(
  outer: THREE.Group,
  style: HairStyleV2,
  hairColor: string,
  visual: ActorVisual,
  accessories: AccessorySet,
  faceVariant: FaceVariant,
): void {
  const radius = 0.14;
  const hair = toonMaterial(hairColor);
  // head bone sits at the neck; head center is a bit above it
  const group = new THREE.Group();
  group.position.set(0, 0.12, 0);
  outer.add(group);

  // Canvas face plane — replaces inline eyes/brows/mouth geometry
  const faceMesh = buildFaceMesh(faceVariant);
  faceMesh.position.set(0, -0.02, radius * 0.97);
  group.add(faceMesh);

  // headwear & face gear from the character's look
  if (accessories.hat) {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.55, radius * 1.55, 0.018, 16), toonMaterial("#e8e4dc"));
    brim.position.set(0, radius * 0.62, 0);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.92, radius * 1.0, radius * 0.95, 14), toonMaterial("#e8e4dc"));
    crown.position.set(0, radius * 1.05, 0);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.02, radius * 1.02, 0.03, 14), toonMaterial(visual.accentColor));
    band.position.set(0, radius * 0.72, 0);
    group.add(brim, crown, band);
  }
  if (accessories.tengu) {
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 8), toonMaterial("#a03828"));
    nose.position.set(0, -0.02, radius * 1.25);
    nose.rotation.x = Math.PI / 2;
    group.add(nose);
  } else if (accessories.muzzle) {
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.13, 8), toonMaterial("#8a6a3c"));
    muzzle.position.set(0, -0.075, radius * 0.95);
    muzzle.rotation.z = Math.PI / 2;
    group.add(muzzle);
  }
  if (accessories.headband) {
    const bandeau = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.06, radius * 1.06, 0.035, 14, 1, true), toonMaterial(visual.accentColor));
    bandeau.position.set(0, 0.06, 0);
    group.add(bandeau);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.012), toonMaterial("#b8bcc8"));
    plate.position.set(0, 0.06, radius * 1.02);
    group.add(plate);
  }
  if (accessories.hairPin) {
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), toonMaterial(visual.accentColor, visual.accentColor));
    pin.position.set(radius * 0.7, radius * 0.6, radius * 0.25);
    group.add(pin);
  }
  if (accessories.glasses) {
    for (const side of [-1, 1]) {
      const lens = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.006, 6, 12), toonMaterial("#2b3442"));
      lens.position.set(side * radius * 0.4, -0.012, radius * 0.98);
      group.add(lens);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.008, 0.008), toonMaterial("#2b3442"));
    bridge.position.set(0, -0.012, radius * 0.98);
    group.add(bridge);
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
  } else if (style === "long" || style === "mohawk" || style === "sidecut" || style === "curly") {
    // Delegate to identity.ts builders for the four new styles
    buildHairV2Extra(group, style, hair, radius);
  }
  // fringe suppressed for spiky and the new directional styles
  const noFringe: HairStyleV2[] = ["spiky", "mohawk", "sidecut", "long"];
  if (!noFringe.includes(style)) {
    const fringe = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.58, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hair);
    fringe.position.set(0, radius * 0.55, radius * 0.6);
    fringe.rotation.x = 0.5;
    group.add(fringe);
  }
}

useGLTF.preload(MODEL_URL);
