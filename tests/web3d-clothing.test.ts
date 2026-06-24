import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { isPlausibleSkin, outfitColorsFor, paintOutfit } from '../web3d/src/characters/clothing.ts';

const VISUAL = {
  color: '#3c5a78',
  accentColor: '#e8c95a',
  skinColor: '#e8c39e',
  bodyShape: 'average' as const,
};

function geometryWith(points: Array<[number, number, number]>): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points.flat()), 3));
  return geometry;
}

function colorAt(geometry: THREE.BufferGeometry, index: number): string {
  const colors = geometry.getAttribute('color')!;
  return `#${new THREE.Color(colors.getX(index), colors.getY(index), colors.getZ(index)).getHexString()}`;
}

describe('character clothing', () => {
  it('accepts real skin tones and rejects clothing colors in the skin slot', () => {
    expect(isPlausibleSkin('#e8c39e')).toBe(true);
    expect(isPlausibleSkin('#39d353')).toBe(false); // green
    expect(isPlausibleSkin('#1d2330')).toBe(false); // near-black navy
  });

  it('falls back to a hashed natural skin tone when the palette slot is implausible', () => {
    const outfit = outfitColorsFor({ ...VISUAL, skinColor: '#39d353' }, 'fubuki');
    expect(isPlausibleSkin(outfit.skin)).toBe(true);
    expect(outfit.shirt).toBe(VISUAL.color);
  });

  it('paints bind-pose zones: shoes, pants, belt, shirt, hands, head', () => {
    const geometry = geometryWith([
      [0, 0.05, 0], // foot
      [0, 0.5, 0], // leg
      [0, 1.06, 0], // belt line (waist sits at ~55% of height)
      [0, 1.4, 0], // torso
      [0.9, 1.4, 0], // hand (arm extremity)
      [0, 1.9, 0], // head
    ]);
    const outfit = outfitColorsFor(VISUAL, 'saitama');
    paintOutfit(geometry, outfit);
    expect(colorAt(geometry, 0)).toBe(`#${new THREE.Color(outfit.shoes).getHexString()}`);
    expect(colorAt(geometry, 1)).toBe(`#${new THREE.Color(outfit.pants).getHexString()}`);
    expect(colorAt(geometry, 2)).toBe(`#${new THREE.Color(outfit.belt).getHexString()}`);
    expect(colorAt(geometry, 3)).toBe(`#${new THREE.Color(outfit.shirt).getHexString()}`);
    expect(colorAt(geometry, 4)).toBe(`#${new THREE.Color(outfit.skin).getHexString()}`);
    expect(colorAt(geometry, 5)).toBe(`#${new THREE.Color(outfit.skin).getHexString()}`);
  });

  it('mechanical bodies never get organic skin', () => {
    const outfit = outfitColorsFor({ ...VISUAL, bodyShape: 'mechanical' }, 'genos');
    expect(isPlausibleSkin(outfit.skin)).toBe(false);
  });
});
