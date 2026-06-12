import * as THREE from "three";

/**
 * Camera-occlusion fading: buildings between the camera and the player turn
 * translucent. Registered occluders are raycast at ~8Hz; opacity eases every
 * frame. Materials are cloned per-mesh on first fade so the shared toon
 * material cache stays untouched.
 */
const occluders = new Set<THREE.Object3D>();

interface FadeState {
  original: THREE.Material | THREE.Material[];
  ghost: THREE.MeshToonMaterial;
  target: number;
}

const fading = new Map<THREE.Mesh, FadeState>();
const raycaster = new THREE.Raycaster();
let lastScan = 0;

export function registerOccluder(object: THREE.Object3D): void {
  occluders.add(object);
}

export function unregisterOccluder(object: THREE.Object3D): void {
  occluders.delete(object);
  // any mesh under this object that was mid-fade has to be restored — otherwise
  // the cloned ghost material persists past unmount and leaks GPU resources
  for (const [mesh, state] of fading) {
    if (!object.getObjectById(mesh.id)) continue;
    mesh.material = state.original;
    state.ghost.dispose();
    fading.delete(mesh);
  }
}

export function updateOcclusion(camera: THREE.Camera, target: THREE.Vector3, elapsed: number, delta: number): void {
  if (elapsed - lastScan > 0.12) {
    lastScan = elapsed;
    const origin = camera.position;
    const direction = target.clone().setY(target.y + 1.2).sub(origin);
    const distance = direction.length();
    raycaster.set(origin, direction.normalize());
    raycaster.far = Math.max(0.1, distance - 0.6);

    // recursive: registered occluders may be groups whose child meshes (pilasters,
    // cornice, awning) jut past the facade and can be the only thing blocking the ray
    const hits = new Set<THREE.Mesh>();
    for (const hit of raycaster.intersectObjects([...occluders], true)) {
      const mesh = hit.object as THREE.Mesh;
      if (!(mesh.material as THREE.Material | undefined)) continue;
      hits.add(mesh);
    }

    for (const mesh of hits) {
      let state = fading.get(mesh);
      if (!state) {
        const source = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
        const ghost = (source as THREE.MeshToonMaterial).clone();
        ghost.transparent = true;
        ghost.depthWrite = false;
        state = { original: mesh.material, ghost, target: 0.22 };
        fading.set(mesh, state);
        mesh.material = ghost;
      }
      state.target = 0.22;
    }
    for (const [mesh, state] of fading) {
      if (!hits.has(mesh)) state.target = 1;
    }
  }

  // ease opacities every frame; restore once fully opaque again
  for (const [mesh, state] of fading) {
    const ghost = state.ghost;
    ghost.opacity += (state.target - ghost.opacity) * Math.min(1, delta * 9);
    if (state.target === 1 && ghost.opacity > 0.97) {
      mesh.material = state.original;
      ghost.dispose();
      fading.delete(mesh);
    }
  }
}
