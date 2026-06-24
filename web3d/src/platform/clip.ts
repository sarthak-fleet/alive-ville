/**
 * clip.ts — record the live game canvas to a downloadable clip.
 *
 * Frontier media capability (web-frontier-prd §Phase 4): captures the WebGL/WebGPU
 * canvas via `captureStream()` and encodes with MediaRecorder (VP9/webm). The
 * render canvas is registered from inside the R3F tree (see GameWorld).
 */

let captureCanvas: HTMLCanvasElement | null = null;
let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];

/** Registered by a component inside the R3F <Canvas> (it owns the gl.domElement). */
export function setCaptureCanvas(canvas: HTMLCanvasElement | null): void {
  captureCanvas = canvas;
}

export function clipSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    Boolean(captureCanvas) &&
    typeof captureCanvas?.captureStream === 'function'
  );
}

export function isRecording(): boolean {
  return recorder?.state === 'recording';
}

/** Begin recording. Returns false if unsupported or already recording. */
export function startClip(): boolean {
  if (
    !captureCanvas ||
    typeof captureCanvas.captureStream !== 'function' ||
    typeof MediaRecorder === 'undefined'
  )
    return false;
  if (recorder) return false;
  const stream = captureCanvas.captureStream(30);
  chunks = [];
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';
  recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `aliveville-clip-${Date.now()}.webm`;
    anchor.click();
    URL.revokeObjectURL(url);
    recorder = null;
    chunks = [];
  };
  recorder.start();
  return true;
}

export function stopClip(): void {
  recorder?.stop();
}
