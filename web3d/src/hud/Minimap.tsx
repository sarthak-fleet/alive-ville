import { useEffect, useRef } from 'react';

import { activeObjectives } from '../../../src/objectives.ts';
import { timeOfDay } from '../../../src/types.ts';
import { followersStore } from '../characters/followers.ts';
import { useCombatStore } from '../combat/store.ts';
import { cameraState, npcRegistry, playerHeading, playerPosition } from '../controls/runtime.ts';
import { useWorldStore } from '../store/world.ts';
import { cityModelFor } from '../worldgen/cache.ts';
import {
  bakeParchment,
  desaturateTowardParchment,
  drawCompass,
  drawNpcDot,
  drawObjectiveMarker,
  hashedJitter,
  INK,
  labelTrim,
} from './minimap-style.ts';

const WIDTH = 320;
const HEIGHT = 240;
const PADDING = 12;

export function Minimap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const parchmentRef = useRef<HTMLCanvasElement | null>(null);
  const world = useWorldStore((state) => state.world);

  useEffect(() => {
    if (!world) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // Bake parchment once per world
    parchmentRef.current = bakeParchment(WIDTH, HEIGHT);

    const model = cityModelFor(world);
    const { bounds } = model;
    const scale = Math.min(
      (WIDTH - PADDING * 2) / (bounds.maxX - bounds.minX),
      (HEIGHT - PADDING * 2) / (bounds.maxZ - bounds.minZ)
    );
    const offsetX = (WIDTH - (bounds.maxX - bounds.minX) * scale) / 2;
    const offsetZ = (HEIGHT - (bounds.maxZ - bounds.minZ) * scale) / 2;
    const toX = (x: number) => offsetX + (x - bounds.minX) * scale;
    const toY = (z: number) => offsetZ + (z - bounds.minZ) * scale;

    let frame = 0;
    let lastDraw = 0;

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (now - lastDraw < 100) return;
      lastDraw = now;

      ctx.clearRect(0, 0, WIDTH, HEIGHT);

      // Parchment background (baked offscreen)
      if (parchmentRef.current) {
        ctx.drawImage(parchmentRef.current, 0, 0);
      } else {
        ctx.fillStyle = INK.parchment;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
      }

      // Streets — double-line style (two parallel strokes)
      for (const street of model.streets) {
        const w = Math.max(1.5, street.width * scale * 0.45);
        for (const offset of [-0.6, 0.6]) {
          ctx.save();
          ctx.translate(offset, 0);
          ctx.beginPath();
          ctx.lineCap = 'round';
          ctx.strokeStyle = INK.street;
          ctx.lineWidth = w;
          street.points.forEach((point, index) => {
            if (index === 0) ctx.moveTo(toX(point.x), toY(point.z));
            else ctx.lineTo(toX(point.x), toY(point.z));
          });
          ctx.stroke();
          ctx.restore();
        }
      }

      // District plots — parchment-tinted fills with ink shadow edges
      const activeId = world.player.locationId;
      for (const [di, district] of model.districts.entries()) {
        const x = toX(district.origin.x);
        const y = toY(district.origin.z);
        const w = district.width * scale;
        const h = district.depth * scale;
        const isActive = district.locationId === activeId;

        // Slightly irregular jitter per district corner to feel hand-drawn
        const jx = hashedJitter(di * 17 + 3, 0.8);
        const jy = hashedJitter(di * 23 + 7, 0.8);
        const jw = hashedJitter(di * 11 + 1, 0.6);
        const jh = hashedJitter(di * 31 + 5, 0.6);

        // Fill — desaturate toward parchment for non-active districts
        ctx.save();
        ctx.shadowBlur = isActive ? 0 : 3;
        ctx.shadowColor = 'rgba(59,42,26,0.18)';
        roundRect(ctx, x + jx, y + jy, w + jw, h + jh, 4);
        ctx.fillStyle = desaturateTowardParchment(district.palette.ground, isActive ? 0.1 : 0.22);
        ctx.globalAlpha = isActive ? 0.92 : 0.72;
        ctx.fill();
        ctx.restore();

        // Outline
        ctx.save();
        roundRect(ctx, x + jx, y + jy, w + jw, h + jh, 4);
        ctx.strokeStyle = isActive
          ? hexWithAlpha(district.palette.accent, 0.9)
          : hexWithAlpha(district.palette.accent, 0.4);
        ctx.lineWidth = isActive ? 1.8 : 0.9;
        ctx.stroke();
        ctx.restore();

        // Building footprints inside the district
        for (const building of district.buildings) {
          const bx = toX(building.x - building.width / 2);
          const by = toY(building.z - building.depth / 2);
          const bw = building.width * scale;
          const bh = building.depth * scale;
          if (bw < 1 || bh < 1) continue;
          ctx.fillStyle = desaturateTowardParchment(building.bodyColor, 0.35);
          ctx.globalAlpha = isActive ? 0.7 : 0.45;
          ctx.fillRect(bx, by, bw, bh);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = 'rgba(59,42,26,0.3)';
          ctx.lineWidth = 0.7;
          ctx.strokeRect(bx, by, bw, bh);
        }

        // District label at centroid — first word only, skip if district is tiny
        if (w > 28 && h > 18) {
          const lx = x + w / 2;
          const ly = y + h / 2;
          const label = labelTrim(district.name, 10);
          ctx.save();
          ctx.font = `${isActive ? 'bold ' : ''}9px Georgia, serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(244,236,216,0.85)';
          ctx.fillText(label, lx + 0.5, ly + 0.5);
          ctx.fillStyle = isActive ? 'rgba(59,30,8,0.95)' : 'rgba(59,42,26,0.7)';
          ctx.fillText(label, lx, ly);
          ctx.restore();
        }
      }

      // Doors of the active district
      ctx.fillStyle = 'rgba(210, 180, 130, 0.92)';
      for (const door of model.doors) {
        if (door.districtId !== activeId) continue;
        ctx.fillRect(toX(door.x) - 1.5, toY(door.z) - 1.5, 3, 3);
      }

      // Item diamonds
      ctx.fillStyle = '#c89a30';
      for (const district of model.districts) {
        for (const item of world.items) {
          if (item.holderId || item.locationId !== district.locationId) continue;
          diamond(ctx, toX(district.courtyard.x), toY(district.courtyard.z) - 4, 3);
        }
      }

      // NPC dots
      const enemies = useCombatStore.getState().enemies;
      for (const actor of npcRegistry.values()) {
        const npc = world.npcs.find((entry) => entry.id === actor.npcId);
        const enemy = enemies[actor.npcId];
        const defeated = enemy?.defeated || npc?.combat?.defeated;
        const following = followersStore.has(actor.npcId);

        let kind: 'hostile' | 'follower' | 'quest' | 'neutral' | 'defeated';
        let color: string;
        if (defeated) {
          kind = 'defeated';
          color = 'rgba(140, 130, 120, 0.65)';
        } else if (enemy?.hostile) {
          kind = 'hostile';
          color = '#c84030';
        } else if (following) {
          kind = 'follower';
          color = '#6ab8e8';
        } else if (npc?.tier === 'quest') {
          kind = 'quest';
          color = '#c89a30';
        } else {
          kind = 'neutral';
          color = '#b8bec8';
        }

        drawNpcDot(ctx, toX(actor.position.x), toY(actor.position.z), color, kind);
      }

      // Player view cone — warm ink-wash
      const px = toX(playerPosition.x);
      const py = toY(playerPosition.z);
      const camAngle = Math.PI - cameraState.yaw;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(camAngle + Math.PI);
      const cone = ctx.createLinearGradient(0, 0, 0, -30);
      cone.addColorStop(0, 'rgba(201,140,70,0.32)');
      cone.addColorStop(1, 'rgba(201,140,70,0)');
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-13, -30);
      ctx.lineTo(13, -30);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Player triangle — bigger, ink-outlined
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.PI - playerHeading.value);
      ctx.fillStyle = '#6ab8e8';
      ctx.strokeStyle = INK.brown;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 6);
      ctx.lineTo(0, 3);
      ctx.lineTo(-5, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Quest direction: ink-brown dotted line + wax-seal marker
      const objective = activeObjectives(world)[0];
      if (objective) {
        let ox: number | null = null;
        let oy: number | null = null;
        if (objective.targetType === 'npc') {
          const actor = npcRegistry.get(objective.targetId);
          if (actor) {
            ox = toX(actor.position.x);
            oy = toY(actor.position.z);
          }
        }
        if (ox === null || oy === null) {
          const district = model.districts.find(
            (entry) => entry.locationId === objective.locationId
          );
          if (district) {
            ox = toX(district.courtyard.x);
            oy = toY(district.courtyard.z);
          }
        }
        if (ox !== null && oy !== null) {
          ctx.save();
          ctx.strokeStyle = INK.quest;
          ctx.lineWidth = 1.4;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(ox, oy);
          ctx.stroke();
          ctx.restore();
          const pulse = 5 + Math.sin(now / 280) * 1.8;
          drawObjectiveMarker(ctx, ox, oy, pulse);
        }
      }

      // Compass rose — top-left corner
      drawCompass(ctx, 20, 22, 9);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [world]);

  if (!world) return null;

  // Current district name for the badge above the map
  const currentDistrict = (() => {
    const model = cityModelFor(world);
    return model.districts.find((d) => d.locationId === world.player.locationId)?.name ?? '';
  })();

  const tod = timeOfDay(world.clock);
  const hour = String(Math.floor(world.clock.hour)).padStart(2, '0');
  const clockLine = `Day ${world.clock.day} — ${hour}:00 (${tod})`;

  return (
    <div className="minimap-frame">
      {currentDistrict && <div className="minimap-location">{currentDistrict}</div>}
      <div className="minimap">
        <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} />
      </div>
      <div className="minimap-clock">{clockLine}</div>
    </div>
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.fill();
}

function hexWithAlpha(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return `rgba(${(value >> 16) & 0xff}, ${(value >> 8) & 0xff}, ${value & 0xff}, ${alpha})`;
}
