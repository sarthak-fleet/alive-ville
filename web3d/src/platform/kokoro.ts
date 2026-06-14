/**
 * kokoro.ts — high-quality NPC voice via Kokoro-82M, fully in-browser.
 *
 * Kokoro (Apache-2.0, ~82M params) runs client-side through kokoro-js on WebGPU
 * (WASM fallback) — far better than the robotic Web Speech voices, and still
 * zero-server. The model is lazy-loaded + code-split (only fetched the first time
 * voice actually speaks). On any failure it disables itself so callers fall back
 * to Web Speech — never throws.
 */

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const DEFAULT_VOICE = "af_heart";

type KokoroAudio = { toBlob: () => Blob };
type KokoroEngine = { generate: (text: string, opts: { voice: string }) => Promise<KokoroAudio> };

let enginePromise: Promise<KokoroEngine> | null = null;
let current: HTMLAudioElement | null = null;
let disabled = false;

/** True until a load/generate failure flips it off (then callers use Web Speech). */
export function kokoroAvailable(): boolean {
  return !disabled;
}

async function loadEngine(): Promise<KokoroEngine> {
  enginePromise ??= (async () => {
    const mod = (await import("kokoro-js")) as unknown as {
      KokoroTTS: { from_pretrained: (id: string, opts: Record<string, unknown>) => Promise<KokoroEngine> };
    };
    const webgpu = typeof navigator !== "undefined" && "gpu" in navigator;
    return mod.KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: webgpu ? "fp32" : "q8",
      device: webgpu ? "webgpu" : "wasm",
    });
  })();
  return enginePromise;
}

/** Speak a line with Kokoro. Returns false (and self-disables) on any failure. */
export async function kokoroSpeak(text: string, voice = DEFAULT_VOICE): Promise<boolean> {
  if (disabled || !text.trim()) return false;
  try {
    const engine = await loadEngine();
    const audio = await engine.generate(text, { voice });
    const url = URL.createObjectURL(audio.toBlob());
    current?.pause();
    current = new Audio(url);
    current.addEventListener("ended", () => URL.revokeObjectURL(url), { once: true });
    await current.play();
    return true;
  } catch {
    disabled = true;
    return false;
  }
}

export function kokoroStop(): void {
  current?.pause();
}
