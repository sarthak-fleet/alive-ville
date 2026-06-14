/**
 * VRM-based anime character (drop-in sibling of `ArchetypeCharacter.tsx`).
 *
 * VRMs are the de-facto standard for anime-style 3D avatars (VRoid Studio
 * exports this format) and ship with:
 *   - HUMANOID bone standard (`hips`, `leftUpperArm`, ...) so the same
 *     procedural locomotion drives every model regardless of skeleton names.
 *   - MToon materials — already the toon look we want. We do NOT swap to
 *     MeshToonMaterial here (unlike Kenney/Quaternius GLBs); MToon's outline
 *     + shading ramp is the correct visual.
 *   - Spring-bone physics for hair/skirt (kicks in when we call
 *     `vrm.update(delta)` every frame — this is what makes them "feel alive").
 *   - Blendshape expressions including `aa`/`ih`/`ou`/`ee`/`oh` for lipsync.
 *
 * Animation strategy: rather than ship .vrma animation files (extra bytes
 * + extra loader complexity), we drive the humanoid bones procedurally —
 * hip bob, arm + leg swing keyed off `setSpeed`. Combat triggers tween a
 * short pose. This is intentionally simple; it's still leagues ahead of a
 * T-pose because the bone retarget gives you proper anime body language.
 *
 * Exposes the same `CharacterAnimationHandle` interface as the rig and
 * archetype paths so `Npc.tsx` can swap implementations without changes.
 */
// `VRMHumanBoneName` and `VRMUtils` are re-exported by `@pixiv/three-vrm` but
// the package's shipped `.d.ts` files have broken re-export chains under
// NodeNext (VRMUtils has no `.d.ts`; VRMHumanBoneName lives in a nested
// @pixiv/three-vrm-core package that NodeNext can't traverse). They DO
// exist at runtime — grab them via a namespace import + cast.
import * as threeVrm from "@pixiv/three-vrm";
import {
  MToonMaterial,
  type VRM,
  VRMLoaderPlugin,
} from "@pixiv/three-vrm";
import { Outlines } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { scaledDelta } from "../controls/runtime.ts";
import type { CharacterAnimationHandle, CombatAnimKind } from "./CharacterModel.tsx";
import { type VrmKey,VRMS } from "./vrm.ts";

interface VRMUtilsLike {
  removeUnnecessaryJoints: (scene: THREE.Object3D) => void;
}
const VRMUtils: VRMUtilsLike = (threeVrm as unknown as { VRMUtils: VRMUtilsLike })
  .VRMUtils;
const VRMHumanBoneName: Record<string, string> = (
  threeVrm as unknown as { VRMHumanBoneName: Record<string, string> }
).VRMHumanBoneName;

const TARGET_HEIGHT = 1.7;

interface VrmCharacterProps {
  vrmKey: VrmKey;
  protagonist?: boolean;
  /** called once if the VRM fails to load/parse — caller falls back to the procedural rig */
  onError?: () => void;
}

/**
 * Parse a fresh VRM per call. We deliberately do NOT use drei's `useGLTF` here:
 * it caches the *parsed* gltf by url and hands every caller the SAME scene
 * object — but a Three.js object can only have one parent, so multiple NPCs that
 * map to the same VRM key would fight over one instance and all-but-one would
 * render invisible. The raw .vrm bytes are still HTTP-cached by the browser, so
 * only the (cheap) parse repeats per instance.
 */
function loadVrm(url: string): Promise<VRM> {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader.load(
      url,
      (gltf) => {
        const vrm = (gltf.userData as { vrm?: VRM } | undefined)?.vrm;
        if (vrm) resolve(vrm);
        else reject(new Error(`VRM not attached to gltf for ${url}`));
      },
      undefined,
      reject
    );
  });
}

/** Free geometry + materials for a per-instance VRM on unmount (avoids VRAM leaks across world swaps). */
function disposeVrm(vrm: VRM): void {
  vrm.scene.traverse((object: THREE.Object3D) => {
    const mesh = object as THREE.Mesh;
    if (!(mesh as { isMesh?: boolean }).isMesh) return;
    mesh.geometry?.dispose?.();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) (mat as THREE.Material | null)?.dispose?.();
  });
}

interface VrmSetup {
  vrm: VRM;
  root: THREE.Group;
  bones: BoneMap;
  mtoonMaterials: MToonMaterial[];
  normalizeScale: number;
  isVrm0: boolean;
}

/** One-time rig/material/scale prep on a freshly-parsed VRM instance. */
function setupVrm(vrmInstance: VRM): VrmSetup {
  // Defensive: disable frustum culling on every skinned mesh — long sessions
  // sometimes drop a mesh whose root world matrix hasn't updated yet.
  vrmInstance.scene.traverse((object: THREE.Object3D) => {
    const m = object as THREE.Mesh & { isMesh?: boolean; isSkinnedMesh?: boolean };
    if (m.isMesh || m.isSkinnedMesh) {
      m.frustumCulled = false;
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });

  // Strip joints not referenced by any skinned mesh (pixiv-recommended).
  VRMUtils.removeUnnecessaryJoints(vrmInstance.scene);

  // VRM 0.x faces -Z; VRM 1.0 faces +Z. Detect via meta.metaVersion.
  const metaVersion = (vrmInstance.meta as { metaVersion?: string } | undefined)?.metaVersion;
  const vrm0 = !metaVersion || metaVersion.startsWith("0");

  // Normalize to ~1.7m height.
  vrmInstance.scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(vrmInstance.scene);
  const rawHeight = box.max.y - box.min.y;
  const normalize = Number.isFinite(rawHeight) && rawHeight > 0.01 ? TARGET_HEIGHT / rawHeight : 1;

  // Bone refs for procedural locomotion + combat poses.
  const humanoid = vrmInstance.humanoid as unknown as {
    getNormalizedBoneNode: (name: string) => THREE.Object3D | null;
  } | undefined;
  const get = (name: string): THREE.Object3D | null => humanoid?.getNormalizedBoneNode(name) ?? null;
  const bn = VRMHumanBoneName;
  const bones: BoneMap = {
    hips: get(bn["Hips"]!),
    spine: get(bn["Spine"]!),
    chest: get(bn["Chest"]!) ?? get(bn["UpperChest"]!),
    head: get(bn["Head"]!),
    leftUpperArm: get(bn["LeftUpperArm"]!),
    rightUpperArm: get(bn["RightUpperArm"]!),
    leftLowerArm: get(bn["LeftLowerArm"]!),
    rightLowerArm: get(bn["RightLowerArm"]!),
    leftUpperLeg: get(bn["LeftUpperLeg"]!),
    rightUpperLeg: get(bn["RightUpperLeg"]!),
    leftLowerLeg: get(bn["LeftLowerLeg"]!),
    rightLowerLeg: get(bn["RightLowerLeg"]!),
  };

  // Collect MToon materials for emissive flash / telegraph pulses.
  const mtoonMaterials: MToonMaterial[] = [];
  vrmInstance.scene.traverse((object: THREE.Object3D) => {
    const mesh = object as THREE.Mesh;
    if (!(mesh as { isMesh?: boolean }).isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (mat instanceof MToonMaterial) mtoonMaterials.push(mat);
    }
  });

  return { vrm: vrmInstance, root: vrmInstance.scene, bones, mtoonMaterials, normalizeScale: normalize, isVrm0: vrm0 };
}

interface CombatPose {
  // duration ms
  duration: number;
  // (t in 0..1) → bone rotation overrides keyed by bone name. Apply on top of
  // the locomotion idle pose. Return null entries skip that bone.
  apply: (t: number, bones: BoneMap) => void;
}

type BoneMap = {
  hips: THREE.Object3D | null;
  spine: THREE.Object3D | null;
  chest: THREE.Object3D | null;
  head: THREE.Object3D | null;
  leftUpperArm: THREE.Object3D | null;
  rightUpperArm: THREE.Object3D | null;
  leftLowerArm: THREE.Object3D | null;
  rightLowerArm: THREE.Object3D | null;
  leftUpperLeg: THREE.Object3D | null;
  rightUpperLeg: THREE.Object3D | null;
  leftLowerLeg: THREE.Object3D | null;
  rightLowerLeg: THREE.Object3D | null;
};

const COMBAT_POSES: Record<CombatAnimKind, CombatPose> = {
  attack1: {
    duration: 320,
    apply: (t, b) => {
      const punch = Math.sin(Math.min(1, t * 1.6) * Math.PI);
      if (b.rightUpperArm) b.rightUpperArm.rotation.x = -punch * 1.6;
      if (b.rightLowerArm) b.rightLowerArm.rotation.x = -punch * 0.6;
      if (b.spine) b.spine.rotation.y = -punch * 0.25;
    },
  },
  attack2: {
    duration: 320,
    apply: (t, b) => {
      const punch = Math.sin(Math.min(1, t * 1.6) * Math.PI);
      if (b.leftUpperArm) b.leftUpperArm.rotation.x = -punch * 1.6;
      if (b.leftLowerArm) b.leftLowerArm.rotation.x = -punch * 0.6;
      if (b.spine) b.spine.rotation.y = punch * 0.25;
    },
  },
  attack3: {
    duration: 460,
    apply: (t, b) => {
      // overhead two-handed slam
      const swing = Math.sin(Math.min(1, t * 1.4) * Math.PI);
      const lift = Math.min(1, t * 2.5);
      const drop = Math.max(0, t * 2 - 1); // back down after t=0.5
      const rot = -lift * 2.4 + drop * 3.0;
      if (b.rightUpperArm) b.rightUpperArm.rotation.x = rot;
      if (b.leftUpperArm) b.leftUpperArm.rotation.x = rot;
      if (b.spine) b.spine.rotation.x = swing * 0.2;
    },
  },
  dodge: {
    duration: 450,
    apply: (t, b) => {
      const roll = Math.sin(t * Math.PI);
      if (b.spine) b.spine.rotation.x = roll * 0.9;
      if (b.hips) b.hips.position.y = -roll * 0.15;
    },
  },
  hit: {
    duration: 280,
    apply: (t, b) => {
      const flinch = Math.sin(t * Math.PI);
      if (b.spine) b.spine.rotation.x = -flinch * 0.35;
      if (b.head) b.head.rotation.x = -flinch * 0.2;
    },
  },
  telegraph: {
    duration: 600,
    apply: (t, b) => {
      // ramp wind-up — right arm pulls back, never releases (release is on
      // the attack1 trigger that follows).
      const wind = Math.min(1, t * 2);
      if (b.rightUpperArm) b.rightUpperArm.rotation.x = wind * 1.2;
      if (b.spine) b.spine.rotation.y = wind * 0.18;
    },
  },
};

export const VrmCharacter = forwardRef<CharacterAnimationHandle, VrmCharacterProps>(
  function VrmCharacter({ vrmKey, protagonist = false, onError }, ref) {
    const url = VRMS[vrmKey];
    const speedRef = useRef(0);
    const defeatedRef = useRef(false);
    const flashUntil = useRef(0);
    const telegraphUntil = useRef(0);
    const talkingRef = useRef(false);
    const phaseRef = useRef(Math.random() * Math.PI * 2);
    const combatAnim = useRef<{ kind: CombatAnimKind; startedAt: number } | null>(null);

    // Per-instance load: each NPC parses its own VRM (see loadVrm). null until
    // ready; on failure we call onError so Npc.tsx swaps in the procedural rig.
    const [setup, setSetup] = useState<VrmSetup | null>(null);
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;
    useEffect(() => {
      let cancelled = false;
      let created: VRM | null = null;
      void (async () => {
        try {
          const vrm = await loadVrm(url);
          if (cancelled) {
            disposeVrm(vrm);
            return;
          }
          created = vrm;
          setSetup(setupVrm(vrm));
        } catch {
          if (!cancelled) onErrorRef.current?.();
        }
      })();
      return () => {
        cancelled = true;
        setSetup(null);
        if (created) disposeVrm(created);
      };
    }, [url]);

    const vrm = setup?.vrm ?? null;
    const bones = setup?.bones ?? null;
    const mtoonMaterials = useMemo(() => setup?.mtoonMaterials ?? [], [setup]);

    // Cache original emissive values so we can restore between pulses.
    const originalEmissive = useMemo(() => {
      return mtoonMaterials.map((mat) => ({
        color: mat.emissive ? mat.emissive.clone() : new THREE.Color(0, 0, 0),
        intensity: mat.emissiveIntensity ?? 0,
      }));
    }, [mtoonMaterials]);

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
      gesture: () => {
        // VRMs have no canned interact gesture; ignore (the talking lipsync
        // and idle bob already animate the body during dialogue).
      },
      trigger: (kind: CombatAnimKind) => {
        combatAnim.current = { kind, startedAt: performance.now() };
      },
      setDefeated: (defeated: boolean) => {
        defeatedRef.current = defeated;
      },
    }));

    useFrame((_, rawDelta) => {
      if (!vrm || !bones) return; // still loading this instance
      const delta = scaledDelta(rawDelta);

      // CRITICAL: vrm.update is what drives spring-bone physics (hair, skirt,
      // accessories), look-at, and expression manager updates. Skipping this
      // leaves the model frozen and lifeless.
      try {
        vrm.update(delta);
      } catch {
        // swallow — some VRMs without springBoneManager throw on update if the
        // mesh is mid-disposal; we don't want a crash wall in console.
      }

      const now = performance.now();
      const speed = speedRef.current;
      const walking = speed > 0.05;
      const running = speed > 2.4;

      // ── locomotion: procedural idle bob + walk swing ──────────────────────
      if (!defeatedRef.current) {
        const cadence = walking ? Math.max(2.5, Math.min(6.5, 1.5 + speed * 1.1)) : 1.5;
        phaseRef.current += delta * cadence;
        const phase = phaseRef.current;
        const sinP = Math.sin(phase);

        // hip bob (Y oscillation). Idle = subtle 1.5cm, walk = 3cm, run = 5cm.
        if (bones.hips) {
          const bob = walking ? (running ? 0.05 : 0.03) : 0.015;
          bones.hips.position.y = Math.abs(sinP) * bob;
        }

        // arm swing. Idle = tiny breathing motion, walk = ±0.4 rad, run grows.
        const armSwing = walking ? (running ? 0.6 : 0.4) : 0.05;
        if (bones.leftUpperArm) bones.leftUpperArm.rotation.x = sinP * armSwing;
        if (bones.rightUpperArm) bones.rightUpperArm.rotation.x = -sinP * armSwing;

        // leg swing. Idle = 0 (just plant), walk = ±0.5 rad with knee bend.
        const legSwing = walking ? (running ? 0.7 : 0.5) : 0;
        if (bones.leftUpperLeg) bones.leftUpperLeg.rotation.x = -sinP * legSwing;
        if (bones.rightUpperLeg) bones.rightUpperLeg.rotation.x = sinP * legSwing;
        if (bones.leftLowerLeg) {
          bones.leftLowerLeg.rotation.x = walking ? Math.max(0, sinP) * legSwing * 0.8 : 0;
        }
        if (bones.rightLowerLeg) {
          bones.rightLowerLeg.rotation.x = walking ? Math.max(0, -sinP) * legSwing * 0.8 : 0;
        }

        if (bones.spine) {
          bones.spine.rotation.y = walking ? sinP * 0.05 : 0;
          bones.spine.rotation.x = 0;
        }
      } else {
        // defeated: tween hips toward floor + forward rotation. Don't touch
        // limbs — the pose collapse from gravity is enough for v1.
        if (bones.hips) {
          bones.hips.position.y +=
            (-0.6 - bones.hips.position.y) * Math.min(1, delta * 4);
          bones.hips.rotation.x += (Math.PI * 0.45 - bones.hips.rotation.x) * Math.min(1, delta * 5);
        }
      }

      // ── combat overlay pose ──────────────────────────────────────────────
      const anim = combatAnim.current;
      if (anim) {
        const elapsed = now - anim.startedAt;
        const pose = COMBAT_POSES[anim.kind];
        if (elapsed >= pose.duration) {
          combatAnim.current = null;
        } else {
          pose.apply(elapsed / pose.duration, bones);
        }
      }

      // ── lipsync via 'aa' expression ──────────────────────────────────────
      const expressions = vrm.expressionManager;
      if (expressions) {
        const aaValue = talkingRef.current ? 0.4 + 0.4 * Math.sin(now * 0.018) : 0;
        try {
          expressions.setValue("aa", Math.max(0, aaValue));
        } catch {
          // expression not present on this VRM — skip cleanly.
        }
      }

      // ── flash / telegraph emissive on MToon ──────────────────────────────
      const flashing = now < flashUntil.current;
      const telegraphing = !flashing && now < telegraphUntil.current;
      for (let i = 0; i < mtoonMaterials.length; i += 1) {
        const mat = mtoonMaterials[i]!;
        const orig = originalEmissive[i]!;
        if (flashing) {
          mat.emissive.set("#ff4030");
          mat.emissiveIntensity = 0.85;
        } else if (telegraphing) {
          const pulse = 0.28 + Math.sin(now * 0.018) * 0.18;
          mat.emissive.set("#ff8830");
          mat.emissiveIntensity = pulse;
        } else if (
          mat.emissiveIntensity !== orig.intensity ||
          !mat.emissive.equals(orig.color)
        ) {
          mat.emissive.copy(orig.color);
          mat.emissiveIntensity = orig.intensity;
        }
      }
    });

    // Nothing to show until this instance finishes parsing (brief). Npc.tsx
    // keeps the NPC's label/position; the model just pops in a frame later.
    if (!setup) return null;

    // VRM 0.x face -Z (need PI rotation to align with our +Z forward
    // convention). VRM 1.x already faces +Z.
    const rotateY = setup.isVrm0 ? Math.PI : 0;

    return (
      <group>
        <group rotation={[0, rotateY, 0]}>
          <primitive object={setup.root} scale={setup.normalizeScale} />
        </group>
        {protagonist ? <Outlines thickness={0.055} color="#c8382a" screenspace={false} /> : null}
      </group>
    );
  }
);

// VRMs are parsed per instance (see loadVrm) so multiple NPCs sharing a key each
// get their own scene; the raw bytes are HTTP-cached so only the parse repeats.
// We intentionally do NOT preload every VRM at module load — each is ~10-15
// MB, totalling >60 MB. Suspense + on-demand loading is the right shape.
