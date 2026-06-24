import * as THREE from 'three';

let gradientMap: THREE.DataTexture | null = null;

export function toonGradientMap(): THREE.DataTexture {
  if (gradientMap) return gradientMap;
  const steps = new Uint8Array([135, 200, 255]);
  gradientMap = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

const materialCache = new Map<string, THREE.MeshToonMaterial>();

export function toonMaterial(color: string, emissive?: string): THREE.MeshToonMaterial {
  const key = `${color}:${emissive ?? ''}`;
  const cached = materialCache.get(key);
  if (cached) return cached;
  const material = new THREE.MeshToonMaterial({
    color: new THREE.Color(color),
    gradientMap: toonGradientMap(),
    ...(emissive ? { emissive: new THREE.Color(emissive), emissiveIntensity: 0.55 } : {}),
  });
  materialCache.set(key, material);
  return material;
}

// A gentler 5-step ramp for CHARACTERS only — the world's 3-step ramp reads as
// harsh banding on skin/cloth and makes the figures look cheap. Kept separate so
// buildings/props keep their crisp look.
let softGradientMap: THREE.DataTexture | null = null;
export function softToonGradientMap(): THREE.DataTexture {
  if (softGradientMap) return softGradientMap;
  const steps = new Uint8Array([118, 158, 196, 228, 252]);
  softGradientMap = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
  softGradientMap.minFilter = THREE.LinearFilter;
  softGradientMap.magFilter = THREE.LinearFilter;
  softGradientMap.needsUpdate = true;
  return softGradientMap;
}

const softMaterialCache = new Map<string, THREE.MeshToonMaterial>();
export function softToonMaterial(color: string, emissive?: string): THREE.MeshToonMaterial {
  const key = `${color}:${emissive ?? ''}`;
  const cached = softMaterialCache.get(key);
  if (cached) return cached;
  const material = new THREE.MeshToonMaterial({
    color: new THREE.Color(color),
    gradientMap: softToonGradientMap(),
    ...(emissive ? { emissive: new THREE.Color(emissive), emissiveIntensity: 0.55 } : {}),
  });
  softMaterialCache.set(key, material);
  return material;
}
