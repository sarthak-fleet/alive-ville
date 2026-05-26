export type SfxId = "talk" | "inspect" | "objective" | "hit" | "counter" | "victory" | "defeat" | "ui";

interface Tone {
  freq: number;
  duration: number;
  type?: OscillatorType;
  decay?: number;
  attack?: number;
  glide?: number;
  volume?: number;
}

const PALETTE: Record<SfxId, Tone[]> = {
  talk:      [{ freq: 520, duration: 0.06, volume: 0.04 }, { freq: 720, duration: 0.05, volume: 0.04 }],
  inspect:   [{ freq: 380, duration: 0.05, volume: 0.04 }, { freq: 460, duration: 0.07, volume: 0.04 }],
  objective: [{ freq: 660, duration: 0.10, volume: 0.06 }, { freq: 990, duration: 0.16, volume: 0.06 }],
  hit:       [{ freq: 180, duration: 0.07, type: "square", volume: 0.06 }],
  counter:   [{ freq: 110, duration: 0.09, type: "sawtooth", volume: 0.06 }],
  victory:   [{ freq: 660, duration: 0.10, volume: 0.07 }, { freq: 880, duration: 0.12, volume: 0.07 }, { freq: 1320, duration: 0.18, volume: 0.07 }],
  defeat:    [{ freq: 180, duration: 0.20, type: "triangle", volume: 0.06 }, { freq: 90, duration: 0.28, type: "triangle", volume: 0.06 }],
  ui:        [{ freq: 480, duration: 0.04, volume: 0.04 }],
};

let context: AudioContext | null = null;
let enabled = true;

function ensureContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!context) {
    const AudioCtx = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    context = new AudioCtx();
  }
  if (context.state === "suspended") void context.resume();
  return context;
}

export function setSfxEnabled(value: boolean) {
  enabled = value;
}

export function isSfxEnabled() {
  return enabled;
}

export function playSfx(id: SfxId) {
  if (!enabled) return;
  const ctx = ensureContext();
  if (!ctx) return;
  const tones = PALETTE[id];
  let offset = 0;
  for (const tone of tones) {
    const start = ctx.currentTime + offset;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tone.type ?? "sine";
    osc.frequency.setValueAtTime(tone.freq, start);
    const peak = tone.volume ?? 0.05;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peak, start + (tone.attack ?? 0.005));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + tone.duration + 0.02);
    offset += tone.duration * 0.85;
  }
}
