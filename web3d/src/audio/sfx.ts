/**
 * WebAudio synth SFX — zero asset files. Everything is oscillators and
 * filtered noise, tuned for the toon look. Defaults ON (muted via HUD chip).
 */
const STORAGE_KEY = 'web3d.sound-enabled';

let context: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = localStorage.getItem(STORAGE_KEY) !== 'false';

export function isSfxEnabled(): boolean {
  return enabled;
}

export function setSfxEnabled(next: boolean): void {
  enabled = next;
  localStorage.setItem(STORAGE_KEY, String(next));
  if (next) uiBlip();
}

/** must be called from a user gesture once (pointerdown) */
export function ensureAudio(): void {
  if (context) {
    if (context.state === 'suspended') void context.resume();
    return;
  }
  context = new AudioContext();
  master = context.createGain();
  master.gain.value = 0.5;
  master.connect(context.destination);
}

function now(): number {
  return context?.currentTime ?? 0;
}

function tone(
  frequency: number,
  duration: number,
  type: OscillatorType,
  peak: number,
  glideTo?: number
): void {
  if (!enabled || !context || !master) return;
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, now());
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, now() + duration);
  gain.gain.setValueAtTime(0, now());
  gain.gain.linearRampToValueAtTime(peak, now() + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now() + duration);
  osc.connect(gain).connect(master);
  osc.start(now());
  osc.stop(now() + duration + 0.02);
}

function noise(
  duration: number,
  peak: number,
  filterFrequency: number,
  filterType: BiquadFilterType = 'lowpass'
): void {
  if (!enabled || !context || !master) return;
  const length = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
  const source = context.createBufferSource();
  source.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = filterFrequency;
  const gain = context.createGain();
  gain.gain.setValueAtTime(peak, now());
  gain.gain.exponentialRampToValueAtTime(0.0001, now() + duration);
  source.connect(filter).connect(gain).connect(master);
  source.start(now());
}

// ---------------------------------------------------------------------------

let stepToggle = false;

export function footstep(running: boolean): void {
  stepToggle = !stepToggle;
  noise(0.07, running ? 0.16 : 0.1, stepToggle ? 480 : 380);
}

export function attackSwing(combo: number): void {
  noise(0.12, 0.12, 1400 + combo * 350, 'bandpass');
}

export function hitImpact(heavy: boolean): void {
  noise(0.1, heavy ? 0.3 : 0.2, 900, 'lowpass');
  tone(heavy ? 95 : 130, 0.12, 'square', heavy ? 0.16 : 0.1, 60);
}

export function hurt(): void {
  tone(220, 0.16, 'sawtooth', 0.12, 110);
}

export function deathThud(): void {
  noise(0.3, 0.26, 320);
  tone(70, 0.4, 'sine', 0.2, 40);
}

export function dodgeWhoosh(): void {
  noise(0.18, 0.1, 2400, 'highpass');
}

export function pickupChime(): void {
  tone(660, 0.09, 'sine', 0.09);
  setTimeout(() => tone(990, 0.14, 'sine', 0.09), 70);
}

export function questChime(): void {
  tone(523, 0.1, 'triangle', 0.1);
  setTimeout(() => tone(659, 0.1, 'triangle', 0.1), 90);
  setTimeout(() => tone(784, 0.2, 'triangle', 0.12), 180);
}

export function doorCreak(): void {
  tone(180, 0.22, 'sawtooth', 0.05, 240);
  noise(0.12, 0.06, 600);
}

export function talkBlip(): void {
  tone(880, 0.04, 'sine', 0.04);
}

export function uiBlip(): void {
  tone(440, 0.06, 'sine', 0.05);
  setTimeout(() => tone(660, 0.08, 'sine', 0.05), 50);
}

export function followChime(): void {
  tone(392, 0.1, 'triangle', 0.08);
  setTimeout(() => tone(523, 0.16, 'triangle', 0.09), 100);
}

/** low rumble warning that an enemy attack is incoming */
export function telegraphSting(): void {
  tone(110, 0.28, 'sawtooth', 0.07, 90);
  noise(0.18, 0.08, 280, 'lowpass');
}

/** punchy celebration riff on enemy defeat */
export function victorySting(): void {
  tone(523, 0.08, 'triangle', 0.11);
  setTimeout(() => tone(659, 0.08, 'triangle', 0.11), 70);
  setTimeout(() => tone(784, 0.14, 'triangle', 0.13), 140);
  setTimeout(() => tone(1047, 0.22, 'triangle', 0.1), 210);
}

/** short whoosh when an enemy swing misses the dodging player */
export function missSwoosh(): void {
  noise(0.14, 0.09, 3200, 'highpass');
  tone(320, 0.1, 'sine', 0.05, 180);
}
