/**
 * xr.ts — WebXR (immersive-VR) store + support detection.
 *
 * Uses @react-three/xr's store so VR integrates correctly with the R3F render
 * loop (hand-rolling renderer.xr on R3F does not pump XR frames). Outside a
 * session the <XR> wrapper is a passthrough, so the normal game render is
 * unchanged. A button calls `xrStore.enterVR()`.
 */

import { createXRStore } from "@react-three/xr";

export const xrStore = createXRStore();

export async function vrSupported(): Promise<boolean> {
  const xr = (navigator as { xr?: { isSessionSupported(mode: string): Promise<boolean> } }).xr;
  if (!xr) return false;
  try {
    return await xr.isSessionSupported("immersive-vr");
  } catch {
    return false;
  }
}
