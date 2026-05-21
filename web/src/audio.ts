import { combatMoveFor } from "../../src/combat.ts";
import type { TickSummary, World } from "../../src/types.ts";

const SFX_STORAGE_KEY = "ai-game.sound-enabled";
const MUSIC_STORAGE_KEY = "ai-game.music-enabled";

let audioContext: AudioContext | null = null;
let enabled = localStorage.getItem(SFX_STORAGE_KEY) === "true";
let musicEnabled = localStorage.getItem(MUSIC_STORAGE_KEY) === "true";
let musicTimer: number | null = null;
let musicStep = 0;
let musicMood: { worldId: string; phase: string } = { worldId: "ashbend", phase: "starter" };
let activeStepMs = 760;

export interface MusicMoodInput {
  worldId: string;
  phase?: string | null;
}

export function isSoundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(next: boolean): void {
  enabled = next;
  localStorage.setItem(SFX_STORAGE_KEY, String(next));
  if (next) playTone([440, 660], 0.08, "sine", 0.035);
}

export function isMusicEnabled(): boolean {
  return musicEnabled;
}

export function setMusicEnabled(next: boolean, mood: MusicMoodInput = musicMood): void {
  musicEnabled = next;
  localStorage.setItem(MUSIC_STORAGE_KEY, String(next));
  updateMusicMood(mood);
  if (next) startMusic();
  else stopMusic();
}

export function updateMusicMood(mood: MusicMoodInput): void {
  musicMood = { worldId: mood.worldId, phase: mood.phase ?? "starter" };
  const nextStepMs = scoreForMood(musicMood).stepMs;
  if (musicEnabled && nextStepMs !== activeStepMs) {
    stopMusic();
    startMusic();
  }
}

export function musicThemeName(mood: MusicMoodInput): string {
  const phase = mood.phase ?? "starter";
  if (mood.worldId === "opm_z_city") {
    return phase === "shadow_confrontation" ? "Overpass Duel" : "Z-City Pulse";
  }
  if (phase === "shadow_confrontation") return "Lantern Shadow";
  if (phase === "nightfall_warning") return "Nightfall Warning";
  return "Ashbend Dawn";
}

export function playActionCues(entries: TickSummary["actions"], world?: World): void {
  if (!enabled || entries.length === 0) return;
  const primary = entries.find((entry) => entry.action.type === "fight")
    ?? entries.find((entry) => entry.action.type === "complete_quest" || /is complete|completed/i.test(entry.text))
    ?? entries.find((entry) => entry.fromDirector)
    ?? entries[0];
  if (!primary) return;

  switch (primary.action.type) {
    case "fight": {
      const style = world ? combatMoveFor(world, primary.action.moveId).style : "strike";
      playCombatStinger(style);
      break;
    }
    case "pickup":
    case "give":
      playTone([420, 620, 840], 0.12, "triangle", 0.035);
      break;
    case "inspect":
      playTone([330, 470], 0.1, "sine", 0.03);
      break;
    default:
      if (primary.fromDirector) playTone([260, 196, 330], 0.18, "sawtooth", 0.028);
      else if (/complete|resolved|proof|trusted|wary/i.test(primary.text)) playTone([392, 523, 659], 0.14, "triangle", 0.035);
      else playTone([300], 0.06, "sine", 0.02);
  }
}

function playCombatStinger(style: ReturnType<typeof combatMoveFor>["style"]): void {
  const stingers: Record<ReturnType<typeof combatMoveFor>["style"], { notes: number[]; duration: number; type: OscillatorType; gain: number }> = {
    strike: { notes: [120, 86], duration: 0.13, type: "square", gain: 0.045 },
    rush: { notes: [160, 190, 240, 320], duration: 0.08, type: "square", gain: 0.034 },
    counter: { notes: [320, 210, 420], duration: 0.1, type: "triangle", gain: 0.035 },
    guard: { notes: [96, 128], duration: 0.16, type: "sine", gain: 0.038 },
    special: { notes: [98, 196, 294, 392], duration: 0.12, type: "sawtooth", gain: 0.035 },
    finisher: { notes: [82, 164, 247, 330, 494], duration: 0.16, type: "square", gain: 0.042 },
  };
  const stinger = stingers[style];
  playTone(stinger.notes, stinger.duration, stinger.type, stinger.gain);
}

function playTone(frequencies: number[], duration: number, type: OscillatorType, gainValue: number): void {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  frequencies.forEach((frequency, index) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = now + index * 0.055;
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  });
}

function startMusic(): void {
  if (musicTimer !== null) return;
  const ctx = ensureAudioContext();
  if (!ctx) return;
  activeStepMs = scoreForMood(musicMood).stepMs;
  musicStep = 0;
  playMusicStep();
  musicTimer = window.setInterval(playMusicStep, activeStepMs);
}

function stopMusic(): void {
  if (musicTimer === null) return;
  window.clearInterval(musicTimer);
  musicTimer = null;
}

function playMusicStep(): void {
  if (!musicEnabled) return;
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const score = scoreForMood(musicMood);
  const now = ctx.currentTime;
  const chord = score.chords[musicStep % score.chords.length]!;
  const motifNote = score.motif[musicStep % score.motif.length]!;
  const note = motifNote === 0 ? chord[musicStep % chord.length]! : motifNote;
  const bass = chord[0]! / 2;

  if (musicStep % score.bassEvery === 0) {
    playMusicalVoice(bass, now, 1.35, "sine", score.bassGain, 0.18, 0.9);
  }
  if (note > 0) playMusicalVoice(note, now + 0.02, score.noteDuration, "triangle", score.melodyGain, 0.02, 0.28);
  if (musicStep % 2 === 0) {
    playMusicalVoice(chord[1]!, now + 0.03, 0.72, "sine", score.padGain, 0.22, 0.58);
    playMusicalVoice(chord[2]!, now + 0.04, 0.72, "sine", score.padGain * 0.86, 0.22, 0.58);
  }
  if (score.pulse && musicStep % 2 === 1) {
    playMusicalVoice(score.pulse, now, 0.06, "square", 0.012, 0.002, 0.04);
  }

  musicStep = (musicStep + 1) % 64;
}

function playMusicalVoice(
  frequency: number,
  start: number,
  duration: number,
  type: OscillatorType,
  gainValue: number,
  attack: number,
  releaseStart: number
): void {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(type === "square" ? 900 : 1450, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(gainValue, start + attack + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(attack + 0.01, duration * releaseStart));
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

function scoreForMood(mood: { worldId: string; phase: string }): {
  stepMs: number;
  chords: number[][];
  motif: number[];
  bassEvery: number;
  noteDuration: number;
  bassGain: number;
  melodyGain: number;
  padGain: number;
  pulse?: number;
} {
  if (mood.worldId === "opm_z_city") {
    if (mood.phase === "shadow_confrontation") {
      return {
        stepMs: 520,
        chords: [[196, 247, 294], [233, 294, 349], [174, 220, 262], [247, 294, 392]],
        motif: [392, 0, 349, 294, 392, 494, 0, 294],
        bassEvery: 2,
        noteDuration: 0.24,
        bassGain: 0.03,
        melodyGain: 0.025,
        padGain: 0.012,
        pulse: 98,
      };
    }
    return {
      stepMs: 650,
      chords: [[196, 247, 294], [220, 277, 330], [174, 220, 262], [247, 294, 370]],
      motif: [294, 330, 0, 370, 294, 247, 0, 330],
      bassEvery: 4,
      noteDuration: 0.34,
      bassGain: 0.026,
      melodyGain: 0.022,
      padGain: 0.011,
      pulse: 0,
    };
  }
  if (mood.phase === "shadow_confrontation") {
    return {
      stepMs: 560,
      chords: [[147, 196, 247], [165, 196, 262], [131, 175, 220], [156, 196, 233]],
      motif: [247, 0, 233, 196, 262, 247, 0, 175],
      bassEvery: 2,
      noteDuration: 0.28,
      bassGain: 0.026,
      melodyGain: 0.019,
      padGain: 0.014,
      pulse: 82,
    };
  }
  if (mood.phase === "nightfall_warning") {
    return {
      stepMs: 680,
      chords: [[165, 196, 247], [147, 196, 220], [175, 220, 262], [131, 165, 196]],
      motif: [247, 0, 220, 196, 0, 175, 196, 0],
      bassEvery: 3,
      noteDuration: 0.36,
      bassGain: 0.024,
      melodyGain: 0.018,
      padGain: 0.013,
      pulse: 82,
    };
  }
  return {
    stepMs: 760,
    chords: [[196, 247, 330], [220, 262, 349], [175, 220, 294], [247, 294, 392]],
    motif: [330, 0, 349, 294, 247, 0, 294, 392],
    bassEvery: 4,
    noteDuration: 0.46,
    bassGain: 0.02,
    melodyGain: 0.021,
    padGain: 0.01,
  };
}

function ensureAudioContext(): AudioContext | null {
  const Ctx = window.AudioContext ?? window.webkitAudioContext;
  if (!Ctx) return null;
  audioContext ??= new Ctx();
  if (audioContext.state === "suspended") void audioContext.resume();
  return audioContext;
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
