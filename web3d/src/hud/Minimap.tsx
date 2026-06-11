import { useEffect, useRef } from "react";

import { activeObjectives } from "../../../src/objectives.ts";
import { followersStore } from "../characters/followers.ts";
import { useCombatStore } from "../combat/store.ts";
import { cameraState, npcRegistry, playerHeading, playerPosition } from "../controls/runtime.ts";
import { useWorldStore } from "../store/world.ts";
import { cityModelFor } from "../worldgen/cache.ts";

const WIDTH = 232;
const HEIGHT = 172;
const PADDING = 10;

export function Minimap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const world = useWorldStore((state) => state.world);

  useEffect(() => {
    if (!world) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
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

      // streets under districts
      ctx.lineCap = "round";
      for (const street of model.streets) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(190, 200, 215, 0.5)";
        ctx.lineWidth = Math.max(2, street.width * scale * 0.6);
        street.points.forEach((point, index) => {
          if (index === 0) ctx.moveTo(toX(point.x), toY(point.z));
          else ctx.lineTo(toX(point.x), toY(point.z));
        });
        ctx.stroke();
      }

      // district plots
      const activeId = world.player.locationId;
      for (const district of model.districts) {
        const x = toX(district.origin.x);
        const y = toY(district.origin.z);
        const w = district.width * scale;
        const h = district.depth * scale;
        ctx.fillStyle = hexWithAlpha(district.palette.ground, district.locationId === activeId ? 0.95 : 0.62);
        ctx.strokeStyle = hexWithAlpha(district.palette.accent, district.locationId === activeId ? 1 : 0.45);
        ctx.lineWidth = district.locationId === activeId ? 2 : 1;
        roundRect(ctx, x, y, w, h, 3);
        ctx.fill();
        ctx.stroke();
      }

      // doors of the active district
      ctx.fillStyle = "rgba(255, 233, 176, 0.95)";
      for (const door of model.doors) {
        if (door.districtId !== activeId) continue;
        ctx.fillRect(toX(door.x) - 1.5, toY(door.z) - 1.5, 3, 3);
      }

      // item markers
      ctx.fillStyle = "#ffd84d";
      for (const district of model.districts) {
        for (const item of world.items) {
          if (item.holderId || item.locationId !== district.locationId) continue;
          diamond(ctx, toX(district.courtyard.x), toY(district.courtyard.z) - 4, 3);
        }
      }

      // NPC dots from the live registry
      const enemies = useCombatStore.getState().enemies;
      for (const actor of npcRegistry.values()) {
        const npc = world.npcs.find((entry) => entry.id === actor.npcId);
        const enemy = enemies[actor.npcId];
        const defeated = enemy?.defeated || npc?.combat?.defeated;
        const following = followersStore.has(actor.npcId);
        ctx.fillStyle = defeated
          ? "rgba(130, 138, 152, 0.7)"
          : enemy?.hostile
            ? "#ff5a4a"
            : following
              ? "#7fd0ff"
              : npc?.tier === "quest"
                ? "#ffd84d"
                : "#e8edf5";
        ctx.beginPath();
        ctx.arc(toX(actor.position.x), toY(actor.position.z), following ? 3.2 : 2.6, 0, Math.PI * 2);
        ctx.fill();
        if (following) {
          ctx.strokeStyle = "rgba(127, 208, 255, 0.8)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      // player view cone (camera facing)
      const px = toX(playerPosition.x);
      const py = toY(playerPosition.z);
      const camAngle = Math.PI - cameraState.yaw;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(camAngle + Math.PI);
      const cone = ctx.createLinearGradient(0, 0, 0, -26);
      cone.addColorStop(0, "rgba(127, 208, 255, 0.30)");
      cone.addColorStop(1, "rgba(127, 208, 255, 0)");
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-11, -26);
      ctx.lineTo(11, -26);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.translate(px, py);
      // model yaw θ faces (sinθ, cosθ) in world x/z; canvas up is -y → rotate by π − θ
      ctx.rotate(Math.PI - playerHeading.value);
      ctx.fillStyle = "#7fd0ff";
      ctx.strokeStyle = "#0c1422";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4.4, 5);
      ctx.lineTo(0, 2.4);
      ctx.lineTo(-4.4, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // quest direction: dotted line + pulsing marker on the active objective
      const objective = activeObjectives(world)[0];
      if (objective) {
        let ox: number | null = null;
        let oy: number | null = null;
        if (objective.targetType === "npc") {
          const actor = npcRegistry.get(objective.targetId);
          if (actor) {
            ox = toX(actor.position.x);
            oy = toY(actor.position.z);
          }
        }
        if (ox === null || oy === null) {
          const district = model.districts.find((entry) => entry.locationId === objective.locationId);
          if (district) {
            ox = toX(district.courtyard.x);
            oy = toY(district.courtyard.z);
          }
        }
        if (ox !== null && oy !== null) {
          ctx.save();
          ctx.strokeStyle = "rgba(255, 216, 77, 0.55)";
          ctx.lineWidth = 1.4;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(ox, oy);
          ctx.stroke();
          ctx.restore();
          const pulse = 4 + Math.sin(now / 280) * 1.6;
          ctx.strokeStyle = "rgba(255, 216, 77, 0.95)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(ox, oy, pulse, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = "#ffd84d";
          diamond(ctx, ox, oy, 2.6);
        }
      }

      // compass north
      ctx.fillStyle = "rgba(232, 237, 245, 0.8)";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("N", 5, 11);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [world]);

  if (!world) return null;

  return (
    <div className="minimap">
      <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} />
    </div>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
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
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return `rgba(${(value >> 16) & 0xff}, ${(value >> 8) & 0xff}, ${value & 0xff}, ${alpha})`;
}
