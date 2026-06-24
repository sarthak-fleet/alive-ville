/** Pure painting helpers for the stylized in-world minimap. */

/** Ink-brown palette used throughout the parchment map. */
export const INK = {
  /** Main ink color for outlines, player triangle, dotted quest line. */
  brown: '#3b2a1a',
  /** Parchment background — warm off-white paper. */
  parchment: '#f4ecd8',
  /** Slightly darker parchment tint for the noise pass. */
  parchmentShadow: '#e8dcc4',
  /** Street off-white — double-line road color. */
  street: '#d6c9ae',
  /** Quest dotted line — ink-brown, not GPS yellow. */
  quest: 'rgba(92, 58, 24, 0.7)',
  /** Quest objective wax-seal center. */
  questDot: '#7c3c14',
  /** View cone warm ink-wash. */
  cone: 'rgba(201, 140, 70, 0.28)',
  /** Compass needle red. */
  needle: '#c03020',
} as const;

/** Deterministic jitter in [-amplitude, +amplitude] from an integer seed. */
export function hashedJitter(seed: number, amplitude: number): number {
  // xorshift32 — one step only, fast and sufficient for visual scatter
  let x = seed ^ 0x9e3779b9;
  x = (x ^ (x >>> 16)) * 0x45d9f3b;
  x = (x ^ (x >>> 16)) * 0x45d9f3b;
  x = x ^ (x >>> 16);
  // map uint32 to [-1, 1]
  const norm = ((x >>> 0) / 0xffffffff) * 2 - 1;
  return norm * amplitude;
}

/** Return the first word of a district name, capped at maxLen chars. */
export function labelTrim(name: string, maxLen = 10): string {
  const first = name.split(/[\s,_-]/)[0] ?? name;
  return first.length > maxLen ? first.slice(0, maxLen) : first;
}

/**
 * Desaturate a hex color toward parchment by `t` (0 = unchanged, 1 = fully parchment).
 * Used to tint district fills so they read as hand-drawn ink wash.
 */
export function desaturateTowardParchment(hex: string, t: number): string {
  const v = Number.parseInt(hex.replace('#', ''), 16);
  let r = (v >> 16) & 0xff;
  let g = (v >> 8) & 0xff;
  let b = v & 0xff;
  // parchment target: #f4ecd8 → 244, 236, 216
  r = Math.round(r + (244 - r) * t);
  g = Math.round(g + (236 - g) * t);
  b = Math.round(b + (216 - b) * t);
  return `rgb(${r},${g},${b})`;
}

/** Bake a parchment texture into an offscreen canvas (drawn once per world). */
export function bakeParchment(width: number, height: number): HTMLCanvasElement {
  const offscreen = document.createElement('canvas');
  offscreen.width = width;
  offscreen.height = height;
  const ctx = offscreen.getContext('2d')!;

  // Base parchment fill
  ctx.fillStyle = INK.parchment;
  ctx.fillRect(0, 0, width, height);

  // Subtle vignette at edges — darker parchment fade
  const vignette = ctx.createRadialGradient(
    width / 2,
    height / 2,
    height * 0.25,
    width / 2,
    height / 2,
    height * 0.75
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(40,24,8,0.14)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  // Noise dots — cheap 1px scatter to simulate paper grain
  ctx.fillStyle = 'rgba(120,90,50,0.09)';
  // deterministic scatter — seeded by position to avoid flicker on re-bake
  for (let i = 0; i < width * height * 0.012; i++) {
    const sx = hashedJitter(i * 7 + 1, 0.5) + 0.5; // 0..1
    const sy = hashedJitter(i * 13 + 3, 0.5) + 0.5;
    ctx.fillRect(Math.floor(sx * width), Math.floor(sy * height), 1, 1);
  }

  return offscreen;
}

/** Draw a 4-direction compass rose centered at (cx, cy) with outer radius `r`. */
export function drawCompass(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number
): void {
  ctx.save();

  // Cardinal tick marks
  const dirs: Array<[string, number]> = [
    ['N', 0],
    ['E', Math.PI / 2],
    ['S', Math.PI],
    ['W', -Math.PI / 2],
  ];
  ctx.font = `bold ${Math.round(r * 0.72)}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const [label, angle] of dirs) {
    const lx = cx + Math.sin(angle) * (r + 6);
    const ly = cy - Math.cos(angle) * (r + 6);
    // shadow
    ctx.fillStyle = 'rgba(244,236,216,0.9)';
    ctx.fillText(label, lx + 0.5, ly + 0.5);
    ctx.fillStyle = label === 'N' ? INK.needle : INK.brown;
    ctx.fillText(label, lx, ly);
  }

  // Outer ring
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(59,42,26,0.45)';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // N needle — red pointing up, brown pointing down
  const needleLen = r * 0.72;
  ctx.beginPath();
  ctx.moveTo(cx, cy - needleLen);
  ctx.lineTo(cx + 2.5, cy);
  ctx.lineTo(cx, cy + needleLen * 0.6);
  ctx.lineTo(cx - 2.5, cy);
  ctx.closePath();
  // red half (north)
  ctx.fillStyle = INK.needle;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + 2.5, cy);
  ctx.lineTo(cx, cy + needleLen * 0.6);
  ctx.lineTo(cx - 2.5, cy);
  ctx.closePath();
  // brown half (south)
  ctx.fillStyle = INK.brown;
  ctx.fill();

  // Center pip
  ctx.beginPath();
  ctx.arc(cx, cy, 2.2, 0, Math.PI * 2);
  ctx.fillStyle = INK.brown;
  ctx.fill();

  ctx.restore();
}

/** Draw NPC icon: dot + symbol above it based on role. */
export function drawNpcDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  kind: 'hostile' | 'follower' | 'quest' | 'neutral' | 'defeated'
): void {
  const r = kind === 'follower' ? 3.6 : 3.0;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  if (kind !== 'defeated') {
    ctx.strokeStyle = INK.brown;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  // Symbol above dot
  ctx.font = '7px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  if (kind === 'follower') {
    // upward chevron
    ctx.fillStyle = '#5ab8f5';
    ctx.fillText('▴', x, y - r - 1);
  } else if (kind === 'quest') {
    ctx.fillStyle = '#c8960a';
    ctx.fillText('★', x, y - r - 1);
  } else if (kind === 'hostile') {
    ctx.fillStyle = '#d94030';
    ctx.fillText('×', x, y - r - 1);
  }
}

/** Draw a wax-seal style objective marker at (ox, oy). */
export function drawObjectiveMarker(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  pulse: number
): void {
  // Outer pulsing ring
  ctx.beginPath();
  ctx.arc(ox, oy, pulse, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(140, 80, 20, 0.7)';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Filled wax seal circle
  ctx.beginPath();
  ctx.arc(ox, oy, 3.8, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(180, 90, 20, 0.88)';
  ctx.fill();

  // Inner dot
  ctx.beginPath();
  ctx.arc(ox, oy, 1.4, 0, Math.PI * 2);
  ctx.fillStyle = INK.questDot;
  ctx.fill();
}
