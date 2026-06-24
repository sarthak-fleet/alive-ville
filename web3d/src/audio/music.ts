/**
 * File-based ambient music manager.
 *
 * Plays one looped HTMLAudioElement at a time and crossfades between tracks.
 * Mute state is mirrored to localStorage so the toggle survives reloads.
 * Pauses while the tab is hidden so a backgrounded game doesn't burn CPU on
 * silent audio decoding.
 */

const MUTE_STORAGE_KEY = 'alive.music.muted';
const BASE_GAIN = 0.3;
const FADE_MS = 1000;
const FADE_STEP_MS = 50;

export type MusicKey = 'village-day' | 'village-night' | 'city' | 'interior' | 'combat' | 'menu';

/** map of music key to public asset URL. uses Vite's BASE_URL so it works on /game/. */
function trackUrl(key: MusicKey): string {
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
  return `${base}/assets/audio/music/${key}.mp3`;
}

interface ActiveTrack {
  key: MusicKey;
  el: HTMLAudioElement;
  /** active fade interval, if any */
  fader: number | null;
}

let current: ActiveTrack | null = null;
let pending: ActiveTrack | null = null;
let muted = readMuted();
const listeners = new Set<(muted: boolean) => void>();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMuted(next: boolean): void {
  try {
    localStorage.setItem(MUTE_STORAGE_KEY, next ? '1' : '0');
  } catch {
    /* private-mode storage failures are non-fatal */
  }
}

export function isMusicMuted(): boolean {
  return muted;
}

export function subscribeMusicMute(callback: (muted: boolean) => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function setMusicMuted(next: boolean): void {
  if (muted === next) return;
  muted = next;
  writeMuted(next);
  // apply to whatever is currently playing
  if (current) applyGain(current.el, next ? 0 : BASE_GAIN);
  if (pending) applyGain(pending.el, 0);
  if (next) {
    current?.el.pause();
    pending?.el.pause();
  } else {
    // unmute while document visible: resume current track
    if (current && !document.hidden) void current.el.play().catch(() => {});
  }
  listeners.forEach((listener) => listener(next));
}

function applyGain(el: HTMLAudioElement, value: number): void {
  el.volume = Math.max(0, Math.min(1, value));
}

function fadeTo(
  track: ActiveTrack,
  targetGain: number,
  durationMs: number,
  onDone?: () => void
): void {
  if (track.fader !== null) {
    window.clearInterval(track.fader);
    track.fader = null;
  }
  const startGain = track.el.volume;
  const steps = Math.max(1, Math.floor(durationMs / FADE_STEP_MS));
  let stepIndex = 0;
  track.fader = window.setInterval(() => {
    stepIndex += 1;
    const t = stepIndex / steps;
    applyGain(track.el, startGain + (targetGain - startGain) * t);
    if (stepIndex >= steps) {
      if (track.fader !== null) {
        window.clearInterval(track.fader);
        track.fader = null;
      }
      applyGain(track.el, targetGain);
      onDone?.();
    }
  }, FADE_STEP_MS);
}

function createTrack(key: MusicKey): ActiveTrack {
  const el = new Audio(trackUrl(key));
  el.loop = true;
  el.preload = 'auto';
  el.crossOrigin = 'anonymous';
  el.volume = 0;
  return { key, el, fader: null };
}

/**
 * Switch to the given track, crossfading from any currently-playing track.
 * Safe to call repeatedly with the same key — becomes a no-op.
 * Browsers require a user gesture before .play() resolves; we swallow the
 * resulting rejection so the first call (often pre-gesture) doesn't throw.
 */
export function playTrack(key: MusicKey): void {
  // already playing this exact track — nothing to do
  if (current?.key === key && !pending) return;
  // already transitioning to this exact track — let it finish
  if (pending?.key === key) return;

  // mid-transition to a different track: kill it before starting a new one
  if (pending) {
    if (pending.fader !== null) window.clearInterval(pending.fader);
    pending.el.pause();
    pending.el.src = '';
    pending = null;
  }

  const next = createTrack(key);
  pending = next;

  const startNext = () => {
    pending = null;
    if (current) {
      // retire the outgoing track once the fade-out lands
      const outgoing = current;
      fadeTo(outgoing, 0, FADE_MS, () => {
        outgoing.el.pause();
        outgoing.el.src = '';
      });
    }
    current = next;
    if (!document.hidden && !muted) {
      void next.el.play().catch(() => {});
      fadeTo(next, BASE_GAIN, FADE_MS);
    } else {
      // load but stay silent — visibility/mute handler will start playback
      applyGain(next.el, muted ? 0 : BASE_GAIN);
    }
  };

  // small async hop so multiple playTrack calls in the same tick collapse cleanly
  window.setTimeout(() => {
    if (pending === next) startNext();
  }, 0);
}

/** Stops all music. Used on teardown / explicit silence. */
export function stopMusic(): void {
  if (current) {
    if (current.fader !== null) window.clearInterval(current.fader);
    current.el.pause();
    current.el.src = '';
    current = null;
  }
  if (pending) {
    if (pending.fader !== null) window.clearInterval(pending.fader);
    pending.el.pause();
    pending.el.src = '';
    pending = null;
  }
}

// visibility: pause when tab is hidden, resume when shown (and not muted)
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!current) return;
    if (document.hidden) {
      current.el.pause();
    } else if (!muted) {
      void current.el.play().catch(() => {});
    }
  });

  // browsers block .play() before the first user gesture. Retry whatever
  // track we have queued the moment a gesture lands. one-shot — once
  // playback succeeds the listener is dead weight.
  const onGesture = () => {
    if (current && !muted && !document.hidden) {
      void current.el.play().catch(() => {});
    }
    if (pending && !muted && !document.hidden) {
      void pending.el.play().catch(() => {});
    }
    window.removeEventListener('pointerdown', onGesture);
    window.removeEventListener('keydown', onGesture);
  };
  window.addEventListener('pointerdown', onGesture, { passive: true });
  window.addEventListener('keydown', onGesture);
}
