/**
 * voice.ts — NPC text-to-speech + player speech-to-text.
 *
 * TTS prefers Kokoro-82M in-browser (kokoro.ts, far more natural) and falls back
 * to the built-in Web Speech voice. STT uses the Web Speech recognition API.
 * Both are opt-in — nothing runs unless the UI enables voice.
 */

import { kokoroSpeak, kokoroStop } from "./kokoro.ts";

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type RecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  const w = globalThis as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

let ttsEnabled = false;
export function setVoiceEnabled(value: boolean): void {
  ttsEnabled = value;
  if (!value) stopSpeaking();
}
export function isVoiceEnabled(): boolean {
  return ttsEnabled;
}
/** Speak an NPC line only when the player has turned voice on. Kokoro first, Web Speech fallback. */
export function sayNpc(text: string): void {
  if (!ttsEnabled) return;
  void (async () => {
    const ok = await kokoroSpeak(text);
    if (!ok) speak(text);
  })();
}

export function ttsSupported(): boolean {
  return typeof globalThis !== "undefined" && "speechSynthesis" in globalThis;
}

export function sttSupported(): boolean {
  return recognitionCtor() !== null;
}

/** Speak a line. No-op if TTS is unavailable. Cancels any in-flight utterance. */
export function speak(text: string): void {
  if (!ttsSupported() || !text.trim()) return;
  const synth = globalThis.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.02;
  utterance.pitch = 1;
  synth.speak(utterance);
}

export function stopSpeaking(): void {
  kokoroStop();
  if (ttsSupported()) globalThis.speechSynthesis.cancel();
}

/**
 * Listen for one phrase and resolve the transcript. Returns a stop() function;
 * the promise resolves with the final transcript (or "" on error/no speech).
 */
export function listenOnce(onFinal: (transcript: string) => void): (() => void) | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.continuous = false;
  recognition.onresult = (event) => {
    const transcript = event.results[0]?.[0]?.transcript ?? "";
    if (transcript) onFinal(transcript);
  };
  recognition.onerror = () => recognition.stop();
  recognition.start();
  return () => recognition.stop();
}
