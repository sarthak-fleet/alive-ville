import type Phaser from "phaser";

import type { CharacterAppearance } from "../../../src/types.ts";

export const ACTOR_FRAME_W = 32;
export const ACTOR_FRAME_H = 48;
export const ACTOR_SCALE = 1.55;

export const FACING_ORDER = [
  "down",
  "downRight",
  "right",
  "upRight",
  "up",
  "upLeft",
  "left",
  "downLeft",
] as const;
export type FacingName = (typeof FACING_ORDER)[number];

/** Lighten or darken a 0xRRGGBB integer by a signed ratio in (-1, 1). */
export function shade(value: number, ratio: number): string {
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  const adjust = (channel: number) => {
    if (ratio >= 0) return Math.round(channel + (255 - channel) * ratio);
    return Math.round(channel * (1 + ratio));
  };
  const nr = Math.max(0, Math.min(255, adjust(r)));
  const ng = Math.max(0, Math.min(255, adjust(g)));
  const nb = Math.max(0, Math.min(255, adjust(b)));
  return `#${((nr << 16) | (ng << 8) | nb).toString(16).padStart(6, "0")}`;
}

function hex(value: number) {
  return `#${value.toString(16).padStart(6, "0")}`;
}

/**
 * Paint one walk frame for one facing direction of one character into the
 * spritesheet canvas at offset (ox, oy). Pure draw — no Phaser dependency.
 */
export function drawActorFrame(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  id: string,
  fill: number,
  variant: number,
  facing: FacingName,
  frame: number,
  appearance?: CharacterAppearance,
): void {
  const look = `${appearance?.sourceLook ?? ""} ${(appearance?.visualTags ?? []).join(" ")}`.toLowerCase();
  const isBaldHero = look.includes("bald") || look.includes("yellow suit");
  const isCyborg = look.includes("cyborg") || look.includes("mechanical");
  const isHelmetHero = look.includes("helmet") || look.includes("cyclist");
  const isPsychic = look.includes("psychic") || look.includes("green hair");
  const isNinja = look.includes("ninja") || look.includes("purple scarf");
  const isBlacksmith = id === "tomas" && !isCyborg;
  const isGardener = id === "mira" && !isBaldHero;
  const isElder = id === "orrin" && !isPsychic;
  const isYouth = id === "pax" && !isNinja;
  const skin = id === "player" ? "#f0bf8a" : isElder ? "#efc99b" : isCyborg ? "#f0c08c" : "#e79b69";
  const skinShade = id === "player" ? "#c79165" : isElder ? "#c8a37b" : isCyborg ? "#b87b55" : "#bf7a4d";
  const shirt = hex(fill);
  const shirtShade = shade(fill, -0.22);
  const shirtLight = shade(fill, 0.18);
  const trim = id === "player" ? "#f8d44e" : isGardener ? "#e2d58f" : variant % 2 === 0 ? "#d2b16c" : "#f4d782";
  const pants = id === "player" ? "#4a2a1d" : isBlacksmith ? "#2c2a28" : isGardener ? "#5a4a32" : isElder ? "#6b553d" : isNinja ? "#171520" : "#2d3d56";
  const pantsShade = id === "player" ? "#2f1a10" : isBlacksmith ? "#191817" : isGardener ? "#3a301f" : isElder ? "#4a3a28" : isNinja ? "#0d0b12" : "#1a2638";
  const hair = id === "player"
    ? "#5b351d"
    : isBaldHero
      ? skin
      : isPsychic
        ? "#4fcf75"
        : isCyborg
          ? "#f1c85a"
          : isNinja
            ? "#16121b"
            : isElder
              ? "#e7dbbe"
              : isBlacksmith
                ? "#2d2018"
                : isGardener
                  ? "#6d4930"
                  : ["#4a2917", "#6d4930", "#2d2018", "#8a6038", "#e7dbbe"][variant]!;
  const hairShade = shade(parseInt(hair.slice(1), 16), -0.25);
  const boot = "#2b1d16";
  const belt = "#7b4a25";
  const bag = id === "player" || variant === 2 ? "#8a6038" : "#4d3627";
  const outline = "rgba(20, 14, 10, 0.55)";
  const side = facing.includes("Right") ? 1 : facing.includes("Left") ? -1 : 0;
  const up = facing.startsWith("up");
  const back = facing === "up" || facing === "upLeft" || facing === "upRight";
  const walk = frame === 0 ? 0 : frame === 1 ? -2 : frame === 2 ? 0 : 2;
  const x = ox;
  const y = oy;

  const rect = (rx: number, ry: number, rw: number, rh: number, color: string, radius = 0) => {
    ctx.fillStyle = color;
    if (radius > 0) {
      ctx.beginPath();
      ctx.roundRect(Math.round(x + rx), Math.round(y + ry), Math.round(rw), Math.round(rh), radius);
      ctx.fill();
    } else {
      ctx.fillRect(Math.round(x + rx), Math.round(y + ry), Math.round(rw), Math.round(rh));
    }
  };
  const oval = (cx: number, cy: number, rx: number, ry: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x + cx, y + cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  };

  // Soft silhouette pass so the character reads against busy ground.
  ctx.fillStyle = outline;
  ctx.beginPath();
  ctx.ellipse(x + 16, y + 16, 7.5, 8.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(x + 9, y + 19, 15, 21, 5);
  ctx.fill();

  // Legs.
  rect(11, 34 + walk, 5, 10, pants, 2);
  rect(11, 34 + walk, 2, 10, pantsShade, 2);
  rect(17, 34 - walk, 5, 10, pants, 2);
  rect(17, 34 - walk, 2, 10, pantsShade, 2);
  rect(10, 43 + walk, 7, 3, boot, 2);
  rect(16, 43 - walk, 7, 3, boot, 2);

  // Arms.
  rect(8 + side, 23, 4, 13, skin, 3);
  rect(20 + side, 23, 4, 13, skin, 3);
  rect(8 + side + (side < 0 ? 0 : 3), 23, 1, 13, skinShade);
  rect(20 + side + (side < 0 ? 0 : 3), 23, 1, 13, skinShade);

  // Torso.
  rect(10, 19, 13, 19, shirt, 4);
  rect(10 + (side < 0 ? 0 : 9), 19, 4, 19, shirtShade, 4);
  rect(11, 19, 11, 2, shirtLight, 3);
  rect(10, 28, 13, 3, belt, 1);
  rect(10, 30, 13, 1, "rgba(0,0,0,0.22)");

  // Per-character body accessory.
  if (id === "player") {
    rect(8 - side * 3, 24, 7, 15, bag, 3);
    rect(8 - side * 3, 24, 7, 2, "#5b3b28", 2);
    rect(9 - side * 2, 20, 3, 20, "#5b3b28", 2);
  } else if (isBlacksmith) {
    rect(7, 20, 19, 21, "#4f3428", 3);
    rect(7, 20, 19, 2, "#7b5238", 2);
    rect(9, 28, 15, 3, "#24120b", 1);
    rect(8, 35, 17, 5, "#3b2a21", 2);
  } else if (isElder) {
    rect(7, 18, 19, 22, "#355a82", 4);
    rect(7, 18, 19, 2, "#4d7aa6", 3);
    rect(7, 36, 19, 4, "#274263", 3);
    rect(22 + side, 31, 3, 17, "#5f452c", 2);
  } else if (isGardener) {
    rect(8, 25, 17, 16, "#5f7d4d", 4);
    rect(8, 25, 17, 2, "#7a9a64", 3);
    rect(9, 31, 15, 3, "#3f5d3c", 1);
  } else if (isYouth) {
    rect(8 - side * 2, 26, 7, 12, bag, 3);
    rect(8 - side * 2, 26, 7, 2, "#5b3b28", 2);
  }

  if (isBaldHero) {
    rect(6 - side, 18, 8, 24, "#f4f1e8", 5);
    rect(19 - side, 18, 8, 24, "#e8e2d4", 5);
    rect(7, 18, 18, 3, "#ffffff", 3);
    rect(7, 28, 18, 5, "#c2292d", 2);
  }
  if (isCyborg) {
    rect(6 + side, 22, 5, 17, "#d38a31", 3);
    rect(22 + side, 22, 5, 17, "#d38a31", 3);
    rect(5 + side, 27, 7, 2, "#ffd46b", 1);
    rect(21 + side, 27, 7, 2, "#ffd46b", 1);
    oval(14 + side * 3, 15, 1.2, 1.3, "#f8d44e");
    oval(18 + side * 3, 15, 1.2, 1.3, "#f8d44e");
  }
  if (isPsychic) {
    rect(8, 20, 17, 21, "#151722", 6);
    rect(8, 20, 17, 2, "#31384d", 3);
    oval(16, 33, 13, 4, "rgba(102,194,111,0.38)");
  }
  if (isNinja) {
    rect(7, 19, 19, 22, "#1a1723", 5);
    rect(8, 23, 18, 3, "#8d5cff", 2);
    rect(23 + side, 18, 3, 26, "#bfc5d1", 2);
    rect(21 + side, 17, 7, 3, "#3d344f", 2);
  }

  // Front trim ribbon.
  rect(14, 20, 3, 18, trim, 2);
  rect(14, 20, 3, 1, "rgba(255,255,255,0.35)");

  // Head.
  rect(13, 14, 6, 5, skinShade, 2);
  oval(16 + side * 2, 15, 6, 7, skin);
  oval(13.5 + side * 4, 17, 1.4, 1, "rgba(196,90,70,0.32)");
  oval(18.5 + side * 4, 17, 1.4, 1, "rgba(196,90,70,0.32)");

  // Hair.
  if (isHelmetHero) {
    rect(8 + side * 2, 7, 16, 8, "#2f7d52", 5);
    rect(8 + side * 2, 8, 16, 2, "#6fcf83", 2);
  } else if (!isBaldHero) {
    rect(10 + side * 2, 9, 12, 6, hairShade, 5);
    rect(11 + side * 2, 8, 10, 6, hair, 5);
  } else {
    oval(16 + side * 2, 12, 6, 5, skin);
  }

  if (up || back) {
    if (!isBaldHero && !isHelmetHero) oval(16 + side * 2, 14, 7, 8, hair);
  } else {
    // Eyes.
    oval(14 + side * 3, 15, 1, 1.4, "#24120b");
    oval(18 + side * 3, 15, 1, 1.4, "#24120b");
    oval(14 + side * 3, 14.6, 0.4, 0.4, "rgba(255,255,255,0.7)");
    oval(18 + side * 3, 14.6, 0.4, 0.4, "rgba(255,255,255,0.7)");
    oval(16 + side * 3, 16.5, 0.9, 0.6, "rgba(120,60,30,0.32)");
    rect(15 + side * 3, 18, 3, 1, "#8b3a35", 1);
  }

  // Per-character head accessory.
  if (id === "player") {
    rect(9 + side * 2, 8, 14, 3, hair, 2);
    rect(13 + side * 2, 5, 7, 4, "#6b3d21", 3);
    rect(13 + side * 2, 5, 7, 1, "rgba(255,255,255,0.18)");
  } else if (isBlacksmith) {
    rect(8 + side * 2, 7, 16, 4, "#4a5568", 2);
    rect(8 + side * 2, 7, 16, 1, "rgba(255,255,255,0.22)");
    rect(8 + side * 2, 10, 18, 3, "#243044", 2);
    if (!back) {
      rect(13 + side * 2, 18, 8, 5, "#3b2418", 3);
      rect(13 + side * 2, 18, 8, 1, "rgba(255,255,255,0.18)");
    }
  } else if (isGardener) {
    rect(7 + side * 2, 7, 18, 7, "#5f7d4d", 4);
    rect(7 + side * 2, 7, 18, 1, "rgba(255,255,255,0.22)");
    rect(20 + side * 2, 10, 4, 5, "#3f5d3c", 2);
  } else if (isHelmetHero) {
    rect(7 + side * 2, 10, 18, 3, "#17432b", 2);
    rect(20 + side * 2, 11, 5, 5, "#17432b", 2);
  } else if (isPsychic) {
    rect(7 + side * 2, 9, 18, 5, "#4fcf75", 5);
    rect(9 + side * 2, 5, 11, 5, "#61dd82", 5);
  } else if (isNinja) {
    rect(8 + side * 2, 8, 18, 4, "#15111c", 3);
    rect(19 + side * 2, 9, 8, 3, "#8d5cff", 2);
  } else if (variant === 1) {
    rect(9 + side * 2, 9, 15, 3, "#592d37", 2);
  } else if (variant === 3) {
    rect(10 + side * 2, 8, 13, 2, "#315738", 1);
    oval(22 + side * 2, 8, 1.5, 1.5, "#f2d16b");
  } else if (isElder && !back) {
    rect(8 + side * 2, 8, 16, 4, "#e7dbbe", 3);
    rect(8 + side * 2, 8, 16, 1, "rgba(255,255,255,0.32)");
  }
}

/**
 * Build and register an 8-direction × 4-frame spritesheet for one actor on
 * the given scene. No-ops if the key already exists.
 */
export function ensureActorSpritesheet(
  scene: Phaser.Scene,
  key: string,
  id: string,
  fill: number,
  variant: number,
  appearance?: CharacterAppearance,
): void {
  if (scene.textures.exists(key)) return;
  const canvas = document.createElement("canvas");
  canvas.width = ACTOR_FRAME_W * 4;
  canvas.height = ACTOR_FRAME_H * FACING_ORDER.length;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = true;
  for (let dir = 0; dir < FACING_ORDER.length; dir += 1) {
    for (let frame = 0; frame < 4; frame += 1) {
      drawActorFrame(
        ctx,
        frame * ACTOR_FRAME_W,
        dir * ACTOR_FRAME_H,
        id,
        fill,
        variant,
        FACING_ORDER[dir]!,
        frame,
        appearance,
      );
    }
  }
  (
    scene.textures as unknown as {
      addSpriteSheet: (
        textureKey: string,
        source: HTMLCanvasElement,
        config: { frameWidth: number; frameHeight: number },
      ) => void;
    }
  ).addSpriteSheet(key, canvas, {
    frameWidth: ACTOR_FRAME_W,
    frameHeight: ACTOR_FRAME_H,
  });
}

/** Build a scene container holding the actor shadow + sprite. */
export function makeActor(
  scene: Phaser.Scene,
  id: string,
  fill: number,
  radius: number,
  appearance?: CharacterAppearance,
): Phaser.GameObjects.Container {
  const variant = [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 5;
  const styleKey = appearance ? `${appearance.sourceLook ?? ""}-${appearance.visualTags?.join("-") ?? ""}`.toLowerCase().replace(/[^a-z0-9]+/g, "-") : "default";
  const key = `ashbend-actor-${id}-${styleKey}`;
  ensureActorSpritesheet(scene, key, id, fill, variant, appearance);
  const shadow = scene.add.ellipse(0, radius + 12, radius * 2.35, radius * 0.72, 0x000000, 0.26);
  const sprite = scene.add.sprite(0, radius + 9, key, 0).setOrigin(0.5, 1).setScale(ACTOR_SCALE);
  return scene.add.container(0, 0, [shadow, sprite]).setDepth(id === "player" ? 80 : 70);
}
