import * as THREE from "three";

import { mulberry32, seedFromString } from "../worldgen/rng.ts";

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return [canvas, canvas.getContext("2d")!];
}

function asTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function shade(hex: string, amount: number): string {
  const value = Number.parseInt(hex.replace("#", ""), 16);
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

export function facadeMaps(bodyColor: string, accentColor: string, floors: number, seedId: string): FacadeMaps {
  const key = `${bodyColor}:${accentColor}:${floors}:${seedId}`;
  const cached = facadeCache.get(key);
  if (cached) return cached;

  const rng = mulberry32(seedFromString(key));
  const floorPx = 64;
  const width = 256;
  const height = Math.max(1, floors) * floorPx;
  const [canvas, ctx] = makeCanvas(width, height);
  const [glowCanvas, glow] = makeCanvas(width, height);

  // body with a soft vertical gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, shade(bodyColor, 0.14));
  gradient.addColorStop(1, shade(bodyColor, -0.08));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  glow.fillStyle = "#000000";
  glow.fillRect(0, 0, width, height);

  // gentle wall noise
  for (let i = 0; i < 130; i += 1) {
    ctx.fillStyle = `rgba(${rng() > 0.5 ? "255,255,255" : "0,0,0"}, ${0.015 + rng() * 0.03})`;
    ctx.fillRect(rng() * width, rng() * height, 2 + rng() * 9, 2 + rng() * 5);
  }

  const columns = 5;
  const cell = width / columns;
  for (let floor = 0; floor < floors; floor += 1) {
    // canvas y grows downward; floor 0 is the ground floor at the bottom
    const top = height - (floor + 1) * floorPx;

    // floor trim line
    ctx.fillStyle = shade(bodyColor, -0.28);
    ctx.fillRect(0, top, width, 3);

    if (floor === 0) {
      // ground floor: accent fascia band + centered door
      ctx.fillStyle = shade(accentColor, -0.12);
      ctx.fillRect(0, top + 6, width, 10);
      const doorWidth = 30;
      ctx.fillStyle = shade(bodyColor, -0.45);
      ctx.fillRect(width / 2 - doorWidth / 2 - 3, top + 22, doorWidth + 6, floorPx - 22);
      ctx.fillStyle = shade(accentColor, 0.05);
      ctx.fillRect(width / 2 - doorWidth / 2, top + 26, doorWidth, floorPx - 26);
      // flanking shop windows
      for (const cx of [width * 0.18, width * 0.82]) {
        ctx.fillStyle = "#202b3c";
        ctx.fillRect(cx - 26, top + 24, 52, 30);
        ctx.strokeStyle = shade(bodyColor, -0.4);
        ctx.lineWidth = 3;
        ctx.strokeRect(cx - 26, top + 24, 52, 30);
        if (rng() > 0.45) {
          glow.fillStyle = "rgba(255, 214, 150, 0.95)";
          glow.fillRect(cx - 24, top + 26, 48, 26);
        }
      }
      continue;
    }

    for (let column = 0; column < columns; column += 1) {
      const cx = column * cell + cell / 2;
      const wWidth = 26;
      const wHeight = 34;
      const wx = cx - wWidth / 2;
      const wy = top + (floorPx - wHeight) / 2 + 4;
      // frame
      ctx.fillStyle = shade(bodyColor, -0.38);
      ctx.fillRect(wx - 3, wy - 3, wWidth + 6, wHeight + 6);
      // glass
      const glass = ctx.createLinearGradient(0, wy, 0, wy + wHeight);
      glass.addColorStop(0, "#2b3a52");
      glass.addColorStop(1, "#16202f");
      ctx.fillStyle = glass;
      ctx.fillRect(wx, wy, wWidth, wHeight);
      // mullion
      ctx.fillStyle = shade(bodyColor, -0.38);
      ctx.fillRect(wx, wy + wHeight / 2 - 1, wWidth, 2);
      // lit at night?
      if (rng() > 0.55) {
        glow.fillStyle = `rgba(255, ${200 + Math.floor(rng() * 40)}, 140, 0.95)`;
        glow.fillRect(wx, wy, wWidth, wHeight);
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
    color: new THREE.Color("#ffffff"),
    map: maps.map,
    gradientMap,
    emissive: new THREE.Color("#ffd9a0"),
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
  ctx.fillStyle = "#454a56";
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 240; i += 1) {
    ctx.fillStyle = `rgba(${rng() > 0.5 ? "255,255,255" : "0,0,0"}, ${0.02 + rng() * 0.05})`;
    ctx.fillRect(rng() * 128, rng() * 128, 1 + rng() * 3, 1 + rng() * 3);
  }
  // center dashes run along v
  ctx.fillStyle = "rgba(235, 225, 190, 0.8)";
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
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(px + 1.5, py + 1.5, tile - 3, 3);
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.fillRect(px + 1.5, py + tile - 4.5, tile - 3, 3);
      // surface speckle
      if (rng() > 0.4) {
        ctx.fillStyle = `rgba(${rng() > 0.5 ? "255,255,255" : "0,0,0"}, ${0.03 + rng() * 0.05})`;
        ctx.fillRect(px + 4 + rng() * (tile - 12), py + 4 + rng() * (tile - 12), 3 + rng() * 5, 2 + rng() * 4);
      }
    }
  }
  const texture = asTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  pavingCache.set(baseColor, texture);
  return texture;
}

let poolTexture: THREE.CanvasTexture | null = null;

/** radial falloff disc for warm lamp pools on the ground */
export function lightPoolTexture(): THREE.CanvasTexture {
  if (poolTexture) return poolTexture;
  const [canvas, ctx] = makeCanvas(128, 128);
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  gradient.addColorStop(0, "rgba(255,255,255,0.85)");
  gradient.addColorStop(0.45, "rgba(255,255,255,0.32)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  poolTexture = asTexture(canvas);
  return poolTexture;
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
