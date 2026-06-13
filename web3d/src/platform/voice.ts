/**
 * voice.ts — NPC text-to-speech + player speech-to-text via the Web Speech API.
 *
 * Built-in browser APIs, no dependency. TTS speaks NPC replies; STT lets the
 * player dictate into the dialogue box. Both are feature-detected and fully
 * opt-in — neither runs unless the UI asks.
 */

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
/** Speak an NPC line only when the player has turned voice on. */
export function sayNpc(text: string): void {
  if (ttsEnabled) speak(text);
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
