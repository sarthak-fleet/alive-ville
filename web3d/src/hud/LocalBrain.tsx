import { useEffect, useRef, useState } from "react";

import { type ComputeResult, runMatmulBenchmark } from "../ai/gpu-compute.ts";
import { startRenderDemo } from "../ai/gpu-render.ts";
import { useLocalBrain } from "../ai/local-llm.ts";

/** Default persona so the user can prove local generation in one click. */
const SYSTEM_PERSONA =
  "You are Borin, a gruff but kind-hearted blacksmith in a small fantasy town. " +
  "Stay in character. Reply in one or two short sentences.";
const DEFAULT_PROMPT = "A stranger walks up and asks why your forge is cold today.";

function Pill({ on, label }: { on: boolean; label: string }): React.ReactElement {
  return <span className={`cap-pill ${on ? "on" : "off"}`}>{on ? "✓" : "✗"} {label}</span>;
}

export function LocalBrain(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [compute, setCompute] = useState<ComputeResult | null>(null);
  const [computing, setComputing] = useState(false);
  const [renderOn, setRenderOn] = useState(false);
  const renderCanvasRef = useRef<HTMLCanvasElement>(null);
  const renderStopRef = useRef<(() => void) | null>(null);
  const { caps, status, progress, progressText, modelId, error, lastReply, detect, load, generate } = useLocalBrain();

  useEffect(() => {
    void detect();
  }, [detect]);

  // start/stop the isolated WebGPU render demo when toggled
  useEffect(() => {
    if (!renderOn) return;
    const canvas = renderCanvasRef.current;
    if (!canvas) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      const fn = await startRenderDemo(canvas).catch(() => null);
      if (!fn) return;
      if (cancelled) fn();
      else {
        stop = fn;
        renderStopRef.current = fn;
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
      renderStopRef.current = null;
    };
  }, [renderOn]);

  const runCompute = async (): Promise<void> => {
    setComputing(true);
    try {
      setCompute(await runMatmulBenchmark());
    } catch {
      setCompute(null);
    } finally {
      setComputing(false);
    }
  };

  const chipLabel =
    status === "ready" || status === "generating" ? "🧠 Local AI ●" : status === "loading" ? "🧠 Local AI…" : "🧠 Local AI";

  return (
    <>
      <button type="button" className={`chip ${status === "ready" ? "on" : ""}`} onClick={() => setOpen((value) => !value)}>
        {chipLabel}
      </button>

      {open ? (
        <div className="local-brain-panel">
          <div className="local-brain-head">
            <strong>Local AI — runs in your browser, no server</strong>
            <button type="button" className="local-brain-close" onClick={() => setOpen(false)} aria-label="Close">
              ✕
            </button>
          </div>

          <div className="cap-grid">
            <Pill on={Boolean(caps?.webgpu)} label="WebGPU" />
            <Pill on={Boolean(caps?.shaderF16)} label="shader-f16" />
            <Pill on={Boolean(caps?.wasmSimd)} label="WASM SIMD" />
            <Pill on={Boolean(caps?.wasmThreads)} label="WASM threads" />
            <Pill on={Boolean(caps?.webnn)} label="WebNN" />
            <Pill on={Boolean(caps?.opfs)} label="OPFS" />
          </div>

          {status === "unsupported" ? (
            <div className="local-brain-msg warn">No WebGPU adapter here — the game falls back to the cloud LLM.</div>
          ) : null}

          {caps?.webgpu ? (
            <div className="local-brain-compute">
              <button type="button" className="local-brain-action" disabled={computing} onClick={() => void runCompute()}>
                {computing ? "Running on GPU…" : "Run WebGPU compute (384² matmul)"}
              </button>
              {compute ? (
                <div className="local-brain-msg ok">
                  {compute.gflops.toFixed(1)} GFLOP/s · {compute.ms.toFixed(1)} ms · check{" "}
                  {compute.checkValue === compute.checkExpected ? "✓" : `✗ (${compute.checkValue}≠${compute.checkExpected})`}
                </div>
              ) : null}
              <button type="button" className="local-brain-action" onClick={() => setRenderOn((value) => !value)}>
                {renderOn ? "Stop WebGPU render" : "Run WebGPU render demo"}
              </button>
              {renderOn ? <canvas ref={renderCanvasRef} className="local-brain-canvas" width={280} height={120} /> : null}
            </div>
          ) : null}

          {status === "idle" ? (
            <button type="button" className="local-brain-action" onClick={() => void load()}>
              Load model in-browser ↓
            </button>
          ) : null}

          {status === "loading" ? (
            <div className="local-brain-progress">
              <div className="local-brain-progress-track">
                <div className="local-brain-progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <div className="local-brain-msg">{progressText || "Downloading weights…"}</div>
            </div>
          ) : null}

          {status === "ready" || status === "generating" ? (
            <>
              <div className="local-brain-msg ok">
                Model {modelId} resident on your GPU · 0 server calls
              </div>
              <textarea
                className="local-brain-input"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={2}
              />
              <button
                type="button"
                className="local-brain-action"
                disabled={status === "generating"}
                onClick={() => void generate(SYSTEM_PERSONA, prompt)}
              >
                {status === "generating" ? "Thinking locally…" : "Generate reply (on-device)"}
              </button>
              {lastReply ? <div className="local-brain-reply">“{lastReply}”</div> : null}
            </>
          ) : null}

          {error ? <div className="local-brain-msg warn">{error}</div> : null}
        </div>
      ) : null}
    </>
  );
}
