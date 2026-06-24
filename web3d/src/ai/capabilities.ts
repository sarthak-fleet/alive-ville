/**
 * capabilities.ts — frontier web-platform capability detection.
 *
 * Dependency-free probes for the compute backends the local-AI path needs.
 * Pattern adapted from the sibling repo `../../tinygpt` (browser/src/runtime_detect.ts,
 * webnn_probe.ts). Feeds the local-LLM gate (ai/local-llm.ts) and the HUD readout.
 *
 * WebGPU detection is async (it must request an adapter); the rest are sync.
 */

export interface Capabilities {
  /** navigator.gpu exists AND an adapter was granted. */
  webgpu: boolean;
  /** adapter advertises the `shader-f16` feature (lets us run q4f16 models). */
  shaderF16: boolean;
  /** adapter advertises `timestamp-query` (GPU frame timing for the perf HUD). */
  timestampQuery: boolean;
  /** WebAssembly SIMD (`v128`) is validated by this engine. */
  wasmSimd: boolean;
  /** SharedArrayBuffer + cross-origin isolation — required for WASM threads. */
  wasmThreads: boolean;
  /** navigator.ml namespace is present (WebNN). Presence only — not a working backend. */
  webnn: boolean;
  /** Origin-Private File System available for local model/save caching. */
  opfs: boolean;
  /** page is cross-origin isolated (COOP+COEP) — gates SAB-backed threads. */
  crossOriginIsolated: boolean;
}

/** Tiny module containing a single `i8x16` SIMD op — validates only on SIMD-capable engines. */
const WASM_SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15,
  253, 98, 11,
]);

function detectWasmSimd(): boolean {
  try {
    return typeof WebAssembly === 'object' && WebAssembly.validate(WASM_SIMD_PROBE);
  } catch {
    return false;
  }
}

/** Synchronous probes that need no GPU adapter. */
export function detectSyncCapabilities(): Omit<
  Capabilities,
  'webgpu' | 'shaderF16' | 'timestampQuery'
> {
  const coi =
    typeof globalThis !== 'undefined' &&
    Boolean((globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated);
  return {
    wasmSimd: detectWasmSimd(),
    wasmThreads: typeof SharedArrayBuffer !== 'undefined' && coi,
    webnn: typeof navigator !== 'undefined' && 'ml' in navigator,
    opfs:
      typeof navigator !== 'undefined' &&
      Boolean(navigator.storage) &&
      typeof navigator.storage.getDirectory === 'function',
    crossOriginIsolated: coi,
  };
}

/** Full detection. Requests a WebGPU adapter (async) then reads its feature flags. */
export async function detectCapabilities(): Promise<Capabilities> {
  const sync = detectSyncCapabilities();
  const gpu = typeof navigator !== 'undefined' ? (navigator as { gpu?: GPU }).gpu : undefined;
  if (!gpu) {
    return { ...sync, webgpu: false, shaderF16: false, timestampQuery: false };
  }
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      return { ...sync, webgpu: false, shaderF16: false, timestampQuery: false };
    }
    return {
      ...sync,
      webgpu: true,
      shaderF16: adapter.features.has('shader-f16'),
      timestampQuery: adapter.features.has('timestamp-query'),
    };
  } catch {
    return { ...sync, webgpu: false, shaderF16: false, timestampQuery: false };
  }
}
