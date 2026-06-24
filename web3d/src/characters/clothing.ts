import * as THREE from 'three';

import { type ActorVisual, stableHash } from '../mapping/visuals.ts';

export interface OutfitColors {
  skin: string;
  shirt: string;
  pants: string;
  shoes: string;
  belt: string;
}

const SKIN_TONES = ['#f0c8a0', '#e8b48c', '#d9a06e', '#c08a5c', '#9c6b44', '#f3d3b3'];

/** schema palettes often put a clothing color in the skin slot — only trust it when it actually reads as skin */
export function isPlausibleSkin(hex: string): boolean {
  const color = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  const degrees = hsl.h * 360;
  return (
    degrees >= 10 && degrees <= 50 && hsl.s >= 0.1 && hsl.s <= 0.75 && hsl.l >= 0.3 && hsl.l <= 0.9
  );
}

function mix(hex: string, toward: string, amount: number): string {
  return `#${new THREE.Color(hex).lerp(new THREE.Color(toward), amount).getHexString()}`;
}

export function outfitColorsFor(visual: ActorVisual, seedId: string): OutfitColors {
  if (visual.bodyShape === 'mechanical') {
    return {
      skin: mix(visual.color, '#aab2c0', 0.35),
      shirt: visual.color,
      pants: mix(visual.color, '#11151f', 0.45),
      shoes: '#1c222e',
      belt: visual.accentColor,
    };
  }
  const skin = isPlausibleSkin(visual.skinColor)
    ? visual.skinColor
    : SKIN_TONES[stableHash(`${seedId}:skin`) % SKIN_TONES.length]!;
  return {
    skin,
    shirt: visual.color,
    pants: mix(visual.color, '#171c28', 0.52),
    shoes: mix(visual.accentColor, '#11151f', 0.55),
    belt: visual.accentColor,
  };
}

/**
 * Paint clothing zones into a vertex-color attribute using the bind pose:
 * hands/head get skin, torso+arms the shirt, legs pants, feet shoes, with an
 * accent belt band. Zones are normalized against the geometry's own bounds so
 * the same thresholds work for any humanoid bind pose (T or A).
 */
export interface OutfitCut {
  /** skin from the elbow out */
  shortSleeves?: boolean;
  /** skin from the knee down (shoes stay) */
  shorts?: boolean;
}

export function paintOutfit(
  geometry: THREE.BufferGeometry,
  outfit: OutfitColors,
  cut: OutfitCut = {}
): void {
  const position = geometry.getAttribute('position');
  if (!position) return;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxAbsX = 0;
  for (let index = 0; index < position.count; index += 1) {
    const y = position.getY(index);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    maxAbsX = Math.max(maxAbsX, Math.abs(position.getX(index)));
  }
  const height = Math.max(1e-6, maxY - minY);
  const span = Math.max(1e-6, maxAbsX);

  const palette = {
    skin: new THREE.Color(outfit.skin),
    shirt: new THREE.Color(outfit.shirt),
    pants: new THREE.Color(outfit.pants),
    shoes: new THREE.Color(outfit.shoes),
    belt: new THREE.Color(outfit.belt),
  };

  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    const ny = (position.getY(index) - minY) / height;
    const nx = Math.abs(position.getX(index)) / span;
    let color: THREE.Color;
    if (nx > (cut.shortSleeves ? 0.58 : 0.82) && ny > 0.2)
      color = palette.skin; // hands / bare forearms
    else if (ny > 0.84)
      color = palette.skin; // head + neck
    else if (ny < 0.075) color = palette.shoes;
    else if (cut.shorts && ny < 0.3)
      color = palette.skin; // bare calves
    else if (ny < 0.53) color = palette.pants;
    else if (ny < 0.56) color = palette.belt;
    else color = palette.shirt;
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}
