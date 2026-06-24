import { timeOfDay, type World } from '../../../src/types.ts';

export interface SceneMood {
  phase: 'dawn' | 'day' | 'dusk' | 'night';
  skyColor: string;
  fogColor: string;
  fogDensity: number;
  hemisphereSky: string;
  hemisphereGround: string;
  hemisphereIntensity: number;
  sunColor: string;
  sunIntensity: number;
  sunPosition: { x: number; y: number; z: number };
}

export function sceneMoodForClock(world: World): SceneMood {
  const base = baseMoodForClock(world);
  const pressure = worldPressure(world);
  // Many worlds ship with baseline tensions of 40-55 and long sessions drift
  // toward 100, so the ominous cast starts high and stays subtle: a mood, not
  // a blackout — daytime must remain clearly daytime.
  if (pressure <= 60) return base;
  const t = Math.min(1, (pressure - 60) / 50);
  return {
    ...base,
    skyColor: hexLerp(base.skyColor, '#3d1530', t * 0.42),
    fogColor: hexLerp(base.fogColor, '#4a1f2e', t * 0.4),
    fogDensity: base.fogDensity * (1 + t * 0.5),
    hemisphereSky: hexLerp(base.hemisphereSky, '#ff9a7a', t * 0.3),
    sunColor: hexLerp(base.sunColor, '#ff7a5a', t * 0.35),
    sunIntensity: base.sunIntensity * (1 - t * 0.15),
  };
}

export function worldPressure(world: World): number {
  const tensions = (world.tensions ?? []).map((tension) => tension.pressure);
  const plans = (world.villainPlans ?? []).map((plan) => plan.pressure);
  return Math.max(world.directorState?.pressure ?? 0, ...tensions, ...plans, 0);
}

function hexLerp(from: string, to: string, t: number): string {
  const a = Number.parseInt(from.replace('#', ''), 16);
  const b = Number.parseInt(to.replace('#', ''), 16);
  const channels = [16, 8, 0].map((shift) => {
    const ca = (a >> shift) & 0xff;
    const cb = (b >> shift) & 0xff;
    return Math.round(ca + (cb - ca) * t);
  });
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function baseMoodForClock(world: World): SceneMood {
  const phase = timeOfDay(world.clock);
  if (phase === 'dawn') {
    return {
      phase,
      skyColor: '#3d4f6b',
      fogColor: '#4a5b73',
      fogDensity: 0.012,
      hemisphereSky: '#ffd59a',
      hemisphereGround: '#263128',
      hemisphereIntensity: 1.55,
      sunColor: '#ffd28a',
      sunIntensity: 2,
      sunPosition: { x: -45, y: 50, z: 66 },
    };
  }
  if (phase === 'dusk') {
    return {
      phase,
      skyColor: '#48314a',
      fogColor: '#52404f',
      fogDensity: 0.014,
      hemisphereSky: '#ff9f7a',
      hemisphereGround: '#1b202d',
      hemisphereIntensity: 1.3,
      sunColor: '#ff8f5a',
      sunIntensity: 1.55,
      sunPosition: { x: 68, y: 32, z: -42 },
    };
  }
  if (phase === 'night') {
    return {
      phase,
      skyColor: '#101729',
      fogColor: '#1a2233',
      fogDensity: 0.018,
      hemisphereSky: '#7fa8ff',
      hemisphereGround: '#090a0f',
      hemisphereIntensity: 0.9,
      sunColor: '#89a7ff',
      sunIntensity: 0.65,
      sunPosition: { x: -58, y: 46, z: -48 },
    };
  }
  return {
    phase,
    skyColor: '#8ec4f2',
    fogColor: '#aacfe8',
    fogDensity: 0.007,
    hemisphereSky: '#dceeff',
    hemisphereGround: '#56604a',
    hemisphereIntensity: 2.1,
    sunColor: '#fff0d0',
    sunIntensity: 2.8,
    sunPosition: { x: 60, y: 90, z: 50 },
  };
}
