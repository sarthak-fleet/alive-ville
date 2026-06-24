import * as THREE from 'three';

import { mulberry32, seedFromString } from '../worldgen/rng.ts';

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return [canvas, canvas.getContext('2d')!];
}

function asTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function shade(hex: string, amount: number): string {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  const channels = [16, 8, 0].map((shift) => {
    const channel = (value >> shift) & 0xff;
    const next = amount >= 0 ? channel + (255 - channel) * amount : channel * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(next)));
  });
  return `rgb(${channels[0]}, ${channels[1]}, ${channels[2]})`;
}

// ---------------------------------------------------------------------------
// Building facades

export interface FacadeMaps {
  map: THREE.CanvasTexture;
  emissiveMap: THREE.CanvasTexture;
}

const facadeCache = new Map<string, FacadeMaps>();

export function facadeMaps(
  bodyColor: string,
  accentColor: string,
  floors: number,
  seedId: string
): FacadeMaps {
  const key = `${bodyColor}:${accentColor}:${floors}:${seedId}`;
  const cached = facadeCache.get(key);
  if (cached) return cached;

  const rng = mulberry32(seedFromString(key));
  const floorPx = 128;
  const width = 512;
  const height = Math.max(1, floors) * floorPx;
  const [canvas, ctx] = makeCanvas(width, height);
  const [glowCanvas, glow] = makeCanvas(width, height);

  // body with a soft vertical gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, shade(bodyColor, 0.14));
  gradient.addColorStop(1, shade(bodyColor, -0.08));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  glow.fillStyle = '#000000';
  glow.fillRect(0, 0, width, height);

  // wall coursing: brick rows or panel seams, picked per building
  const brick = rng() > 0.45;
  ctx.strokeStyle = `rgba(0,0,0,${brick ? 0.07 : 0.09})`;
  ctx.lineWidth = 1.5;
  if (brick) {
    const course = 9;
    for (let y = 0; y < height; y += course) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      const off = (y / course) % 2 === 0 ? 0 : 18;
      for (let x = off; x < width; x += 36) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + course);
        ctx.stroke();
      }
    }
  } else {
    for (let x = 64; x < width; x += 128) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  }

  // gentle wall noise + grime streaks from ledges
  for (let i = 0; i < 240; i += 1) {
    ctx.fillStyle = `rgba(${rng() > 0.5 ? '255,255,255' : '0,0,0'}, ${0.015 + rng() * 0.03})`;
    ctx.fillRect(rng() * width, rng() * height, 3 + rng() * 14, 3 + rng() * 8);
  }
  for (let i = 0; i < 8; i += 1) {
    const gx = rng() * width;
    const gy = rng() * height;
    const streak = ctx.createLinearGradient(0, gy, 0, gy + 40 + rng() * 60);
    streak.addColorStop(0, 'rgba(0,0,0,0.1)');
    streak.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = streak;
    ctx.fillRect(gx, gy, 5 + rng() * 10, 40 + rng() * 60);
  }
  // corner AO so edges read as solid masonry
  for (const [x0, x1] of [
    [0, 18],
    [width - 18, width],
  ] as const) {
    const edge = ctx.createLinearGradient(x0, 0, x1, 0);
    edge.addColorStop(x0 === 0 ? 0 : 1, 'rgba(0,0,0,0.22)');
    edge.addColorStop(x0 === 0 ? 1 : 0, 'rgba(0,0,0,0)');
    ctx.fillStyle = edge;
    ctx.fillRect(x0, 0, 18, height);
  }

  const columns = 5;
  const cell = width / columns;
  for (let floor = 0; floor < floors; floor += 1) {
    // canvas y grows downward; floor 0 is the ground floor at the bottom
    const top = height - (floor + 1) * floorPx;

    // floor trim line with a light catch above it
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, top, width, 3);
    ctx.fillStyle = shade(bodyColor, -0.28);
    ctx.fillRect(0, top + 3, width, 5);

    if (floor === 0) {
      // storefront: sign band with abstract lettering + big glass + centered door
      ctx.fillStyle = shade(accentColor, -0.18);
      ctx.fillRect(0, top + 10, width, 26);
      ctx.fillStyle = shade(accentColor, 0.35);
      let lx = 24 + rng() * 30;
      while (lx < width * 0.62) {
        const lw = 8 + rng() * 18;
        ctx.fillRect(lx, top + 17, lw, 12);
        lx += lw + 7;
      }
      const doorWidth = 60;
      ctx.fillStyle = shade(bodyColor, -0.45);
      ctx.fillRect(width / 2 - doorWidth / 2 - 6, top + 44, doorWidth + 12, floorPx - 44);
      ctx.fillStyle = shade(accentColor, 0.05);
      ctx.fillRect(width / 2 - doorWidth / 2, top + 52, doorWidth, floorPx - 52);
      ctx.fillStyle = shade(accentColor, 0.45);
      ctx.fillRect(width / 2 + doorWidth / 2 - 10, top + floorPx * 0.62, 4, 9); // handle
      // flanking shop windows with sills
      for (const cx of [width * 0.18, width * 0.82]) {
        ctx.fillStyle = shade(bodyColor, -0.4);
        ctx.fillRect(cx - 58, top + 44, 116, 68);
        ctx.fillStyle = '#202b3c';
        ctx.fillRect(cx - 52, top + 50, 104, 56);
        // glass sheen
        ctx.fillStyle = 'rgba(180,210,255,0.12)';
        ctx.beginPath();
        ctx.moveTo(cx - 52, top + 106);
        ctx.lineTo(cx - 10, top + 50);
        ctx.lineTo(cx + 14, top + 50);
        ctx.lineTo(cx - 28, top + 106);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fillRect(cx - 58, top + 112, 116, 4); // sill
        if (rng() > 0.45) {
          glow.fillStyle = 'rgba(255, 214, 150, 0.95)';
          glow.fillRect(cx - 50, top + 52, 100, 52);
        }
      }
      continue;
    }

    for (let column = 0; column < columns; column += 1) {
      const cx = column * cell + cell / 2;
      const wWidth = 52;
      const wHeight = 68;
      const wx = cx - wWidth / 2;
      const wy = top + (floorPx - wHeight) / 2 + 8;
      // header shadow + frame
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(wx - 6, wy - 8, wWidth + 12, 6);
      ctx.fillStyle = shade(bodyColor, -0.38);
      ctx.fillRect(wx - 6, wy - 6, wWidth + 12, wHeight + 12);
      // glass
      const glass = ctx.createLinearGradient(0, wy, 0, wy + wHeight);
      glass.addColorStop(0, '#2b3a52');
      glass.addColorStop(1, '#16202f');
      ctx.fillStyle = glass;
      ctx.fillRect(wx, wy, wWidth, wHeight);
      // sheen + mullions
      ctx.fillStyle = 'rgba(180,210,255,0.1)';
      ctx.beginPath();
      ctx.moveTo(wx, wy + wHeight);
      ctx.lineTo(wx + wWidth * 0.55, wy);
      ctx.lineTo(wx + wWidth * 0.8, wy);
      ctx.lineTo(wx + wWidth * 0.25, wy + wHeight);
      ctx.fill();
      ctx.fillStyle = shade(bodyColor, -0.38);
      ctx.fillRect(wx, wy + wHeight / 2 - 1.5, wWidth, 3);
      ctx.fillRect(wx + wWidth / 2 - 1.5, wy, 3, wHeight);
      // sill with light catch
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(wx - 6, wy + wHeight + 6, wWidth + 12, 4);
      // occasional AC unit under a window
      if (rng() > 0.78) {
        ctx.fillStyle = shade(bodyColor, -0.5);
        ctx.fillRect(wx + 6, wy + wHeight + 12, 26, 14);
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(wx + 6, wy + wHeight + 12, 26, 3);
      }
      // lit at night? (some windows warm, a few cool)
      if (rng() > 0.55) {
        const cool = rng() > 0.82;
        glow.fillStyle = cool
          ? 'rgba(170, 215, 255, 0.8)'
          : `rgba(255, ${200 + Math.floor(rng() * 40)}, 140, 0.95)`;
        glow.fillRect(wx, wy, wWidth, wHeight);
        // half-lit rooms: sometimes only one pane glows
        if (rng() > 0.6) {
          glow.fillStyle = '#000000';
          glow.fillRect(wx + (rng() > 0.5 ? wWidth / 2 : 0), wy, wWidth / 2, wHeight);
        }
      }
    }
  }

  const maps = { map: asTexture(canvas), emissiveMap: asTexture(glowCanvas) };
  facadeCache.set(key, maps);
  return maps;
}

const facadeMaterialCache = new Map<string, THREE.MeshToonMaterial>();

export function facadeMaterial(
  bodyColor: string,
  accentColor: string,
  floors: number,
  seedId: string,
  night: boolean,
  gradientMap: THREE.Texture
): THREE.MeshToonMaterial {
  const key = `${bodyColor}:${accentColor}:${floors}:${seedId}:${night}`;
  const cached = facadeMaterialCache.get(key);
  if (cached) return cached;
  const maps = facadeMaps(bodyColor, accentColor, floors, seedId);
  const material = new THREE.MeshToonMaterial({
    color: new THREE.Color('#ffffff'),
    map: maps.map,
    gradientMap,
    emissive: new THREE.Color('#ffd9a0'),
    emissiveMap: maps.emissiveMap,
    emissiveIntensity: night ? 1.35 : 0,
  });
  facadeMaterialCache.set(key, material);
  return material;
}

// ---------------------------------------------------------------------------
// Ground surfaces

let asphaltTexture: THREE.CanvasTexture | null = null;

export function streetTexture(): THREE.CanvasTexture {
  if (asphaltTexture) return asphaltTexture;
  const rng = mulberry32(7);
  const [canvas, ctx] = makeCanvas(128, 128);
  ctx.fillStyle = '#454a56';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 240; i += 1) {
    ctx.fillStyle = `rgba(${rng() > 0.5 ? '255,255,255' : '0,0,0'}, ${0.02 + rng() * 0.05})`;
    ctx.fillRect(rng() * 128, rng() * 128, 1 + rng() * 3, 1 + rng() * 3);
  }
  // center dashes run along v
  ctx.fillStyle = 'rgba(235, 225, 190, 0.8)';
  ctx.fillRect(61, 8, 6, 38);
  ctx.fillRect(61, 78, 6, 38);
  asphaltTexture = asTexture(canvas);
  asphaltTexture.wrapS = asphaltTexture.wrapT = THREE.RepeatWrapping;
  return asphaltTexture;
}

const pavingCache = new Map<string, THREE.CanvasTexture>();

export function pavingTexture(baseColor: string): THREE.CanvasTexture {
  const cached = pavingCache.get(baseColor);
  if (cached) return cached;
  const rng = mulberry32(seedFromString(baseColor));
  const size = 256;
  const [canvas, ctx] = makeCanvas(size, size);
  const tile = 32;
  // running-bond stones with per-tile tone, inner AO and the odd worn slab
  ctx.fillStyle = shade(baseColor, -0.3);
  ctx.fillRect(0, 0, size, size);
  for (let row = 0; row < size / tile; row += 1) {
    const offset = row % 2 === 0 ? 0 : tile / 2;
    for (let x = -tile; x < size; x += tile) {
      const px = x + offset;
      const py = row * tile;
      const worn = rng() > 0.88;
      const tone = worn ? -0.18 - rng() * 0.08 : -0.05 + rng() * 0.16;
      ctx.fillStyle = shade(baseColor, tone);
      ctx.fillRect(px + 1.5, py + 1.5, tile - 3, tile - 3);
      // soft top-light bevel
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(px + 1.5, py + 1.5, tile - 3, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(px + 1.5, py + tile - 4.5, tile - 3, 3);
      // surface speckle
      if (rng() > 0.4) {
        ctx.fillStyle = `rgba(${rng() > 0.5 ? '255,255,255' : '0,0,0'}, ${0.03 + rng() * 0.05})`;
        ctx.fillRect(
          px + 4 + rng() * (tile - 12),
          py + 4 + rng() * (tile - 12),
          3 + rng() * 5,
          2 + rng() * 4
        );
      }
    }
  }
  const texture = asTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  pavingCache.set(baseColor, texture);
  return texture;
}

const plankCache = new Map<string, THREE.CanvasTexture>();

/** interior wood planks with staggered joints and grain */
export function plankTexture(baseColor: string): THREE.CanvasTexture {
  const cached = plankCache.get(baseColor);
  if (cached) return cached;
  const rng = mulberry32(seedFromString(`plank:${baseColor}`));
  const size = 256;
  const [canvas, ctx] = makeCanvas(size, size);
  const row = 26;
  for (let y = 0; y < size; y += row) {
    ctx.fillStyle = shade(baseColor, -0.06 + rng() * 0.14);
    ctx.fillRect(0, y, size, row);
    // joints
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(0, y, size, 2);
    const joints = 2 + Math.floor(rng() * 2);
    for (let j = 0; j < joints; j += 1) {
      ctx.fillRect(rng() * size, y, 2, row);
    }
    // grain
    for (let g = 0; g < 5; g += 1) {
      ctx.fillStyle = `rgba(0,0,0,${0.04 + rng() * 0.05})`;
      ctx.fillRect(rng() * size, y + 4 + rng() * (row - 8), 30 + rng() * 80, 1.5);
    }
  }
  const texture = asTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  plankCache.set(baseColor, texture);
  return texture;
}

let zebraTexture: THREE.CanvasTexture | null = null;

/** white zebra stripes on transparent, for crosswalk decals at gates */
export function crosswalkTexture(): THREE.CanvasTexture {
  if (zebraTexture) return zebraTexture;
  const [canvas, ctx] = makeCanvas(128, 64);
  ctx.fillStyle = 'rgba(235, 235, 225, 0.85)';
  for (let x = 6; x < 128; x += 24) {
    ctx.fillRect(x, 4, 13, 56);
  }
  zebraTexture = asTexture(canvas);
  return zebraTexture;
}

let poolTexture: THREE.CanvasTexture | null = null;

/** radial falloff disc for warm lamp pools on the ground */
export function lightPoolTexture(): THREE.CanvasTexture {
  if (poolTexture) return poolTexture;
  const [canvas, ctx] = makeCanvas(128, 128);
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(255,255,255,0.85)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.32)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  poolTexture = asTexture(canvas);
  return poolTexture;
}

const brickCache = new Map<string, THREE.CanvasTexture>();

/** interior brick walls: horizontal courses with staggered joints, soot-tinted mortar */
export function brickTexture(baseColor: string): THREE.CanvasTexture {
  const cached = brickCache.get(baseColor);
  if (cached) return cached;
  const rng = mulberry32(seedFromString(`brick:${baseColor}`));
  const size = 256;
  const [canvas, ctx] = makeCanvas(size, size);
  const brickH = 20;
  const brickW = 42;
  // mortar bed
  ctx.fillStyle = shade(baseColor, -0.42);
  ctx.fillRect(0, 0, size, size);
  for (let row = 0; row < size / brickH; row += 1) {
    const offset = row % 2 === 0 ? 0 : brickW / 2;
    for (let x = -brickW; x < size; x += brickW) {
      const px = x + offset;
      const py = row * brickH;
      const tone = -0.1 + rng() * 0.22;
      ctx.fillStyle = shade(baseColor, tone);
      ctx.fillRect(px + 2, py + 2, brickW - 4, brickH - 4);
      // top light catch
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(px + 2, py + 2, brickW - 4, 3);
      // bottom shadow
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(px + 2, py + brickH - 4, brickW - 4, 3);
      // surface speckle (soot)
      if (rng() > 0.55) {
        ctx.fillStyle = `rgba(0,0,0,${0.06 + rng() * 0.1})`;
        ctx.fillRect(
          px + 4 + rng() * (brickW - 10),
          py + 4 + rng() * (brickH - 8),
          4 + rng() * 8,
          2 + rng() * 4
        );
      }
    }
  }
  const texture = asTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  brickCache.set(baseColor, texture);
  return texture;
}

const tileCache = new Map<string, THREE.CanvasTexture>();

/** interior floor tiles: square grid with grout lines and slight per-tile tone variation */
export function tileTexture(baseColor: string): THREE.CanvasTexture {
  const cached = tileCache.get(baseColor);
  if (cached) return cached;
  const rng = mulberry32(seedFromString(`tile:${baseColor}`));
  const size = 256;
  const [canvas, ctx] = makeCanvas(size, size);
  const tile = 40;
  ctx.fillStyle = shade(baseColor, -0.28);
  ctx.fillRect(0, 0, size, size);
  for (let row = 0; row < size / tile; row += 1) {
    for (let col = 0; col < size / tile; col += 1) {
      const px = col * tile;
      const py = row * tile;
      const tone = -0.04 + rng() * 0.12;
      ctx.fillStyle = shade(baseColor, tone);
      ctx.fillRect(px + 2, py + 2, tile - 4, tile - 4);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(px + 2, py + 2, tile - 4, 4);
      ctx.fillStyle = 'rgba(0,0,0,0.07)';
      ctx.fillRect(px + 2, py + tile - 6, tile - 4, 4);
    }
  }
  const texture = asTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  tileCache.set(baseColor, texture);
  return texture;
}

const crackedWallCache = new Map<string, THREE.CanvasTexture>();

/** abandoned wall texture: dark, irregular, with crack lines and peeling patches */
export function crackedWallTexture(baseColor: string): THREE.CanvasTexture {
  const cached = crackedWallCache.get(baseColor);
  if (cached) return cached;
  const rng = mulberry32(seedFromString(`cracked:${baseColor}`));
  const size = 256;
  const [canvas, ctx] = makeCanvas(size, size);
  // base dirty plaster
  ctx.fillStyle = shade(baseColor, -0.18);
  ctx.fillRect(0, 0, size, size);
  // patchy peeling — dark irregular blobs
  for (let i = 0; i < 18; i += 1) {
    const px = rng() * size;
    const py = rng() * size;
    const w = 14 + rng() * 38;
    const h = 10 + rng() * 28;
    ctx.fillStyle = shade(baseColor, -0.38 - rng() * 0.18);
    ctx.beginPath();
    ctx.ellipse(px, py, w / 2, h / 2, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // crack lines
  ctx.strokeStyle = shade(baseColor, -0.52);
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 7; i += 1) {
    ctx.beginPath();
    let cx = rng() * size;
    let cy = rng() * size;
    ctx.moveTo(cx, cy);
    const steps = 4 + Math.floor(rng() * 5);
    for (let s = 0; s < steps; s += 1) {
      cx += (rng() - 0.5) * 32;
      cy += (rng() - 0.3) * 28;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }
  // overall grime noise
  for (let i = 0; i < 180; i += 1) {
    ctx.fillStyle = `rgba(0,0,0,${0.03 + rng() * 0.07})`;
    ctx.fillRect(rng() * size, rng() * size, 2 + rng() * 6, 2 + rng() * 6);
  }
  const texture = asTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  crackedWallCache.set(baseColor, texture);
  return texture;
}

const speckleCache = new Map<string, THREE.CanvasTexture>();

export function speckleTexture(baseColor: string): THREE.CanvasTexture {
  const cached = speckleCache.get(baseColor);
  if (cached) return cached;
  const rng = mulberry32(seedFromString(`speckle:${baseColor}`));
  const [canvas, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = shade(baseColor, 0);
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 850; i += 1) {
    ctx.fillStyle = shade(baseColor, -0.12 + rng() * 0.26);
    const size = 2 + rng() * 6;
    ctx.fillRect(rng() * 256, rng() * 256, size, size * (0.5 + rng() * 0.8));
  }
  const texture = asTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  speckleCache.set(baseColor, texture);
  return texture;
}
