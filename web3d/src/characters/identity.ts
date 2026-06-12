/**
 * Procedural identity v2 — faces, builds, role silhouettes, hair.
 *
 * Pure picker functions (faceVariantFor, buildVariation, roleSilhouetteFor,
 * hairStyleV2For) return plain descriptors — no THREE, no canvas — so they
 * are testable in the node vitest environment.
 *
 * Canvas / THREE mesh builders (buildFaceTexture, buildRoleSilhouetteMeshes,
 * buildHairV2Meshes) are called only from RiggedCharacter at runtime.
 */

import * as THREE from "three";

import { stableHash } from "../mapping/visuals.ts";
import { toonMaterial } from "../scene/toon.ts";

// ---------------------------------------------------------------------------
// Axis 1 — Face variants
// ---------------------------------------------------------------------------

export type EyeShape = "round" | "sharp" | "sleepy" | "wide";
export type BrowAngle = "flat" | "raised" | "angry" | "worried";
export type MouthShape = "neutral" | "smile" | "frown" | "grit";

export interface FaceVariant {
  eyes: EyeShape;
  brow: BrowAngle;
  mouth: MouthShape;
}

const EYE_SHAPES: EyeShape[] = ["round", "sharp", "sleepy", "wide"];
const BROW_ANGLES: BrowAngle[] = ["flat", "raised", "angry", "worried"];
const MOUTH_SHAPES: MouthShape[] = ["neutral", "smile", "frown", "grit"];

export function faceVariantFor(seedId: string, personaText: string): FaceVariant {
  const text = personaText.toLowerCase();

  // eyes
  let eyes: EyeShape = EYE_SHAPES[stableHash(`${seedId}:eyes`) % 4]!;
  if (/tired|old|sleepy/.test(text)) eyes = "sleepy";
  else if (/wide.*eye|shock|startl|surprise/.test(text)) eyes = "wide";

  // brow
  let brow: BrowAngle = BROW_ANGLES[stableHash(`${seedId}:brow`) % 4]!;
  if (/angry|stern|fierce|furious|wrath|rage/.test(text)) brow = "angry";
  else if (/cheer|warm|friendly|gentle|kind/.test(text)) brow = "raised";
  else if (/worried|anxious|nervous|scared/.test(text)) brow = "worried";

  // mouth
  let mouth: MouthShape = MOUTH_SHAPES[stableHash(`${seedId}:mouth`) % 4]!;
  if (/angry|stern|fierce|grit|serious|stoic/.test(text)) mouth = "grit";
  else if (/cheer|warm|friendly|happy|bright|smile/.test(text)) mouth = "smile";
  else if (/sad|frown|mournful|gloomy|depress/.test(text)) mouth = "frown";

  return { eyes, brow, mouth };
}

const faceTextureCache = new Map<string, THREE.CanvasTexture>();

/** Build a canvas face texture for the given variant. Cached by variant key. */
export function buildFaceTexture(variant: FaceVariant): THREE.CanvasTexture {
  const key = `${variant.eyes}:${variant.brow}:${variant.mouth}`;
  const cached = faceTextureCache.get(key);
  if (cached) return cached;

  const SIZE = 128;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;

  // transparent background
  ctx.clearRect(0, 0, SIZE, SIZE);

  const cx = SIZE / 2;
  const eyeY = SIZE * 0.42;
  const eyeOffX = SIZE * 0.22;

  ctx.strokeStyle = "#1a1a2e";
  ctx.fillStyle = "#1a1a2e";
  ctx.lineWidth = 3;

  // eyes
  for (const side of [-1, 1]) {
    const ex = cx + side * eyeOffX;
    ctx.beginPath();
    if (variant.eyes === "round") {
      ctx.ellipse(ex, eyeY, 10, 11, 0, 0, Math.PI * 2);
    } else if (variant.eyes === "wide") {
      ctx.ellipse(ex, eyeY, 12, 13, 0, 0, Math.PI * 2);
    } else if (variant.eyes === "sharp") {
      // almond shape
      ctx.moveTo(ex - 11, eyeY);
      ctx.quadraticCurveTo(ex, eyeY - 10, ex + 11, eyeY);
      ctx.quadraticCurveTo(ex, eyeY + 7, ex - 11, eyeY);
    } else {
      // sleepy — flat-bottom half-ellipse
      ctx.ellipse(ex, eyeY, 10, 7, 0, Math.PI, Math.PI * 2);
      ctx.lineTo(ex - 10, eyeY);
    }
    ctx.fill();
    ctx.stroke();

    // iris highlight
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(ex + side * 2, eyeY - 3, 3, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1a2e";
  }

  // brows
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  for (const side of [-1, 1]) {
    const bx = cx + side * eyeOffX;
    const by = eyeY - 17;
    ctx.beginPath();
    if (variant.brow === "flat") {
      ctx.moveTo(bx - 10, by);
      ctx.lineTo(bx + 10, by);
    } else if (variant.brow === "raised") {
      ctx.moveTo(bx - 10, by + 3);
      ctx.quadraticCurveTo(bx, by - 4, bx + 10, by + 3);
    } else if (variant.brow === "angry") {
      // inner corner raises toward center
      const innerX = bx - side * 10;
      const outerX = bx + side * 10;
      ctx.moveTo(innerX, by - 6);
      ctx.lineTo(outerX, by + 2);
    } else {
      // worried — inner corner dips
      const innerX = bx - side * 10;
      const outerX = bx + side * 10;
      ctx.moveTo(innerX, by + 2);
      ctx.lineTo(outerX, by - 6);
    }
    ctx.stroke();
  }

  // mouth
  const mouthY = SIZE * 0.66;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  if (variant.mouth === "neutral") {
    ctx.moveTo(cx - 9, mouthY);
    ctx.lineTo(cx + 9, mouthY);
  } else if (variant.mouth === "smile") {
    ctx.moveTo(cx - 9, mouthY - 3);
    ctx.quadraticCurveTo(cx, mouthY + 8, cx + 9, mouthY - 3);
  } else if (variant.mouth === "frown") {
    ctx.moveTo(cx - 9, mouthY + 3);
    ctx.quadraticCurveTo(cx, mouthY - 8, cx + 9, mouthY + 3);
  } else {
    // grit — straight with short vertical tick marks
    ctx.moveTo(cx - 9, mouthY);
    ctx.lineTo(cx + 9, mouthY);
    ctx.stroke();
    ctx.beginPath();
    for (let i = -2; i <= 2; i++) {
      ctx.moveTo(cx + i * 4, mouthY - 3);
      ctx.lineTo(cx + i * 4, mouthY + 3);
    }
  }
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  faceTextureCache.set(key, texture);
  return texture;
}

/** Build the face plane mesh that goes in the head decor group. */
export function buildFaceMesh(variant: FaceVariant): THREE.Mesh {
  const texture = buildFaceTexture(variant);
  const geo = new THREE.PlaneGeometry(0.19, 0.19);
  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  return mesh;
}

// ---------------------------------------------------------------------------
// Axis 2 — Build (continuous height + width variation)
// ---------------------------------------------------------------------------

export interface BuildVariation {
  /** Multiplier applied to the entire root group scale (all axes) */
  heightScale: number;
  /** Extra multiplier on X/Z only — applied to the skeleton primitive, not the root */
  widthScale: number;
}

export function buildVariation(seedId: string, personaText: string): BuildVariation {
  const text = personaText.toLowerCase();

  // seeded jitter: height ±8%, width ±6%
  const hJitter = 1 + ((stableHash(`${seedId}:height`) % 17) - 8) / 100; // 0.92–1.08
  const wJitter = 1 + ((stableHash(`${seedId}:width`) % 13) - 6) / 100; // 0.94–1.06

  let heightScale = hJitter;
  let widthScale = wJitter;

  // persona overrides (cap final values to avoid wild outliers)
  if (/tower|giant|huge|colossal/.test(text)) {
    heightScale = Math.min(hJitter * 1.12, 1.20);
  } else if (/child|kid|small|tiny|petite/.test(text)) {
    heightScale = Math.max(hJitter * 0.82, 0.72);
    widthScale = Math.max(wJitter * 0.88, 0.80);
  } else if (/lanky|thin|beanpole/.test(text)) {
    heightScale = Math.min(hJitter * 1.04, 1.12);
    widthScale = Math.max(wJitter * 0.92, 0.86);
  }

  return { heightScale, widthScale };
}

// ---------------------------------------------------------------------------
// Axis 3 — Role silhouettes
// ---------------------------------------------------------------------------

export type RoleShape =
  | "smith"
  | "guard"
  | "merchant"
  | "elder"
  | "noble"
  | null;

export function roleSilhouetteFor(text: string): RoleShape {
  const t = text.toLowerCase();
  if (/smith|forge|engineer|blacksmith/.test(t)) return "smith";
  if (/guard|soldier|slayer|warrior|knight/.test(t)) return "guard";
  if (/merchant|trader|shop|vendor/.test(t)) return "merchant";
  if (/elder|sage|mayor|prophet|priest/.test(t)) return "elder";
  if (/noble|gentleman|lady|aristocrat|baron/.test(t)) return "noble";
  return null;
}

/**
 * Build role-silhouette meshes for the given role.
 * Returns { chest, hips } groups (either may be null).
 */
export function buildRoleSilhouetteMeshes(
  role: RoleShape,
  accentColor: string,
): { chest: THREE.Group | null; hips: THREE.Group | null } {
  if (!role) return { chest: null, hips: null };

  if (role === "smith") {
    // leather apron: dark trapezoid panel on chest-front
    const chest = new THREE.Group();
    const apron = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.55, 0.04),
      toonMaterial("#3d2810"),
    );
    apron.position.set(0, -0.22, 0.18);
    chest.add(apron);
    // apron strap across top
    const strap = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.04, 0.03),
      toonMaterial("#5a3c18"),
    );
    strap.position.set(0, 0.06, 0.17);
    chest.add(strap);
    return { chest, hips: null };
  }

  if (role === "guard") {
    // shoulder pads on chest group + belt at hips
    const chest = new THREE.Group();
    for (const side of [-1, 1]) {
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.12, 0.14),
        toonMaterial(accentColor),
      );
      pad.position.set(side * 0.28, 0.1, 0);
      pad.rotation.z = side * 0.18;
      chest.add(pad);
    }

    const hips = new THREE.Group();
    const belt = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.06, 0.18),
      toonMaterial("#2b2010"),
    );
    belt.position.set(0, 0.04, 0);
    const buckle = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.05, 0.06),
      toonMaterial(accentColor),
    );
    buckle.position.set(0, 0.04, 0.09);
    hips.add(belt, buckle);
    return { chest, hips };
  }

  if (role === "merchant") {
    // satchel on hip + thin diagonal strap across chest
    const chest = new THREE.Group();
    const strap = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.55, 0.03),
      toonMaterial("#7a5c34"),
    );
    strap.position.set(0.12, -0.18, 0.16);
    strap.rotation.z = 0.35;
    chest.add(strap);

    const hips = new THREE.Group();
    const bag = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.18, 0.1),
      toonMaterial("#9a7a48"),
    );
    bag.position.set(0.22, -0.14, 0.06);
    const flap = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.06, 0.03),
      toonMaterial("#7a5c34"),
    );
    flap.position.set(0.22, -0.04, 0.1);
    hips.add(bag, flap);
    return { chest, hips };
  }

  if (role === "elder") {
    // long coat: two side panels hanging at hips
    const hips = new THREE.Group();
    for (const side of [-1, 1]) {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.65, 0.04),
        toonMaterial(accentColor),
      );
      panel.position.set(side * 0.19, -0.38, -0.04);
      panel.rotation.y = side * 0.1;
      hips.add(panel);
    }
    return { chest: null, hips };
  }

  if (role === "noble") {
    // high collar: open cylinder at neck on chest group
    const chest = new THREE.Group();
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.16, 0.1, 12, 1, true),
      toonMaterial(accentColor),
    );
    collar.position.set(0, 0.24, 0);
    chest.add(collar);
    return { chest, hips: null };
  }

  return { chest: null, hips: null };
}

// ---------------------------------------------------------------------------
// Axis 4 — Hair v2
// ---------------------------------------------------------------------------

export type HairStyleV2 =
  | "bald"
  | "flat"
  | "spiky"
  | "ponytail"
  | "bob"
  | "buns"
  | "long"
  | "mohawk"
  | "sidecut"
  | "curly";

const FEMALE_STYLES: HairStyleV2[] = ["ponytail", "bob", "buns", "long", "curly"];
const MALE_STYLES: HairStyleV2[] = ["flat", "spiky", "bob", "mohawk", "sidecut", "curly", "long"];

export function hairStyleV2For(
  hairText: string,
  seedId: string,
  female: boolean,
): HairStyleV2 {
  const text = hairText.toLowerCase();
  if (/bald|shaved|hairless/.test(text)) return "bald";
  if (/mohawk/.test(text)) return "mohawk";
  if (/curl|afro/.test(text)) return "curly";
  if (/sidecut|undercut|asymm/.test(text)) return "sidecut";
  if (/long.*flow|waist.*length|waist-length|flowing/.test(text)) return "long";
  // generic long still ponytail unless flowing is mentioned
  if (/ponytail|tied|braid/.test(text)) return "ponytail";
  if (/long/.test(text)) return "ponytail";
  if (/bun|space/.test(text)) return "buns";
  if (/bob|short|neat|trim/.test(text)) return "bob";
  if (/spik|wild|messy|flame|shonen/.test(text)) return "spiky";
  const pool = female ? FEMALE_STYLES : MALE_STYLES;
  return pool[stableHash(`${seedId}:hairv2`) % pool.length]!;
}

/** Build new hair style meshes (long/mohawk/sidecut/curly) into the given group. */
export function buildHairV2Extra(
  group: THREE.Group,
  style: HairStyleV2,
  hairMat: THREE.MeshToonMaterial,
  radius: number,
): void {
  if (style === "long") {
    // back panel reaching mid-back
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.55, 0.05),
      hairMat,
    );
    panel.position.set(0, -0.28, -radius * 1.0);
    panel.rotation.x = 0.18;
    group.add(panel);
  } else if (style === "mohawk") {
    // central strip of spikes
    const positions: Array<[number, number, number, number]> = [
      [0, 1.15, 0, -0.05],
      [0, 1.05, -0.3 * radius, -0.4],
      [0, 1.05, 0.35 * radius, 0.35],
    ];
    for (const [x, y, z, rx] of positions) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.16, radius * 0.7, 5), hairMat);
      spike.position.set(x * radius, y * radius, z);
      spike.rotation.set(rx, 0, 0);
      group.add(spike);
    }
  } else if (style === "sidecut") {
    // asymmetric: flat on right, side swept on left
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(radius * 0.9, radius * 0.55, radius * 0.55),
      hairMat,
    );
    slab.position.set(-radius * 0.45, radius * 0.5, 0);
    group.add(slab);
  } else if (style === "curly") {
    // cluster of small spheres
    const offsets: Array<[number, number, number]> = [
      [0, 0.85, 0],
      [0.55, 0.72, 0.15],
      [-0.55, 0.72, 0.15],
      [0, 0.72, -0.48],
    ];
    for (const [x, y, z] of offsets) {
      const curl = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.38, 8, 6), hairMat);
      curl.position.set(x * radius, y * radius, z * radius);
      group.add(curl);
    }
  }
}
