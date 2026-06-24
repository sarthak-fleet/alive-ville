/**
 * local-llm.ts — NPC brain that runs an LLM fully in the browser on WebGPU.
 *
 * Keystone of docs/archive/web-frontier-prd-shipped-2026-06-14.md: inference happens client-side via
 * @mlc-ai/web-llm — zero server round-trip. web-llm is dynamically imported so
 * the ~MB runtime is code-split out of the main bundle and only fetched when the
 * user opts in. Capability-gated by ai/capabilities.ts; a no-op when WebGPU is
 * absent (the server `/api/dialogue` path remains the fallback).
 *
 * This module is self-contained: it does NOT touch the live dialogue flow yet.
 * Wiring it into NPC dialogue is the next step once the path is proven in-browser.
 */

import type { InitProgressReport, MLCEngineInterface } from '@mlc-ai/web-llm';
import { create } from 'zustand';

import { type Capabilities, detectCapabilities } from './capabilities.ts';

export type LocalBrainStatus =
  | 'unknown'
  | 'unsupported'
  | 'idle'
  | 'loading'
  | 'ready'
  | 'generating'
  | 'error';

/**
 * Preference order; first id present in web-llm's prebuilt config wins. We lead
 * with a full 8B (Llama-3.1-8B, ~4.6GB q4) — the showcase is meant to flex what
 * a top browser + GPU can run locally, so we don't downscale for weak machines
 * (they error out and fall back to the cloud gateway). The smaller entries are
 * only reached if the 8B id is ever absent from the prebuilt config.
 */
const MODELS_F16 = [
  'Llama-3.1-8B-Instruct-q4f16_1-MLC',
  'Qwen2.5-7B-Instruct-q4f16_1-MLC',
  'Llama-3.2-3B-Instruct-q4f16_1-MLC',
  'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
];
const MODELS_F32 = [
  'Llama-3.1-8B-Instruct-q4f32_1-MLC',
  'Qwen2.5-7B-Instruct-q4f32_1-MLC',
  'Llama-3.2-3B-Instruct-q4f32_1-MLC',
  'Qwen2.5-0.5B-Instruct-q4f32_1-MLC',
];

/** The engine is not serializable, so it lives outside the store as a singleton. */
let engine: MLCEngineInterface | null = null;

interface LocalBrainState {
  caps: Capabilities | null;
  status: LocalBrainStatus;
  progress: number;
  progressText: string;
  modelId: string | null;
  error: string | null;
  lastReply: string;
  /** Probe capabilities and set status to idle/unsupported. Safe to call repeatedly. */
  detect: () => Promise<Capabilities>;
  /** Download + initialize the model on WebGPU. Idempotent while loading/ready. */
  load: () => Promise<void>;
  /** Generate one reply locally. Throws if not ready. */
  generate: (system: string, user: string) => Promise<string>;
}

export const useLocalBrain = create<LocalBrainState>((set, get) => ({
  caps: null,
  status: 'unknown',
  progress: 0,
  progressText: '',
  modelId: null,
  error: null,
  lastReply: '',

  async detect() {
    const caps = await detectCapabilities();
    set({
      caps,
      status: caps.webgpu ? (get().status === 'ready' ? 'ready' : 'idle') : 'unsupported',
    });
    return caps;
  },

  async load() {
    const state = get();
    if (state.status === 'loading' || state.status === 'ready') return;
    const caps = state.caps ?? (await get().detect());
    if (!caps.webgpu) {
      set({ status: 'unsupported', error: 'This browser/device has no WebGPU adapter.' });
      return;
    }

    set({ status: 'loading', progress: 0, progressText: 'Starting…', error: null });
    try {
      const webllm = await import('@mlc-ai/web-llm');
      const available = new Set(
        webllm.prebuiltAppConfig.model_list.map((entry: { model_id: string }) => entry.model_id)
      );
      const prefs = caps.shaderF16 ? MODELS_F16 : MODELS_F32;
      const modelId =
        prefs.find((id) => available.has(id)) ??
        webllm.prebuiltAppConfig.model_list[0]?.model_id ??
        null;
      if (!modelId) throw new Error('No web-llm model available in prebuilt config.');

      engine = await webllm.CreateMLCEngine(modelId, {
        initProgressCallback: (report: InitProgressReport) => {
          set({ progress: report.progress, progressText: report.text });
        },
      });
      set({ status: 'ready', modelId, progress: 1, progressText: 'Ready — running on your GPU.' });
    } catch (err) {
      engine = null;
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  },

  async generate(system, user) {
    if (!engine || get().status !== 'ready') throw new Error('Local brain is not ready.');
    set({ status: 'generating' });
    try {
      const completion = await engine.chat.completions.create({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.8,
        max_tokens: 160,
      });
      const reply = completion.choices[0]?.message?.content?.trim() ?? '';
      set({ status: 'ready', lastReply: reply });
      return reply;
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  },
}));
