import { useRef, useState } from "react";

import { Button } from "../atoms/Button.tsx";

interface AudioGraph {
  context: AudioContext;
  master: GainNode;
  nodes: AudioNode[];
}

export function AmbienceToggle() {
  const graph = useRef<AudioGraph | null>(null);
  const [enabled, setEnabled] = useState(false);

  async function toggle(): Promise<void> {
    if (enabled) {
      stopAmbience(graph.current);
      graph.current = null;
      setEnabled(false);
      return;
    }
    graph.current = await startAmbience();
    setEnabled(true);
  }

  return (
    <Button
      className="ambience-toggle"
      onClick={() => void toggle()}
      title={enabled ? "Turn ambience off" : "Turn ambience on"}
      aria-pressed={enabled}
    >
      {enabled ? "Sound on" : "Sound"}
    </Button>
  );
}

async function startAmbience(): Promise<AudioGraph> {
  const context = new AudioContext();
  await context.resume();
  const master = context.createGain();
  master.gain.value = 0.055;
  master.connect(context.destination);

  const low = oscillator(context, 146.83, "sine", 0.22);
  const high = oscillator(context, 220, "triangle", 0.06);
  const shimmer = oscillator(context, 587.33, "sine", 0.015);
  const noise = filteredNoise(context, 0.018);

  low.connect(master);
  high.connect(master);
  shimmer.connect(master);
  noise.connect(master);

  return { context, master, nodes: [low, high, shimmer, noise] };
}

function oscillator(context: AudioContext, frequency: number, type: OscillatorType, gainValue: number): GainNode {
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.value = gainValue;
  osc.connect(gain);
  osc.start();
  return gain;
}

function filteredNoise(context: AudioContext, gainValue: number): GainNode {
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * 0.42;
  }
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 820;
  const gain = context.createGain();
  gain.gain.value = gainValue;
  source.connect(filter);
  filter.connect(gain);
  source.start();
  return gain;
}

function stopAmbience(graph: AudioGraph | null): void {
  if (!graph) return;
  graph.master.gain.setTargetAtTime(0, graph.context.currentTime, 0.02);
  window.setTimeout(() => void graph.context.close(), 120);
}
