import { describe, expect, it } from 'vitest';

import { introCameraPose, smoothstep } from '../web3d/src/director/intro-camera.ts';

const PLAYER = { x: 10, y: 0, z: 20 };

describe('smoothstep', () => {
  it('maps 0 → 0 and 1 → 1', () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
  });

  it('clamps values outside [0, 1]', () => {
    expect(smoothstep(-0.5)).toBe(0);
    expect(smoothstep(1.5)).toBe(1);
  });

  it('is symmetric around 0.5', () => {
    expect(smoothstep(0.25)).toBeCloseTo(1 - smoothstep(0.75), 8);
  });
});

describe('introCameraPose', () => {
  it('t=0: eye starts high and far from player', () => {
    const { eye } = introCameraPose(0, PLAYER);
    // height above player should be near 40m
    expect(eye.y - PLAYER.y).toBeCloseTo(40, 0);
    // horizontal distance from player should be near 28m
    const hDist = Math.hypot(eye.x - PLAYER.x, eye.z - PLAYER.z);
    expect(hDist).toBeCloseTo(28, 0);
  });

  it('t=1: eye settles to normal third-person height and distance', () => {
    const { eye } = introCameraPose(1, PLAYER);
    // height above player should be near 5.5m
    expect(eye.y - PLAYER.y).toBeCloseTo(5.5, 0);
    // horizontal distance from player should be near 6.5m
    const hDist = Math.hypot(eye.x - PLAYER.x, eye.z - PLAYER.z);
    expect(hDist).toBeCloseTo(6.5, 0);
  });

  it('eye height decreases monotonically from t=0 to t=1', () => {
    let prevHeight = Infinity;
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const { eye } = introCameraPose(t, PLAYER);
      expect(eye.y).toBeLessThanOrEqual(prevHeight + 0.001);
      prevHeight = eye.y;
    }
  });

  it('lookAt y decreases monotonically from t=0 to t=1', () => {
    let prevLookY = Infinity;
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const { lookAt } = introCameraPose(t, PLAYER);
      expect(lookAt.y).toBeLessThanOrEqual(prevLookY + 0.001);
      prevLookY = lookAt.y;
    }
  });

  it('lookAt is always above player feet', () => {
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const { lookAt } = introCameraPose(t, PLAYER);
      expect(lookAt.y).toBeGreaterThan(PLAYER.y);
    }
  });

  it('eye x/z tracks player position', () => {
    const moved = { x: 100, y: 5, z: -50 };
    const { eye: e0 } = introCameraPose(0.5, PLAYER);
    const { eye: e1 } = introCameraPose(0.5, moved);
    // offset should shift with player
    expect(e1.x - e0.x).toBeCloseTo(moved.x - PLAYER.x, 1);
    expect(e1.z - e0.z).toBeCloseTo(moved.z - PLAYER.z, 1);
  });
});
