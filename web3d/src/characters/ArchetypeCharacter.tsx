// Superseded by VrmCharacter; kept for reference / rollback.
/**
 * Drop-in sibling of RiggedCharacter for the Quaternius modular character
 * archetypes. These GLBs ship their OWN skeleton + 24 baked animations and
 * are not UAL-rig-compatible, so we play their embedded clips directly.
 *
 * The exposed handle mirrors `CharacterAnimationHandle` exactly so callers
 * (Npc.tsx) can swap in this component without changing how they drive it.
 *
 * Why no procedural decor here: the GLB IS the silhouette. Stapling on the
 * UAL-side hair/cape/skirt meshes either clipped through the new bodies or
 * needed a per-archetype bone remap (Hips/Chest vs. pelvis/spine_03). For v1
 * each archetype's distinctive look does the silhouette work.
 */
import { Outlines, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

import { scaledDelta } from "../controls/runtime.ts";
import { toonGradientMap } from "../scene/toon.ts";
import { ARCHETYPE_CLIPS, type ArchetypeKey,ARCHETYPES } from "./archetypes.ts";
import type { CharacterAnimationHandle, CombatAnimKind } from "./CharacterModel.tsx";

const TARGET_HEIGHT = 1.7;

interface LocomotionEntry {
  clip: string;
  minSpeed: number;
  baseSpeed?: number;
}

// Archetype rig only has Idle / Walk / Run — collapse the UAL's Jog+Sprint
// tier into Run with a faster time-scale.
const LOCOMOTION: LocomotionEntry[] = [
  { clip: ARCHETYPE_CLIPS.idle, minSpeed: 0 },
  { clip: ARCHETYPE_CLIPS.walk, minSpeed: 0.05, baseSpeed: 1.4 },
  { clip: ARCHETYPE_CLIPS.run, minSpeed: 2.4, baseSpeed: 3.4 },
];

// Map our combat verbs onto the Quaternius set. No spell anim exists, so
// `telegraph` reuses the sword stance as a wind-up; `attack3` uses sword.
const COMBAT_CLIPS: Record<CombatAnimKind, string> = {
  attack1: ARCHETYPE_CLIPS.punchLeft,
  attack2: ARCHETYPE_CLIPS.punchRight,
  attack3: ARCHETYPE_CLIPS.swordSlash,
  dodge: ARCHETYPE_CLIPS.roll,
  hit: ARCHETYPE_CLIPS.hit,
  telegraph: ARCHETYPE_CLIPS.idleSword,
};

const GESTURE_CLIPS: Record<"pickup" | "interact", string> = {
  pickup: ARCHETYPE_CLIPS.interact,
  interact: ARCHETYPE_CLIPS.interact,
};

interface ArchetypeCharacterProps {
  archetype: ArchetypeKey;
  protagonist?: boolean;
}

export const ArchetypeCharacter = forwardRef<CharacterAnimationHandle, ArchetypeCharacterProps>(
  function ArchetypeCharacter({ archetype, protagonist = false }, ref) {
    const url = ARCHETYPES[archetype];
    const gltf = useGLTF(url);
    const speedRef = useRef(0);
    const defeatedRef = useRef(false);
    const flashUntil = useRef(0);
    const telegraphUntil = useRef(0);
    const overlayUntil = useRef(0);

    const { scene, mixer, actions, normalizeScale, toonMaterials } = useMemo(() => {
      const cloned = cloneSkeleton(gltf.scene);

      // Toon material swap — mirrors web3d/src/scene/kenneyGlb.tsx::useToonGlb
      // but works on SkinnedMesh as well as plain Mesh. Crucially we do NOT
      // reuse a per-url bounds cache: each clone has its own skeleton + per-
      // instance vertex paint, so bounds must be computed from THIS clone.
      const gradient = toonGradientMap();
      const swappedMaterials: THREE.MeshToonMaterial[] = [];
      cloned.traverse((object: THREE.Object3D) => {
        const mesh = object as THREE.Mesh;
        const isMesh =
          (mesh as unknown as { isMesh?: boolean }).isMesh ||
          (mesh as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh;
        if (!isMesh) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // long sessions move characters in and out of view: skeletal frustum
        // culling sometimes drops a mesh whose root has not yet been updated
        mesh.frustumCulled = false;
        const original = mesh.material as THREE.Material | THREE.Material[];
        const materials = Array.isArray(original) ? original : [original];
        const swapped = materials.map((mat) => {
          const src = mat as THREE.MeshStandardMaterial & {
            color?: THREE.Color;
            map?: THREE.Texture | null;
          };
          const color = src.color ? src.color.clone() : new THREE.Color("#ffffff");
          const toon = new THREE.MeshToonMaterial({
            color,
            map: src.map ?? null,
            gradientMap: gradient,
          });
          swappedMaterials.push(toon);
          return toon;
        });
        mesh.material = Array.isArray(original) ? swapped : swapped[0]!;
      });

      // Skinned meshes need world matrices resolved before Box3 returns valid
      // bounds. Without this, the bbox can be empty/Infinity → normalize=NaN
      // → scale=NaN → the model renders at zero size (invisible).
      cloned.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(cloned);
      const rawHeight = box.max.y - box.min.y;
      const height = Number.isFinite(rawHeight) && rawHeight > 0.01 ? rawHeight : TARGET_HEIGHT;
      const normalize = TARGET_HEIGHT / height;

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
        toonMaterials: swappedMaterials,
      };
    }, [gltf]);

    // dispose per-clone GPU resources to prevent VRAM leaks across world swaps
    useEffect(() => {
      return () => {
        scene.traverse((object: THREE.Object3D) => {
          const mesh = object as THREE.Mesh;
          if (
            (mesh as unknown as { isMesh?: boolean }).isMesh ||
            (mesh as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh
          ) {
            // geometry is shared with the source gltf — do not dispose
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const mat of mats) (mat as THREE.Material | null)?.dispose?.();
          }
        });
      };
    }, [scene]);

    const currentLocomotion = useRef<string>("");

    useEffect(() => {
      const idle = actions.get(ARCHETYPE_CLIPS.idle);
      if (!idle) return;
      idle.play();
      currentLocomotion.current = ARCHETYPE_CLIPS.idle;
      mixer.update(0);
    }, [actions, mixer]);

    const playOverlay = (clipName: string, fadeIn: number) => {
      const action = actions.get(clipName);
      if (!action) return;
      action.reset();
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.fadeIn(fadeIn).play();
      const dur = action.getClip().duration;
      overlayUntil.current = performance.now() + dur * 1000;
      window.setTimeout(() => action.fadeOut(0.12), Math.max(0, dur * 1000 - 120));
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
      setTalking: () => {
        // archetype rig has no separate talking idle; skip cleanly
      },
      gesture: (kind: "pickup" | "interact") => {
        playOverlay(GESTURE_CLIPS[kind], 0.12);
      },
      trigger: (kind: CombatAnimKind) => {
        playOverlay(COMBAT_CLIPS[kind], 0.06);
      },
      setDefeated: (defeated: boolean) => {
        if (defeated === defeatedRef.current) return;
        defeatedRef.current = defeated;
        if (defeated) {
          for (const action of actions.values()) action.stop();
          const death = actions.get(ARCHETYPE_CLIPS.death);
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

    useFrame((_, rawDelta) => {
      const delta = scaledDelta(rawDelta);
      mixer.update(delta);

      // damage flash / telegraph pulse applied across every swapped material
      const now = performance.now();
      const flashing = now < flashUntil.current;
      const telegraphing = !flashing && now < telegraphUntil.current;
      for (const mat of toonMaterials) {
        if (flashing) {
          mat.emissive.set("#ff4030");
          mat.emissiveIntensity = 0.85;
        } else if (telegraphing) {
          const pulse = 0.28 + Math.sin(now * 0.018) * 0.18;
          mat.emissive.set("#ff8830");
          mat.emissiveIntensity = pulse;
        } else if (mat.emissiveIntensity !== 0) {
          mat.emissiveIntensity = 0;
        }
      }

      if (defeatedRef.current) return;
      if (performance.now() < overlayUntil.current) return;

      const speed = speedRef.current;
      let next: LocomotionEntry = LOCOMOTION[0]!;
      for (const entry of LOCOMOTION) if (speed >= entry.minSpeed) next = entry;
      const action = actions.get(next.clip);
      if (!action) return;
      if (currentLocomotion.current !== next.clip) {
        const previous = actions.get(currentLocomotion.current);
        previous?.fadeOut(0.18);
        action.reset().fadeIn(0.18).play();
        currentLocomotion.current = next.clip;
      }
      if (next.baseSpeed) {
        // Track actual move speed so the feet don't skate. The old 1.6 cap left
        // fast running sliding (body ~7.8 m/s vs clip ~5.4 m/s); widen the range.
        action.timeScale = THREE.MathUtils.clamp(speed / next.baseSpeed, 0.55, 2.4);
      }
    });

    return (
      <group>
        <primitive object={scene} scale={normalizeScale} />
        {protagonist ? <Outlines thickness={0.055} color="#c8382a" screenspace={false} /> : null}
      </group>
    );
  }
);

// Pre-warm every archetype's GLB at module load so the first NPC swap doesn't
// stutter during a streamed-in render. The drei cache keys on URL so this is
// a one-time fetch per session.
for (const url of Object.values(ARCHETYPES)) {
  useGLTF.preload(url);
}
