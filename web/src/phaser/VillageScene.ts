import Phaser from "phaser";

import { ambientBarksForLocation } from "../../../src/ambient.ts";
import type { CombatMove } from "../../../src/combat.ts";
import { activeObjectives, type Objective } from "../../../src/objectives.ts";
import type { ActionType, InteractableProp, Location, Npc, World } from "../../../src/types.ts";
import { isNight, timeOfDay } from "../../../src/types.ts";
import { makeActor } from "./actor-render.ts";
import {
  AREA_LAYOUT,
  buildGroundLayer,
  COLLISION_RECTS,
  ITEM_PLACEMENTS,
  type RectArea as MapRectArea,
  TILE,
  TILE_SIZE,
  WORLD_H,
  WORLD_W,
} from "./VillageMap.ts";

const FALLBACK_VIEW_W = 1280;
const FALLBACK_VIEW_H = 720;
const PLAYER_SPEED = 190;
const PLAYER_RADIUS = 16;
const ARRIVE_DISTANCE = 8;
const INTERACT_DISTANCE = 54;
const MINIMAP_HUD_CLEARANCE = 18;
const USE_EXTERNAL_GROUND_TILES = true;

interface ActorState {
  graphic: Phaser.GameObjects.Container;
  nameplate: Phaser.GameObjects.Container;
  nameplateKey: string;
  bubble: Phaser.GameObjects.Text | null;
  status: Phaser.GameObjects.Text | null;
  flashUntil: number;
  home: Phaser.Math.Vector2;
  target: Phaser.Math.Vector2 | null;
  nextWanderAt: number;
  lastStepAt: number;
}

interface MinimapState {
  container: Phaser.GameObjects.Container;
  playerDot: Phaser.GameObjects.Arc;
  cameraView: Phaser.GameObjects.Rectangle;
  npcDots: Map<string, Phaser.GameObjects.Arc>;
  x: number;
  y: number;
  scale: number;
}

interface VillageSceneHandlers {
  onNpcClick?: (npcId: string) => void;
  onLocationClick?: (locationId: string) => void;
  onItemClick?: (itemId: string) => void;
  onPropClick?: (propId: string) => void;
}

interface RectArea extends Omit<MapRectArea, "door"> {
  door: Phaser.Math.Vector2;
  name: string;
}

interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface BuildingPalette {
  wall: number;
  wallDark: number;
  roof: number;
  roofDark: number;
  trim: number;
  sign: string;
}

interface CombatFxPalette {
  main: number;
  accent: number;
  label: string;
  shake: number;
}

interface AgentFxPalette {
  main: number;
  accent: number;
  label: string;
  symbol: string;
}

const BUILDING_PALETTES: Record<string, BuildingPalette> = {
  square: { wall: 0x5e6878, wallDark: 0x3f4857, roof: 0x8c96a6, roofDark: 0x515b6b, trim: 0xe0c978, sign: "Notice Hall" },
  forge: { wall: 0x8a654c, wallDark: 0x5d4232, roof: 0xb65c4b, roofDark: 0x71372e, trim: 0xe8bf76, sign: "Forge" },
  garden: { wall: 0x5f8156, wallDark: 0x3f5d3c, roof: 0x93b66e, roofDark: 0x5a794f, trim: 0xe2d58f, sign: "Herbs" },
  inn: { wall: 0x8c684a, wallDark: 0x604632, roof: 0xb47657, roofDark: 0x7a4335, trim: 0xf1ca7a, sign: "Lantern Inn" },
  bridge: { wall: 0x857058, wallDark: 0x574736, roof: 0x9c876c, roofDark: 0x685540, trim: 0xdcc27e, sign: "Old Bridge" },
  wood: { wall: 0x486b55, wallDark: 0x2f493a, roof: 0x6f9a62, roofDark: 0x41633f, trim: 0xdbcf84, sign: "Wood Gate" },
};

const ROOM_ENTRY_OVERRIDES: Record<string, { x: number; y: number }> = {
  forge: { x: 315, y: 292 },
  garden: { x: 1342, y: 298 },
  inn: { x: 842, y: 792 },
  bridge: { x: 356, y: 794 },
  wood: { x: 1192, y: 842 },
};

export class VillageScene extends Phaser.Scene {
  private handlers: VillageSceneHandlers;
  private ready = false;
  private world: World | null = null;
  private player?: Phaser.GameObjects.Container;
  private playerAppearanceKey = "";
  private playerNameplate?: Phaser.GameObjects.Container;
  private playerNameplateKey = "";
  private destination: Phaser.Math.Vector2 | null = null;
  private destinationQueue: Phaser.Math.Vector2[] = [];
  private destinationIgnoresCollision = false;
  private destinationMarker?: Phaser.GameObjects.Container;
  private pendingLocation: string | null = null;
  private pendingNpcId: string | null = null;
  private pendingItemId: string | null = null;
  private pendingPropId: string | null = null;
  private playerFacing = new Phaser.Math.Vector2(0, 1);
  private lastPlayerStepAt = 0;
  private actors = new Map<string, ActorState>();
  private itemSprites = new Map<string, Phaser.GameObjects.Container>();
  private propSprites = new Map<string, Phaser.GameObjects.Container>();
  private locationContainers = new Map<string, Phaser.GameObjects.Container>();
  private groundLayer?: Phaser.Tilemaps.TilemapLayer | Phaser.Tilemaps.TilemapGPULayer;
  private obstacles: Obstacle[] = [];
  private prompt?: Phaser.GameObjects.Text;
  private interactionCard?: Phaser.GameObjects.Container;
  private minimap?: MinimapState;
  private objectivePins: Phaser.GameObjects.Container[] = [];
  private tintRect?: Phaser.GameObjects.Rectangle;
  private lamps: Phaser.GameObjects.Container[] = [];
  private nextAmbientBarkAt = 0;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;

  constructor(handlers: VillageSceneHandlers = {}) {
    super("village");
    this.handlers = handlers;
  }

  preload() {
    this.load.spritesheet("russpuppy-rpg", "/assets/cc0/russpuppy/open_tileset_16.png", {
      frameWidth: 16,
      frameHeight: 16,
    });
  }

  create() {
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.createTileTextures();
    this.drawTilemap();
    this.drawVenueAtmosphere();
    this.drawDecorations();
    this.drawFireflies();
    this.drawAtmosphereParticles();
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.keys = this.input.keyboard?.addKeys("W,A,S,D,E") as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.setDestination(pointer.worldX, pointer.worldY);
    });
    this.prompt = this.add.text(0, 0, "", {
      fontFamily: "ui-sans-serif, system-ui",
      fontSize: "11px",
      color: "#f8f1c4",
      backgroundColor: "#10151d99",
      padding: { x: 7, y: 4 },
    }).setOrigin(0.5, 1).setDepth(200).setVisible(false);
    this.tintRect = this.add.rectangle(0, 0, this.viewportWidth(), this.viewportHeight(), 0x000000, 0).setOrigin(0).setScrollFactor(0).setDepth(190);
    this.createMinimap();
    this.scale.on("resize", this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.handleResize, this);
    });
    this.handleResize();
    this.ready = true;
    if (this.world) this.drawWorld(true);
  }

  setWorld(world: World) {
    const first = !this.world;
    this.world = world;
    if (!this.ready) return;
    this.drawWorld(first);
  }

  setCameraZoom(zoom: number, duration = 0) {
    if (duration > 0) {
      this.tweens.add({
        targets: this.cameras.main,
        zoom,
        duration,
        ease: "Cubic.Out",
      });
    } else {
      this.cameras.main.setZoom(zoom);
    }
  }

  previewPlayerMove(locationId: string) {
    this.setTravelDestination(locationId);
  }

  flashActor(actorId: string) {
    if (actorId === "player" && this.player) {
      const sprite = this.player.getAt(1) as Phaser.GameObjects.Sprite | undefined;
      sprite?.setTint(0xf8d44e);
      this.time.delayedCall(220, () => sprite?.setTint(0xffffff));
      return;
    }
    const actor = this.actors.get(actorId);
    if (actor) actor.flashUntil = this.time.now + 1600;
  }

  playCombatFx(targetId: string, style: CombatMove["style"] = "strike", moveLabel?: string, attackerId = "player") {
    const target = this.combatActorContainer(targetId);
    const attacker = this.combatActorContainer(attackerId);
    const x = target?.x ?? this.player?.x ?? this.cameras.main.midPoint.x;
    const y = target?.y ?? this.player?.y ?? this.cameras.main.midPoint.y;
    const colors: Record<CombatMove["style"], CombatFxPalette> = {
      strike: { main: 0xf8d44e, accent: 0xffffff, label: "HIT", shake: 0.006 },
      rush: { main: 0x9fc3ff, accent: 0xf8f1c4, label: "RUSH", shake: 0.008 },
      counter: { main: 0x7ed26d, accent: 0xeaf5ff, label: "COUNTER", shake: 0.006 },
      guard: { main: 0x8a98ac, accent: 0xeaf5ff, label: "GUARD", shake: 0.004 },
      special: { main: 0xe8846b, accent: 0xf8d44e, label: "SPECIAL", shake: 0.01 },
      finisher: { main: 0xf6d85f, accent: 0xffffff, label: "FINISH", shake: 0.014 },
    };
    const fx = colors[style];
    this.cameras.main.shake(style === "finisher" ? 230 : 140, fx.shake);
    this.playFightSceneStaging(x, y, moveLabel ?? fx.label, style, fx);
    this.playCombatActorMotion(attacker, target, style, fx);
    this.playStyleSignatureFx(x, y, style, fx);

    const burst = this.add.circle(x, y - 28, 10, fx.main, 0.82)
      .setStrokeStyle(3, fx.accent, 0.86)
      .setDepth(Math.round(y) + 160);
    const ring = this.add.circle(x, y - 28, 18)
      .setStrokeStyle(3, fx.main, 0.92)
      .setDepth(Math.round(y) + 159);
    const slash = this.add.rectangle(x, y - 30, style === "rush" ? 72 : 54, 5, fx.accent, 0.84)
      .setRotation(style === "counter" ? -0.62 : 0.42)
      .setDepth(Math.round(y) + 161);
    const impactArc = this.add.arc(x, y - 30, style === "finisher" ? 42 : 30, 210, 340, false, fx.main, 0.44)
      .setStrokeStyle(7, fx.main, 0.8)
      .setDepth(Math.round(y) + 160);
    const label = this.add.text(x, y - 72, fx.label, {
      fontFamily: "ui-sans-serif, system-ui",
      fontSize: style === "finisher" ? "17px" : "13px",
      color: "#10151d",
      backgroundColor: `#${fx.main.toString(16).padStart(6, "0")}ee`,
      padding: { x: 7, y: 3 },
      fontStyle: "bold",
    }).setOrigin(0.5).setDepth(Math.round(y) + 162);

    this.tweens.add({
      targets: burst,
      scale: { from: 0.6, to: style === "finisher" ? 3.2 : 2.4 },
      alpha: { from: 0.84, to: 0 },
      duration: 360,
      ease: "Sine.Out",
      onComplete: () => burst.destroy(),
    });
    this.tweens.add({
      targets: ring,
      scale: { from: 0.8, to: style === "finisher" ? 2.8 : 2.1 },
      alpha: { from: 0.92, to: 0 },
      duration: 420,
      ease: "Sine.Out",
      onComplete: () => ring.destroy(),
    });
    this.tweens.add({
      targets: slash,
      x: slash.x + (style === "rush" ? 28 : 12),
      alpha: { from: 0.84, to: 0 },
      scaleX: { from: 0.5, to: 1.25 },
      duration: 260,
      ease: "Sine.Out",
      onComplete: () => slash.destroy(),
    });
    this.tweens.add({
      targets: impactArc,
      scale: { from: 0.8, to: 1.7 },
      rotation: style === "counter" ? -0.5 : 0.5,
      alpha: { from: 0.86, to: 0 },
      duration: 360,
      ease: "Sine.Out",
      onComplete: () => impactArc.destroy(),
    });
    this.tweens.add({
      targets: label,
      y: label.y - 24,
      alpha: { from: 1, to: 0 },
      duration: 760,
      ease: "Sine.Out",
      onComplete: () => label.destroy(),
    });
  }

  playAgentActionFx(actorId: string, actionType: ActionType, text: string, fromDirector = false) {
    const actor = this.combatActorContainer(actorId);
    if (!actor) return;
    const fx = agentFxPalette(actionType, fromDirector);
    const x = actor.x;
    const y = actor.y - 38;
    const depth = Math.round(actor.y) + 175;
    const ring = this.add.circle(x, actor.y + 4, 20)
      .setStrokeStyle(3, fx.main, fromDirector ? 0.86 : 0.72)
      .setDepth(depth - 2);
    const pulse = this.add.circle(x, actor.y + 4, 6, fx.main, fromDirector ? 0.38 : 0.24)
      .setDepth(depth - 3);
    const sigil = this.add.container(x, y).setDepth(depth);
    const backing = this.add.rectangle(0, 0, 76, 24, 0x05070b, 0.86)
      .setStrokeStyle(1, fx.main, 0.72);
    const mark = this.add.text(-27, 0, fx.symbol, {
      fontFamily: "ui-sans-serif, system-ui",
      fontSize: "13px",
      color: `#${fx.accent.toString(16).padStart(6, "0")}`,
      fontStyle: "900",
    }).setOrigin(0.5);
    const label = this.add.text(-14, 0, actionFxCaption(text, fx.label), {
      fontFamily: "ui-sans-serif, system-ui",
      fontSize: "8px",
      color: "#f4f1e8",
      fontStyle: "900",
    }).setOrigin(0, 0.5);
    sigil.add([backing, mark, label]);

    this.tweens.add({
      targets: ring,
      scale: { from: 0.7, to: fromDirector ? 2.6 : 2.05 },
      alpha: { from: 0.82, to: 0 },
      duration: fromDirector ? 760 : 540,
      ease: "Cubic.Out",
      onComplete: () => ring.destroy(),
    });
    this.tweens.add({
      targets: pulse,
      scale: { from: 0.6, to: fromDirector ? 4.4 : 3.1 },
      alpha: { from: fromDirector ? 0.34 : 0.26, to: 0 },
      duration: fromDirector ? 700 : 480,
      ease: "Sine.Out",
      onComplete: () => pulse.destroy(),
    });
    this.tweens.add({
      targets: sigil,
      y: sigil.y - 24,
      alpha: { from: 1, to: 0 },
      duration: 1050,
      ease: "Cubic.Out",
      onComplete: () => sigil.destroy(),
    });

    if (actionType === "move") {
      this.playMoveTrail(actor, fx);
    } else if (actionType === "talk" || actionType === "gossip") {
      this.playDialoguePips(actor, fx);
    } else if (actionType === "confront") {
      this.playConfrontMark(actor, fx);
    } else if (fromDirector) {
      this.playDirectorBeam(actor, fx);
    }

    const sprite = actor.getAt(1) as Phaser.GameObjects.Sprite | undefined;
    sprite?.setTint(fx.accent);
    this.time.delayedCall(160, () => sprite?.setTint(0xffffff));
  }

  private playMoveTrail(actor: Phaser.GameObjects.Container, fx: AgentFxPalette) {
    for (let i = 0; i < 4; i += 1) {
      const dot = this.add.circle(
        actor.x - 30 + i * 18,
        actor.y + 24 + Math.sin(i) * 4,
        4,
        i % 2 === 0 ? fx.main : fx.accent,
        0.62,
      ).setDepth(Math.round(actor.y) + 168);
      this.tweens.add({
        targets: dot,
        x: dot.x + 24,
        y: dot.y - 10,
        alpha: 0,
        scale: { from: 0.8, to: 1.8 },
        delay: i * 42,
        duration: 360,
        ease: "Sine.Out",
        onComplete: () => dot.destroy(),
      });
    }
  }

  private playDialoguePips(actor: Phaser.GameObjects.Container, fx: AgentFxPalette) {
    for (let i = 0; i < 3; i += 1) {
      const pip = this.add.circle(actor.x - 18 + i * 18, actor.y - 72 - (i % 2) * 4, 5, fx.accent, 0.74)
        .setStrokeStyle(1, fx.main, 0.72)
        .setDepth(Math.round(actor.y) + 168);
      this.tweens.add({
        targets: pip,
        y: pip.y - 16,
        alpha: 0,
        scale: { from: 0.7, to: 1.5 },
        delay: i * 80,
        duration: 520,
        ease: "Cubic.Out",
        onComplete: () => pip.destroy(),
      });
    }
  }

  private playConfrontMark(actor: Phaser.GameObjects.Container, fx: AgentFxPalette) {
    const bolt = this.add.polygon(
      actor.x,
      actor.y - 64,
      [-7, -19, 7, -19, 1, -3, 10, -3, -4, 22, 0, 4, -10, 4],
      fx.main,
      0.82,
    )
      .setStrokeStyle(2, fx.accent, 0.72)
      .setDepth(Math.round(actor.y) + 170);
    this.tweens.add({
      targets: bolt,
      y: bolt.y - 18,
      rotation: 0.14,
      alpha: 0,
      scale: { from: 0.8, to: 1.42 },
      duration: 660,
      ease: "Back.Out",
      onComplete: () => bolt.destroy(),
    });
  }

  private playDirectorBeam(actor: Phaser.GameObjects.Container, fx: AgentFxPalette) {
    const height = this.viewportHeight();
    const beam = this.add.rectangle(actor.x, actor.y - height / 2, 42, height, fx.main, 0.12)
      .setDepth(Math.round(actor.y) + 166);
    const focus = this.add.circle(actor.x, actor.y - 24, 30)
      .setStrokeStyle(4, fx.accent, 0.74)
      .setDepth(Math.round(actor.y) + 171);
    this.tweens.add({
      targets: beam,
      alpha: 0,
      scaleX: { from: 0.55, to: 1.4 },
      duration: 700,
      ease: "Sine.Out",
      onComplete: () => beam.destroy(),
    });
    this.tweens.add({
      targets: focus,
      alpha: 0,
      scale: { from: 0.7, to: 2.2 },
      duration: 640,
      ease: "Cubic.Out",
      onComplete: () => focus.destroy(),
    });
  }

  private combatActorContainer(actorId: string | null | undefined): Phaser.GameObjects.Container | null {
    if (!actorId) return null;
    if (actorId === "player") return this.player ?? null;
    return this.actors.get(actorId)?.graphic ?? null;
  }

  private playFightSceneStaging(
    x: number,
    y: number,
    moveLabel: string,
    style: CombatMove["style"],
    fx: CombatFxPalette
  ) {
    const viewW = this.scale.width || FALLBACK_VIEW_W;
    const viewH = this.scale.height || FALLBACK_VIEW_H;
    const barH = style === "finisher" ? 44 : 28;
    const depth = 5000;
    const topBar = this.add.rectangle(0, 0, viewW, barH, 0x030509, 0.72)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(depth);
    const bottomBar = this.add.rectangle(0, viewH - barH, viewW, barH, 0x030509, 0.72)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(depth);
    const title = this.add.text(viewW / 2, barH / 2, moveLabel.toUpperCase(), {
      fontFamily: "ui-sans-serif, system-ui",
      fontSize: style === "finisher" ? "18px" : "13px",
      color: "#f8f1c4",
      fontStyle: "bold",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(depth + 1);
    const lines: Phaser.GameObjects.Rectangle[] = [];
    const lineCount = style === "finisher" ? 12 : 7;
    for (let i = 0; i < lineCount; i += 1) {
      const line = this.add.rectangle(
        x + Phaser.Math.Between(-84, 84),
        y - 28 + Phaser.Math.Between(-42, 42),
        Phaser.Math.Between(34, style === "rush" ? 100 : 74),
        2,
        i % 2 === 0 ? fx.accent : fx.main,
        0.68
      )
        .setRotation(Phaser.Math.FloatBetween(-0.45, 0.45))
        .setDepth(Math.round(y) + 158);
      lines.push(line);
      this.tweens.add({
        targets: line,
        x: line.x + Phaser.Math.Between(34, 86),
        alpha: 0,
        duration: 260 + i * 12,
        ease: "Sine.Out",
        onComplete: () => line.destroy(),
      });
    }
    this.tweens.add({
      targets: [topBar, bottomBar, title],
      alpha: 0,
      delay: style === "finisher" ? 520 : 300,
      duration: 260,
      ease: "Sine.Out",
      onComplete: () => {
        topBar.destroy();
        bottomBar.destroy();
        title.destroy();
      },
    });
  }

  private playCombatActorMotion(
    attacker: Phaser.GameObjects.Container | null,
    target: Phaser.GameObjects.Container | null,
    style: CombatMove["style"],
    fx: CombatFxPalette,
  ) {
    const focus = target ?? attacker ?? this.player;
    if (!focus) return;
    const direction = attacker && target && attacker !== target
      ? new Phaser.Math.Vector2(target.x - attacker.x, target.y - attacker.y).normalize()
      : new Phaser.Math.Vector2(1, 0);
    if (!Number.isFinite(direction.x) || !Number.isFinite(direction.y) || direction.lengthSq() === 0) {
      direction.set(1, 0);
    }

    const lungeByStyle: Record<CombatMove["style"], number> = {
      strike: 18,
      rush: 34,
      counter: -16,
      guard: 0,
      special: 26,
      finisher: 30,
    };
    const targetReelByStyle: Record<CombatMove["style"], number> = {
      strike: 14,
      rush: 20,
      counter: 10,
      guard: 4,
      special: 22,
      finisher: 34,
    };

    if (attacker) {
      const lunge = lungeByStyle[style];
      this.emitCombatAfterimage(attacker, style === "counter" ? fx.accent : fx.main, -direction.x * 12, -direction.y * 8, 0.36);
      if (style === "rush" || style === "finisher") {
        this.time.delayedCall(42, () => this.emitCombatAfterimage(attacker, fx.accent, -direction.x * 24, -direction.y * 12, 0.28));
      }
      if (lunge !== 0) {
        this.tweens.add({
          targets: attacker,
          x: attacker.x + direction.x * lunge,
          y: attacker.y + direction.y * lunge * 0.42,
          duration: style === "rush" ? 78 : 92,
          yoyo: true,
          ease: "Quad.Out",
        });
      }
    }

    if (target) {
      this.emitCombatAfterimage(target, fx.accent, direction.x * 8, direction.y * 5, 0.24);
      const sprite = target.getAt(1) as Phaser.GameObjects.Sprite | undefined;
      sprite?.setTint(fx.accent);
      this.time.delayedCall(120, () => sprite?.setTint(0xffffff));
      this.tweens.add({
        targets: target,
        x: target.x + direction.x * targetReelByStyle[style],
        y: target.y + (style === "finisher" ? -10 : direction.y * 7),
        duration: style === "finisher" ? 105 : 70,
        yoyo: true,
        ease: "Back.Out",
      });
    }

    if (style === "counter" && attacker) {
      this.tweens.add({
        targets: attacker,
        x: attacker.x - direction.x * 14,
        y: attacker.y - direction.y * 8,
        duration: 64,
        yoyo: true,
        ease: "Sine.Out",
      });
    }
  }

  private emitCombatAfterimage(
    actor: Phaser.GameObjects.Container,
    tint: number,
    offsetX: number,
    offsetY: number,
    alpha: number,
  ) {
    const sprite = actor.getAt(1) as Phaser.GameObjects.Sprite | undefined;
    if (!sprite) return;
    const ghost = this.add.sprite(actor.x + offsetX, actor.y + offsetY + sprite.y, sprite.texture.key, sprite.frame.name)
      .setOrigin(sprite.originX, sprite.originY)
      .setScale(actor.scaleX * sprite.scaleX, actor.scaleY * sprite.scaleY)
      .setRotation(actor.rotation + sprite.rotation)
      .setTint(tint)
      .setAlpha(alpha)
      .setDepth(Math.round(actor.y) - 1);
    this.tweens.add({
      targets: ghost,
      x: ghost.x - offsetX * 0.45,
      y: ghost.y - 8,
      alpha: 0,
      duration: 260,
      ease: "Sine.Out",
      onComplete: () => ghost.destroy(),
    });
  }

  private playStyleSignatureFx(
    x: number,
    y: number,
    style: CombatMove["style"],
    fx: CombatFxPalette,
  ) {
    if (style === "rush") {
      for (let i = 0; i < 5; i += 1) {
        const hit = this.add.circle(x - 42 + i * 18, y - 32 + Phaser.Math.Between(-10, 10), 5, i % 2 === 0 ? fx.main : fx.accent, 0.76)
          .setDepth(Math.round(y) + 164);
        this.tweens.add({
          targets: hit,
          scale: { from: 0.5, to: 2.2 },
          alpha: 0,
          delay: i * 34,
          duration: 240,
          ease: "Cubic.Out",
          onComplete: () => hit.destroy(),
        });
      }
      return;
    }

    if (style === "counter") {
      for (let i = 0; i < 2; i += 1) {
        const parry = this.add.arc(x, y - 30, 26 + i * 11, 35, 320, false)
          .setStrokeStyle(4, i === 0 ? fx.accent : fx.main, 0.86)
          .setDepth(Math.round(y) + 164);
        this.tweens.add({
          targets: parry,
          rotation: i === 0 ? 0.9 : -0.75,
          scale: 1.32,
          alpha: 0,
          duration: 330,
          ease: "Sine.Out",
          onComplete: () => parry.destroy(),
        });
      }
      return;
    }

    if (style === "guard") {
      const shield = this.add.arc(x, y - 30, 34, 205, 335, false)
        .setStrokeStyle(7, fx.accent, 0.74)
        .setDepth(Math.round(y) + 164);
      const brace = this.add.rectangle(x, y - 24, 46, 32, fx.main, 0.12)
        .setStrokeStyle(2, fx.accent, 0.48)
        .setDepth(Math.round(y) + 163);
      this.tweens.add({
        targets: [shield, brace],
        scale: { from: 0.8, to: 1.18 },
        alpha: 0,
        duration: 420,
        ease: "Sine.Out",
        onComplete: () => {
          shield.destroy();
          brace.destroy();
        },
      });
      return;
    }

    if (style === "special") {
      const sigil = this.add.star(x, y - 30, 6, 16, 34, fx.main, 0.38)
        .setStrokeStyle(2, fx.accent, 0.9)
        .setDepth(Math.round(y) + 163);
      for (let i = 0; i < 10; i += 1) {
        const angle = (Math.PI * 2 * i) / 10;
        const spark = this.add.rectangle(x + Math.cos(angle) * 18, y - 30 + Math.sin(angle) * 18, 14, 3, i % 2 ? fx.main : fx.accent, 0.72)
          .setRotation(angle)
          .setDepth(Math.round(y) + 164);
        this.tweens.add({
          targets: spark,
          x: x + Math.cos(angle) * 62,
          y: y - 30 + Math.sin(angle) * 42,
          alpha: 0,
          duration: 390,
          ease: "Cubic.Out",
          onComplete: () => spark.destroy(),
        });
      }
      this.tweens.add({
        targets: sigil,
        rotation: 1.2,
        scale: 1.6,
        alpha: 0,
        duration: 430,
        ease: "Sine.Out",
        onComplete: () => sigil.destroy(),
      });
      return;
    }

    if (style === "finisher") {
      const flash = this.add.rectangle(this.cameras.main.midPoint.x, this.cameras.main.midPoint.y, this.viewportWidth(), this.viewportHeight(), fx.accent, 0.16)
        .setScrollFactor(0)
        .setDepth(4999);
      const shock = this.add.circle(x, y - 30, 30)
        .setStrokeStyle(8, fx.main, 0.92)
        .setDepth(Math.round(y) + 165);
      this.tweens.add({
        targets: flash,
        alpha: 0,
        duration: 180,
        ease: "Sine.Out",
        onComplete: () => flash.destroy(),
      });
      this.tweens.add({
        targets: shock,
        scale: { from: 0.5, to: 4.6 },
        alpha: 0,
        duration: 520,
        ease: "Cubic.Out",
        onComplete: () => shock.destroy(),
      });
      return;
    }

    const spark = this.add.rectangle(x, y - 30, 64, 5, fx.accent, 0.86)
      .setRotation(-0.3)
      .setDepth(Math.round(y) + 164);
    this.tweens.add({
      targets: spark,
      x: spark.x + 22,
      scaleX: { from: 0.45, to: 1.35 },
      alpha: 0,
      duration: 260,
      ease: "Sine.Out",
      onComplete: () => spark.destroy(),
    });
  }

  showBubble(actorId: string, text: string) {
    const actor = this.actors.get(actorId);
    if (!actor) return;
    actor.bubble?.destroy();
    actor.bubble = this.add.text(actor.graphic.x, actor.graphic.y - 26, text, {
      fontFamily: "ui-sans-serif, system-ui",
      fontSize: "11px",
      color: "#e6e9ef",
      backgroundColor: "#161b24dd",
      padding: { x: 7, y: 5 },
      wordWrap: { width: 190 },
    }).setOrigin(0.5, 1).setDepth(180);
    this.tweens.add({
      targets: actor.bubble,
      alpha: { from: 1, to: 0 },
      y: actor.bubble.y - 16,
      duration: 4200,
      ease: "Sine.Out",
      onComplete: () => {
        actor.bubble?.destroy();
        actor.bubble = null;
      },
    });
  }

  override update(_time: number, delta: number) {
    if (!this.world || !this.player) return;
    this.movePlayer(delta / 1000);
    this.updateActors(delta / 1000);
    this.updateAmbientBarks();
    this.updatePrompt();
    this.updateTint();
    this.updateMinimap();
  }

  private drawWorld(first: boolean) {
    if (!this.world) return;
    this.drawLocations();
    this.syncPlayer(first);
    this.syncNpcs(first);
    this.syncItems();
    this.syncProps();
    this.syncObjectivePins();
    this.updateTint();
  }

  private createTileTextures() {
    if (this.textures.exists("ashment-tiles")) return;
    const tileCount = Object.keys(TILE).length;

    // Russpuppy CC0 tileset → ashment terrain mapping. Indices into the
    // 10-col × 11-row, 16×16-per-tile source grid, chosen by inspecting
    // open_tileset_16.png. If the texture didn't load (e.g. dev server
    // path miss), fall through to the procedural renderer below.
    const RUSSPUPPY_BY_TERRAIN: Record<number, number> = {
      [TILE.grass]: 10,
      [TILE.grassAlt]: 11,
      [TILE.path]: 20,
      [TILE.pathEdge]: 21,
      [TILE.water]: 0,
      [TILE.bridge]: 25,
      [TILE.plaza]: 22,
      [TILE.garden]: 12,
      [TILE.forest]: 13,
    };

    const tileset = USE_EXTERNAL_GROUND_TILES && this.textures.exists("russpuppy-rpg") ? this.textures.get("russpuppy-rpg") : null;
    const source = tileset?.getSourceImage() as
      | HTMLImageElement
      | HTMLCanvasElement
      | undefined;
    if (source) {
      const canvas = document.createElement("canvas");
      canvas.width = TILE_SIZE * tileCount;
      canvas.height = TILE_SIZE;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        const SRC = 16;
        const COLS = 10;
        for (const [tileIdxStr, srcIdx] of Object.entries(RUSSPUPPY_BY_TERRAIN)) {
          const tileIdx = Number(tileIdxStr);
          const sx = (srcIdx % COLS) * SRC;
          const sy = Math.floor(srcIdx / COLS) * SRC;
          const dx = tileIdx * TILE_SIZE;
          ctx.drawImage(source, sx, sy, SRC, SRC, dx, 0, TILE_SIZE, TILE_SIZE);
        }
        (
          this.textures as unknown as {
            addCanvas: (key: string, canvas: HTMLCanvasElement) => void;
          }
        ).addCanvas("ashment-tiles", canvas);
        return;
      }
    }

    // Fallback: procedural tile textures.
    const g = this.add.graphics();
    const drawTile = (index: number, color: number, accent: number, dark: number) => {
      const x = index * TILE_SIZE;
      g.fillStyle(color, 1);
      g.fillRect(x, 0, TILE_SIZE, TILE_SIZE);
      g.fillStyle(accent, 0.16);
      g.fillRect(x + 2, 2, TILE_SIZE - 4, 3);
      g.fillRect(x + 5, TILE_SIZE - 7, TILE_SIZE - 10, 3);
      g.fillStyle(dark, 0.015);
      g.fillRect(x, TILE_SIZE - 1, TILE_SIZE, 1);
      g.fillRect(x + TILE_SIZE - 1, 0, 1, TILE_SIZE);
      if (index === TILE.grass || index === TILE.grassAlt || index === TILE.forest) {
        g.lineStyle(1, accent, 0.12);
        for (let i = 0; i < 5; i += 1) {
          const sx = x + 4 + ((i * 9 + index * 3) % 24);
          const sy = 6 + ((i * 13 + index * 5) % 20);
          g.lineBetween(sx, sy + 4, sx + 2, sy);
        }
      }
      if (index === TILE.path || index === TILE.pathEdge || index === TILE.plaza) {
        g.fillStyle(accent, 0.08);
        for (let i = 0; i < 5; i += 1) {
          const sx = x + 4 + ((i * 11 + index) % 24);
          const sy = 5 + ((i * 7 + index * 2) % 22);
          g.fillRoundedRect(sx, sy, 8, 3, 1);
        }
      }
      if (index === TILE.water) {
        g.lineStyle(2, accent, 0.36);
        g.lineBetween(x + 4, 9, x + 28, 7);
        g.lineBetween(x + 2, 21, x + 25, 20);
      }
      if (index === TILE.bridge) {
        g.lineStyle(1, dark, 0.42);
        for (let i = 7; i < TILE_SIZE; i += 8) g.lineBetween(x, i, x + TILE_SIZE, i);
      }
      if (index === TILE.garden) {
        g.lineStyle(2, 0x8fbf63, 0.52);
        for (let i = 5; i < TILE_SIZE; i += 9) g.lineBetween(x + 4, i, x + TILE_SIZE - 4, i - 2);
      }
    };
    drawTile(TILE.grass, 0x3f6d3e, 0x6a9558, 0x18321f);
    drawTile(TILE.grassAlt, 0x386438, 0x719b59, 0x152a1b);
    drawTile(TILE.path, 0xc8aa75, 0xe1c98d, 0x786142);
    drawTile(TILE.pathEdge, 0x9b855e, 0xd5b77a, 0x5c4b36);
    drawTile(TILE.water, 0x274864, 0x6fa4c7, 0x1a3248);
    drawTile(TILE.bridge, 0x957b4e, 0xc9aa70, 0x5f452c);
    drawTile(TILE.plaza, 0x515967, 0x7b8493, 0x363d49);
    drawTile(TILE.garden, 0x35633d, 0xa5c76b, 0x24432b);
    drawTile(TILE.forest, 0x203f2c, 0x4d7f45, 0x12261a);
    g.generateTexture("ashment-tiles", TILE_SIZE * tileCount, TILE_SIZE);
    g.destroy();
  }

  private drawTilemap() {
    const map = this.make.tilemap({ data: buildGroundLayer(), tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
    const tiles = map.addTilesetImage("ashment-tiles", "ashment-tiles", TILE_SIZE, TILE_SIZE);
    if (tiles) {
      this.groundLayer = map.createLayer(0, tiles, 0, 0) ?? undefined;
      this.groundLayer?.setDepth(-20);
      // Pixel-art tiles are visible underneath the painterly atmosphere
      // overlay (which uses semi-transparent fills now).
      this.groundLayer?.setAlpha(1);
      this.groundLayer?.setCollision([TILE.water]);
    }
    this.add.text(58, 958, "South canal", { fontFamily: "ui-sans-serif, system-ui", fontSize: "13px", color: "#9ec8e6" }).setDepth(-6);
    this.add.text(1250, 965, "East edge", { fontFamily: "ui-sans-serif, system-ui", fontSize: "13px", color: "#a8d8a6" }).setDepth(-6);
  }

  private drawVenueAtmosphere() {
    const g = this.add.graphics().setDepth(-19);
    // Soft green wash sits over the pixel-art ground layer so the existing
    // painterly look survives, but tiles still read through.
    g.fillStyle(0x315f3d, 0.32);
    g.fillRect(0, 0, WORLD_W, WORLD_H);
    g.fillStyle(0x244c31, 0.44);
    g.fillEllipse(190, 150, 420, 180);
    g.fillEllipse(1230, 800, 520, 260);
    g.fillEllipse(1280, 230, 430, 260);
    g.fillEllipse(600, 930, 520, 180);
    g.fillStyle(0x426d44, 0.46);
    g.fillEllipse(780, 460, 540, 330);
    g.fillEllipse(500, 610, 360, 170);
    g.fillStyle(0x213e2a, 0.72);
    g.fillRoundedRect(1120, 705, 310, 250, 20);
    g.fillStyle(0x3d7741, 0.42);
    g.fillRoundedRect(1110, 115, 300, 230, 20);
    g.fillStyle(0x264b66, 0.96);
    g.fillRoundedRect(20, 862, WORLD_W - 40, 106, 22);
    g.fillStyle(0x6fa4c7, 0.18);
    g.fillRoundedRect(42, 886, WORLD_W - 84, 28, 14);
    g.lineStyle(92, 0xc8aa75, 0.92);
    g.lineBetween(805, 520, 315, 320);
    g.lineBetween(805, 520, 1250, 335);
    g.lineBetween(805, 520, 740, 755);
    g.lineBetween(740, 755, 430, 830);
    g.lineBetween(740, 755, 1130, 830);
    g.lineStyle(48, 0xe0c78e, 0.78);
    g.lineBetween(805, 520, 315, 320);
    g.lineBetween(805, 520, 1250, 335);
    g.lineBetween(805, 520, 740, 755);
    g.lineBetween(740, 755, 430, 830);
    g.lineBetween(740, 755, 1130, 830);
    g.lineStyle(64, 0xf0c97a, 0.12);
    g.lineBetween(805, 520, 315, 320);
    g.lineBetween(805, 520, 1250, 335);
    g.lineBetween(805, 520, 740, 755);
    g.lineBetween(740, 755, 430, 830);
    g.lineBetween(740, 755, 1130, 830);
    g.lineStyle(28, 0xf7e0a5, 0.1);
    g.lineBetween(805, 520, 315, 320);
    g.lineBetween(805, 520, 1250, 335);
    g.lineBetween(805, 520, 740, 755);
    g.lineBetween(740, 755, 430, 830);
    g.lineBetween(740, 755, 1130, 830);
    const pads: Array<[number, number, number, number, number]> = [
      [805, 520, 390, 280, 0xded6bd],
      [315, 250, 330, 240, 0xe2bc84],
      [1250, 240, 355, 260, 0xd6e6aa],
      [740, 845, 380, 250, 0xe8c591],
      [430, 830, 310, 190, 0xcbd6df],
      [1130, 830, 330, 220, 0xb9dca8],
    ];
    for (const [x, y, w, h, color] of pads) {
      g.fillStyle(color, 0.09);
      g.fillEllipse(x, y, w, h);
      g.lineStyle(2, color, 0.12);
      g.strokeEllipse(x, y, w * 0.9, h * 0.72);
    }
  }

  private drawDecorations() {
    const g = this.add.graphics();
    this.drawGroundPatches(g);
    const trees: Array<[number, number, number]> = [
      [70, 90, 1.0], [90, 210, 0.8], [520, 120, 0.9], [980, 90, 0.75],
      [1460, 105, 1.1], [1500, 245, 0.9], [90, 470, 0.95], [1450, 520, 0.8],
      [1040, 720, 0.75], [1500, 785, 1.0], [80, 760, 0.9], [1320, 610, 0.75],
      [250, 470, 0.66], [470, 635, 0.72], [1030, 560, 0.64], [1190, 670, 0.78],
      [1510, 930, 0.9], [350, 1010, 0.7], [930, 1015, 0.68],
    ];
    for (const [x, y, scale] of trees) {
      this.drawTree(g, x, y, scale);
    }
    for (let i = 0; i < 115; i += 1) {
      const x = 70 + ((i * 149) % (WORLD_W - 140));
      const y = 80 + ((i * 211) % (WORLD_H - 190));
      if (y > 825 && y < 950) continue;
      if (i % 5 === 0) this.drawRock(g, x, y, 0.72 + (i % 3) * 0.12);
      else this.drawWildflower(g, x, y, i);
    }
    g.lineStyle(3, 0x7d6243, 0.95);
    for (const x of [1085, 1400]) g.lineBetween(x, 105, x, 350);
    for (const y of [105, 350]) g.lineBetween(1085, y, 1400, y);
    this.drawFenceRun(g, 1085, 105, 1400, 105);
    this.drawFenceRun(g, 1085, 350, 1400, 350);
    this.drawFenceRun(g, 1085, 105, 1085, 350);
    this.drawFenceRun(g, 1400, 105, 1400, 350);
    this.drawLampPost(534, 662);
    this.drawLampPost(915, 640);
    this.drawLampPost(705, 736);
    this.drawLampPost(1020, 820);
    this.drawTownSquareLandmark(805, 524);
    this.drawMarketStall(612, 642, 0xb54e45, "goods");
    this.drawMarketStall(962, 578, 0x4f8b68, "tonics");
    this.drawMarketStall(506, 802, 0xd29b46, "food");
    this.drawGardenRows(g, 1144, 172, 5, 4);
    this.drawGardenRows(g, 1272, 172, 4, 4);
    this.drawSignpost(540, 528, "West", "South");
    this.drawSignpost(1018, 706, "East", "West");
    this.drawCampfire(1012, 948);
    this.drawCratesAndBarrels(g);
    this.drawWaterSparkles();
  }

  private drawGroundPatches(g: Phaser.GameObjects.Graphics) {
    const patches: Array<[number, number, number, number, number]> = [
      [170, 154, 160, 54, 0x244c31], [520, 110, 220, 62, 0x4f7f45],
      [1178, 88, 190, 52, 0x244c31], [103, 566, 180, 66, 0x244c31],
      [340, 650, 230, 78, 0x4f7f45], [1042, 532, 160, 58, 0x244c31],
      [1326, 818, 200, 76, 0x244c31], [602, 980, 240, 70, 0x4f7f45],
    ];
    for (const [x, y, w, h, color] of patches) {
      g.fillStyle(color, 0.11);
      g.fillEllipse(x, y, w, h);
      g.fillStyle(0xf2d16b, 0.08);
      g.fillEllipse(x - w * 0.12, y - h * 0.08, w * 0.35, h * 0.42);
    }
  }

  private drawTree(g: Phaser.GameObjects.Graphics, x: number, y: number, scale: number) {
    g.fillStyle(0x000000, 0.16);
    g.fillEllipse(x + 5 * scale, y + 32 * scale, 44 * scale, 18 * scale);
    g.fillStyle(0x65401f, 1);
    g.fillRect(x - 5 * scale, y + 12 * scale, 10 * scale, 28 * scale);
    g.fillStyle(0x422817, 0.65);
    g.fillRect(x + 1 * scale, y + 14 * scale, 3 * scale, 24 * scale);
    g.fillStyle(0x173b29, 1);
    g.fillCircle(x, y, 27 * scale);
    g.fillStyle(0x255e38, 0.96);
    g.fillCircle(x - 12 * scale, y + 8 * scale, 18 * scale);
    g.fillCircle(x + 13 * scale, y + 7 * scale, 17 * scale);
    g.fillStyle(0x6aa45b, 0.18);
    g.fillCircle(x - 9 * scale, y - 9 * scale, 10 * scale);
  }

  private drawWildflower(g: Phaser.GameObjects.Graphics, x: number, y: number, seed: number) {
    const color = seed % 4 === 0 ? 0xf2d16b : seed % 4 === 1 ? 0xe8846b : seed % 4 === 2 ? 0xdde88f : 0x9fc3ff;
    g.lineStyle(1, 0x75a060, 0.7);
    g.lineBetween(x, y + 4, x + 1, y - 1);
    g.fillStyle(color, 0.82);
    g.fillCircle(x, y, 2 + (seed % 2));
    g.fillStyle(0x315738, 0.65);
    g.fillCircle(x - 4, y + 5, 2);
    g.fillCircle(x + 5, y + 4, 2);
  }

  private drawRock(g: Phaser.GameObjects.Graphics, x: number, y: number, scale: number) {
    g.fillStyle(0x000000, 0.14);
    g.fillEllipse(x + 2, y + 5, 18 * scale, 7 * scale);
    g.fillStyle(0x6d746f, 0.78);
    g.fillEllipse(x, y, 13 * scale, 8 * scale);
    g.fillStyle(0xa1a79b, 0.42);
    g.fillEllipse(x - 3 * scale, y - 2 * scale, 5 * scale, 2 * scale);
  }

  private drawFenceRun(g: Phaser.GameObjects.Graphics, ax: number, ay: number, bx: number, by: number) {
    const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) / 30;
    for (let i = 0; i <= steps; i += 1) {
      const t = steps === 0 ? 0 : i / steps;
      const x = Phaser.Math.Linear(ax, bx, t);
      const y = Phaser.Math.Linear(ay, by, t);
      g.fillStyle(0x8a6a43, 1);
      g.fillRect(x - 2, y - 8, 4, 16);
      g.fillStyle(0xd2b16c, 0.42);
      g.fillRect(x - 1, y - 7, 1, 13);
    }
  }

  private drawLampPost(x: number, y: number) {
    // Build a self-contained container so updateTint can vary the whole
    // lamp's intensity by time-of-day without fighting the pulse tween.
    const glow = this.add.circle(0, -25, 34, 0xf7c76a, 0.12);
    const post = this.add.rectangle(0, 0, 4, 34, 0x422817);
    const lamp = this.add.circle(0, -20, 7, 0xf8d44e, 0.88).setStrokeStyle(2, 0x3a2719);
    const container = this.add.container(x, y, [glow, post, lamp]).setDepth(21);
    this.lamps.push(container);
    this.tweens.add({
      targets: [glow, lamp],
      alpha: { from: 0.45, to: 0.9 },
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
  }

  private drawTownSquareLandmark(x: number, y: number) {
    const base = this.add.ellipse(x, y + 10, 92, 31, 0x000000, 0.16).setDepth(13);
    const basin = this.add.ellipse(x, y, 78, 28, 0x566d7e, 0.95)
      .setStrokeStyle(3, 0xa7bdca, 0.78)
      .setDepth(14);
    const water = this.add.ellipse(x, y - 1, 58, 17, 0x6fa4c7, 0.72).setDepth(15);
    const statue = this.add.rectangle(x, y - 32, 18, 39, 0xaeb6b2, 0.9)
      .setStrokeStyle(2, 0x6d746f, 0.7)
      .setDepth(16);
    const head = this.add.circle(x, y - 58, 12, 0xaeb6b2, 0.95)
      .setStrokeStyle(2, 0x6d746f, 0.7)
      .setDepth(17);
    const sparkle = this.add.rectangle(x - 19, y - 3, 15, 2, 0xdceeff, 0.55).setDepth(18);
    this.tweens.add({
      targets: [water, sparkle],
      alpha: { from: 0.42, to: 0.82 },
      duration: 1300,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
    this.tweens.add({
      targets: [base, basin, statue, head],
      y: "+=1",
      duration: 2400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
  }

  private drawMarketStall(x: number, y: number, awningColor: number, label: string) {
    const shadow = this.add.ellipse(x + 6, y + 38, 96, 24, 0x000000, 0.18).setDepth(24);
    const counter = this.add.rectangle(x, y + 31, 88, 24, 0x6d4930, 0.96)
      .setStrokeStyle(2, 0x2d2018, 0.8)
      .setDepth(25);
    const canopy = this.add.polygon(x, y, [-52, 22, -36, -18, 36, -18, 52, 22], awningColor, 0.96)
      .setStrokeStyle(2, 0x2d2018, 0.8)
      .setDepth(27);
    for (let i = -2; i <= 2; i += 1) {
      this.add.rectangle(x + i * 18, y + 2, 11, 32, i % 2 === 0 ? 0xf2d16b : 0xf4f1e8, 0.45).setDepth(28);
    }
    this.add.rectangle(x - 38, y + 24, 5, 44, 0x422817).setDepth(26);
    this.add.rectangle(x + 38, y + 24, 5, 44, 0x422817).setDepth(26);
    this.add.text(x, y + 33, label, {
      fontFamily: "ui-sans-serif, system-ui",
      fontSize: "10px",
      color: "#f8f1c4",
      fontStyle: "bold",
    }).setOrigin(0.5).setDepth(29);
    this.tweens.add({
      targets: [shadow, counter, canopy],
      scaleY: { from: 1, to: 1.025 },
      duration: 2100,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
  }

  private drawGardenRows(g: Phaser.GameObjects.Graphics, x: number, y: number, cols: number, rows: number) {
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const px = x + col * 24;
        const py = y + row * 28;
        g.fillStyle(0x543821, 0.42);
        g.fillRoundedRect(px - 9, py - 5, 18, 22, 3);
        g.fillStyle((row + col) % 3 === 0 ? 0x9acb64 : (row + col) % 3 === 1 ? 0xe8846b : 0xf2d16b, 0.88);
        g.fillCircle(px - 3, py + 1, 4);
        g.fillCircle(px + 4, py + 4, 4);
        g.fillStyle(0x5f9d49, 0.8);
        g.fillCircle(px, py - 4, 3);
      }
    }
  }

  private drawSignpost(x: number, y: number, top: string, bottom: string) {
    this.add.ellipse(x + 2, y + 25, 42, 13, 0x000000, 0.16).setDepth(27);
    this.add.rectangle(x, y, 5, 48, 0x6d4930).setDepth(28);
    this.add.rectangle(x + 18, y - 15, 58, 17, 0x9a7545)
      .setStrokeStyle(1, 0x2d2018, 0.7)
      .setDepth(29);
    this.add.rectangle(x - 18, y + 3, 58, 17, 0x9a7545)
      .setStrokeStyle(1, 0x2d2018, 0.7)
      .setDepth(29);
    this.add.text(x + 18, y - 15, top, {
      fontFamily: "ui-sans-serif, system-ui",
      fontSize: "9px",
      color: "#2d2018",
      fontStyle: "bold",
    }).setOrigin(0.5).setDepth(30);
    this.add.text(x - 18, y + 3, bottom, {
      fontFamily: "ui-sans-serif, system-ui",
      fontSize: "9px",
      color: "#2d2018",
      fontStyle: "bold",
    }).setOrigin(0.5).setDepth(30);
  }

  private drawCampfire(x: number, y: number) {
    this.add.ellipse(x, y + 11, 62, 19, 0x000000, 0.2).setDepth(25);
    this.add.rectangle(x - 10, y + 7, 36, 6, 0x6d4930).setRotation(0.44).setDepth(26);
    this.add.rectangle(x + 10, y + 7, 36, 6, 0x6d4930).setRotation(-0.44).setDepth(26);
    const glow = this.add.circle(x, y - 3, 30, 0xf8a84e, 0.12).setDepth(27);
    const flameA = this.add.triangle(x, y - 7, 0, 18, 9, -10, 18, 18, 0xe8846b, 0.95).setDepth(28);
    const flameB = this.add.triangle(x + 1, y - 5, 0, 14, 7, -8, 14, 14, 0xf8d44e, 0.9).setDepth(29);
    this.tweens.add({
      targets: [glow, flameA, flameB],
      scaleY: { from: 0.86, to: 1.16 },
      alpha: { from: 0.55, to: 0.95 },
      duration: 380,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
    // Smoke puffs rise out of the campfire on a slow cadence. Each puff
    // is a short-lived circle that drifts up and right while fading.
    this.time.addEvent({
      delay: 420,
      loop: true,
      callback: () => {
        const puff = this.add
          .circle(x + Phaser.Math.Between(-3, 3), y - 12, 3.5, 0xdce5ec, 0.45)
          .setDepth(30);
        this.tweens.add({
          targets: puff,
          y: puff.y - 64,
          x: puff.x + Phaser.Math.Between(-14, 18),
          alpha: { from: 0.45, to: 0 },
          scale: { from: 0.9, to: 1.7 },
          duration: 2200,
          ease: "Sine.Out",
          onComplete: () => puff.destroy(),
        });
      },
    });
  }

  private drawCratesAndBarrels(g: Phaser.GameObjects.Graphics) {
    const crates: Array<[number, number]> = [[360, 336], [596, 688], [681, 471], [925, 617], [1114, 748], [1382, 654]];
    for (const [x, y] of crates) {
      g.fillStyle(0x000000, 0.14);
      g.fillEllipse(x + 5, y + 14, 45, 12);
      g.fillStyle(0x8a6038, 0.95);
      g.fillRect(x, y, 24, 24);
      g.lineStyle(2, 0x4f3221, 0.65);
      g.strokeRect(x, y, 24, 24);
      g.lineBetween(x, y, x + 24, y + 24);
      g.lineBetween(x + 24, y, x, y + 24);
      g.fillStyle(0x6d4930, 0.95);
      g.fillEllipse(x + 38, y + 13, 18, 24);
      g.lineStyle(1, 0xd2b16c, 0.45);
      g.lineBetween(x + 29, y + 8, x + 47, y + 8);
      g.lineBetween(x + 29, y + 18, x + 47, y + 18);
    }
  }

  private drawWaterSparkles() {
    // Continuous river-flow ripples — thin lines drifting left → right,
    // wrapping back at the river's end. Sits beneath sparkles + tilemap.
    for (let i = 0; i < 8; i += 1) {
      const startX = 60 + i * 200;
      const y = 878 + ((i * 23) % 60);
      const ripple = this.add.rectangle(startX, y, 26, 1, 0xbcdcef, 0.32).setDepth(-6);
      this.tweens.add({
        targets: ripple,
        x: WORLD_W - 80,
        alpha: { from: 0.32, to: 0.08 },
        duration: 9000 + i * 450,
        repeat: -1,
        onRepeat: () => {
          ripple.x = 60;
          ripple.alpha = 0.32;
        },
      });
    }
    for (let i = 0; i < 18; i += 1) {
      const sparkle = this.add.rectangle(80 + i * 78, 870 + ((i * 19) % 48), 18, 2, 0x9ec8e6, 0.28)
        .setDepth(-5);
      this.tweens.add({
        targets: sparkle,
        x: sparkle.x + 18,
        alpha: { from: 0.18, to: 0.5 },
        duration: 1400 + i * 90,
        delay: i * 60,
        yoyo: true,
        repeat: -1,
        ease: "Sine.InOut",
      });
    }
  }

  private drawFireflies() {
    for (let i = 0; i < 24; i += 1) {
      const x = 120 + ((i * 233) % (WORLD_W - 240));
      const y = 110 + ((i * 157) % (WORLD_H - 220));
      const mote = this.add.circle(x, y, 1.5 + (i % 2), i % 3 === 0 ? 0xf8d44e : 0xb5e48c, 0.18)
        .setDepth(38);
      this.tweens.add({
        targets: mote,
        x: x + Phaser.Math.Between(-18, 18),
        y: y + Phaser.Math.Between(-14, 14),
        alpha: { from: 0.08, to: 0.48 },
        duration: 1800 + i * 80,
        yoyo: true,
        repeat: -1,
        ease: "Sine.InOut",
      });
    }
  }

  private drawLocations() {
    if (!this.world) return;
    this.obstacles = COLLISION_RECTS.map(({ x, y, w, h }) => ({ x, y, w, h }));
    for (const container of this.locationContainers.values()) container.destroy();
    this.locationContainers.clear();

    for (const location of this.world.locations) {
      const area = this.area(location.id);
      if (!area) continue;
      const current = this.world.player.locationId === location.id;
      const palette = BUILDING_PALETTES[location.id] ?? BUILDING_PALETTES["inn"]!;
      const pieces = location.id === "square"
        ? this.plazaPieces(area, location.name, current)
        : this.buildingPieces(area, location.name, palette, current);
      const labelX = area.x + area.w / 2;
      const labelY = area.y + (location.id === "square" ? 22 : 18);
      const labelBg = this.add.rectangle(
        labelX,
        labelY,
        Math.max(92, location.name.length * 8 + 24),
        24,
        0x111821,
        current ? 0.72 : 0.48
      ).setStrokeStyle(1, current ? 0x9fc3ff : 0x8a98ac, current ? 0.75 : 0.28);
      const label = this.add.text(labelX, labelY, location.name, {
        fontFamily: "ui-sans-serif, system-ui",
        fontSize: "12px",
        color: current ? "#eaf5ff" : "#e6e9ef",
        fontStyle: "bold",
      }).setOrigin(0.5).setDepth(2);
      const hint = this.add.text(area.door.x, area.door.y + 10, "", {
        fontFamily: "ui-sans-serif, system-ui",
        fontSize: "10px",
        color: current ? "#9ec8ff" : "#f8d44e",
        fontStyle: "bold",
      }).setOrigin(0.5, 0).setAlpha(0);
      const trigger = this.add.zone(area.x, area.y, area.w, area.h).setOrigin(0).setInteractive();
      trigger.on("pointerup", () => this.travelTo(location.id));
      this.locationContainers.set(location.id, this.add.container(0, 0, [...pieces, labelBg, label, hint, trigger]));
    }
  }

  private plazaPieces(area: RectArea, _name: string, current: boolean) {
    const shadow = this.add.ellipse(area.x + area.w / 2 + 8, area.y + area.h - 8, area.w * 0.9, 58, 0x000000, 0.12);
    const slab = this.add.graphics();
    slab.fillStyle(0x59616f, 0.5);
    slab.fillRoundedRect(area.x + 18, area.y + 36, area.w - 36, area.h - 58, 12);
    slab.fillStyle(0x7a8492, 0.16);
    slab.fillRoundedRect(area.x + 38, area.y + 56, area.w - 76, area.h - 100, 8);
    slab.lineStyle(current ? 4 : 2, current ? 0x9fc3ff : 0xd8c27a, current ? 0.72 : 0.18);
    slab.strokeRoundedRect(area.x + 18, area.y + 36, area.w - 36, area.h - 58, 12);
    slab.lineStyle(1, 0xf1e2aa, 0.12);
    for (let x = area.x + 54; x < area.x + area.w - 38; x += 38) {
      slab.lineBetween(x, area.y + 58, x, area.y + area.h - 42);
    }
    for (let y = area.y + 72; y < area.y + area.h - 48; y += 30) {
      slab.lineBetween(area.x + 44, y, area.x + area.w - 44, y);
    }
    const pavers: Phaser.GameObjects.GameObject[] = [];
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 6; col += 1) {
        pavers.push(this.add.rectangle(area.x + 56 + col * 38, area.y + 68 + row * 30, 24, 2, 0xd8c27a, 0.1).setOrigin(0));
      }
    }
    const board = this.add.rectangle(area.x + area.w / 2, area.y + 77, 126, 42, 0x2d2018, 0.9)
      .setStrokeStyle(2, 0xd8c27a, 0.74);
    const boardTrim = this.add.rectangle(area.x + area.w / 2, area.y + 52, 142, 8, 0x8a6038, 0.95)
      .setStrokeStyle(1, 0x2d2018, 0.7);
    const notes: Phaser.GameObjects.GameObject[] = [
      this.add.rectangle(area.x + area.w / 2 - 35, area.y + 75, 19, 14, 0xf4f1e8, 0.85).setRotation(-0.08),
      this.add.rectangle(area.x + area.w / 2 + 4, area.y + 80, 23, 13, 0xf2d16b, 0.82).setRotation(0.05),
      this.add.rectangle(area.x + area.w / 2 + 41, area.y + 72, 18, 16, 0x9fc3ff, 0.76).setRotation(0.1),
    ];
    const bunting: Phaser.GameObjects.GameObject[] = [];
    for (let i = 0; i < 7; i += 1) {
      bunting.push(this.add.triangle(area.x + 42 + i * 36, area.y + 34, 0, 0, 8, 0, 4, 10, i % 2 === 0 ? 0xf8d44e : 0xe8846b, 0.88));
    }
    const stairs = this.add.rectangle(area.door.x, area.door.y - 2, 88, 16, 0xad9365, 0.5)
      .setStrokeStyle(1, 0xd8c27a, 0.34);
    const plazaKit: Phaser.GameObjects.GameObject[] = [];
    for (const [x, y] of [[area.x + 44, area.y + 62], [area.x + area.w - 44, area.y + 62], [area.x + 48, area.y + area.h - 52], [area.x + area.w - 48, area.y + area.h - 52]] as const) {
      plazaKit.push(this.add.rectangle(x, y + 10, 36, 18, 0x5f7d4d, 0.86).setStrokeStyle(1, 0x2f4a32, 0.56));
      plazaKit.push(this.add.circle(x - 8, y + 2, 9, 0x6aae4d, 0.92));
      plazaKit.push(this.add.circle(x + 8, y + 3, 8, 0x4f8b45, 0.92));
      plazaKit.push(this.add.circle(x + 5, y - 4, 3, 0xe8846b, 0.95));
    }
    for (const [x, y, horizontal] of [[area.x + 78, area.y + area.h - 46, true], [area.x + area.w - 78, area.y + area.h - 46, true], [area.x + 42, area.y + 122, false], [area.x + area.w - 42, area.y + 122, false]] as const) {
      plazaKit.push(this.add.ellipse(x, y + 9, horizontal ? 66 : 22, horizontal ? 14 : 58, 0x000000, 0.12));
      plazaKit.push(this.add.rectangle(x, y, horizontal ? 62 : 18, horizontal ? 14 : 58, 0x7b5638, 0.94).setStrokeStyle(1, 0x3d2a1e, 0.62));
      plazaKit.push(this.add.rectangle(x, y - (horizontal ? 5 : 0), horizontal ? 52 : 4, horizontal ? 3 : 48, 0xd2b16c, 0.32));
    }
    return [shadow, slab, ...pavers, ...plazaKit, boardTrim, board, ...notes, ...bunting, stairs];
  }

  private buildingPieces(area: RectArea, name: string, palette: BuildingPalette, current: boolean) {
    const roomX = area.x + 14;
    const roomY = area.y + 24;
    const roomW = area.w - 28;
    const roomH = area.h - 42;
    const isForge = palette.sign === "Forge";
    const isGarden = palette.sign === "Herbs";
    const pieces: Phaser.GameObjects.GameObject[] = [];
    const shell = this.add.graphics();
    shell.fillStyle(0x000000, 0.22);
    shell.fillEllipse(area.x + area.w / 2 + 10, area.y + area.h - 2, area.w * 1.04, 54);
    shell.fillStyle(palette.wallDark, 0.96);
    shell.fillRoundedRect(roomX - 12, roomY - 12, roomW + 24, roomH + 34, 12);
    shell.fillStyle(0x6a4a31, 0.98);
    for (const x of [roomX - 10, roomX + roomW - 4]) {
      shell.fillRoundedRect(x, roomY - 16, 14, roomH + 44, 4);
      shell.fillStyle(0xb58a57, 0.34);
      shell.fillRoundedRect(x + 3, roomY - 13, 3, roomH + 36, 2);
      shell.fillStyle(0x6a4a31, 0.98);
    }
    shell.fillRoundedRect(roomX - 16, roomY - 14, roomW + 32, 14, 4);
    shell.fillRoundedRect(roomX - 16, roomY + roomH - 4, roomW + 32, 16, 4);
    shell.fillStyle(palette.wall, 0.98);
    shell.fillRoundedRect(roomX, roomY, roomW, roomH, 8);
    shell.fillStyle(isForge ? 0x6b665e : isGarden ? 0xcdbb92 : 0xf2d39a, isForge ? 0.82 : 0.76);
    shell.fillRoundedRect(roomX + 16, roomY + 28, roomW - 32, roomH - 36, 6);
    shell.lineStyle(current ? 4 : 2, current ? 0x9fc3ff : palette.trim, current ? 0.78 : 0.28);
    shell.strokeRoundedRect(roomX - 2, roomY - 2, roomW + 4, roomH + 4, 9);
    shell.lineStyle(2, isForge ? 0x3e3a35 : 0x8b7657, isForge ? 0.22 : 0.18);
    for (let y = roomY + 52; y < roomY + roomH - 12; y += isForge ? 22 : 26) shell.lineBetween(roomX + 22, y, roomX + roomW - 22, y);
    for (let x = roomX + 38; x < roomX + roomW - 20; x += isForge ? 32 : 38) shell.lineBetween(x, roomY + 42, x, roomY + roomH - 16);
    if (isForge) {
      shell.fillStyle(0x302d2a, 0.2);
      for (let y = roomY + 58; y < roomY + roomH - 20; y += 44) {
        for (let x = roomX + 34; x < roomX + roomW - 30; x += 64) {
          shell.fillRoundedRect(x, y, 23, 13, 3);
        }
      }
    } else if (isGarden) {
      shell.fillStyle(0xf4e3b8, 0.18);
      for (let y = roomY + 48; y < roomY + roomH - 20; y += 36) {
        for (let x = roomX + 30; x < roomX + roomW - 20; x += 46) {
          shell.fillCircle(x, y, 2);
          shell.fillCircle(x + 14, y + 11, 1.6);
        }
      }
    }
    shell.fillStyle(palette.roof, 0.9);
    shell.fillRoundedRect(roomX + 12, roomY + 10, roomW - 24, 24, 6);
    shell.fillStyle(palette.trim, 0.52);
    shell.fillRoundedRect(roomX + 28, roomY + 18, roomW - 56, 5, 3);
    pieces.push(shell);

    const roomGlow = this.add.ellipse(area.door.x, area.door.y - 44, roomW * 0.64, roomH * 0.46, 0xf8d44e, 0.08);
    const threshold = this.add.rectangle(area.door.x, area.door.y - 4, 82, 14, 0xf0cf87, 0.7)
      .setStrokeStyle(1, 0x5f452c, 0.38);
    pieces.push(roomGlow, threshold);

    const decor = this.roomDecorPieces(area, palette, name);
    pieces.push(...decor);

    const doorGlow = this.add.circle(area.door.x, area.door.y - 16, 30, 0xf8d44e, 0.1);
    this.tweens.add({
      targets: doorGlow,
      alpha: { from: 0.07, to: 0.2 },
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
    return [...pieces, doorGlow];
  }

  private roomDecorPieces(area: RectArea, palette: BuildingPalette, _name: string) {
    const pieces: Phaser.GameObjects.GameObject[] = [];
    const cx = area.x + area.w / 2;
    const top = area.y + 76;
    const left = area.x + 46;
    const right = area.x + area.w - 50;
    const lower = area.y + area.h - 62;
    const makeBench = (x: number, y: number, w: number, color = 0x7b5638) => {
      const shadow = this.add.ellipse(x, y + 13, w + 16, 16, 0x000000, 0.15);
      const topRect = this.add.rectangle(x, y, w, 18, color, 0.96).setStrokeStyle(1, 0x2d2018, 0.55);
      const lip = this.add.rectangle(x, y - 7, w - 12, 4, 0xe2bd78, 0.42);
      pieces.push(shadow, topRect, lip);
    };
    const makePlanter = (x: number, y: number) => {
      pieces.push(this.add.rectangle(x, y + 9, 54, 14, 0x76543a, 0.92).setStrokeStyle(1, 0x2d2018, 0.6));
      for (let i = -1; i <= 1; i += 1) {
        pieces.push(this.add.circle(x + i * 14, y, 8, i === 0 ? 0x8ecf66 : 0x5d9d55, 0.9));
        pieces.push(this.add.circle(x + i * 14 + 5, y - 4, 3, i === 0 ? 0xf2d16b : 0xe8846b, 0.9));
      }
    };
    const makeToolRack = (x: number, y: number) => {
      pieces.push(this.add.rectangle(x, y, 88, 8, 0x6a4a31, 0.96).setStrokeStyle(1, 0x2d2018, 0.5));
      for (let i = -2; i <= 2; i += 1) {
        const tx = x + i * 16;
        pieces.push(this.add.rectangle(tx, y + 18, 4, 34, 0x3b312a, 0.94));
        pieces.push(this.add.circle(tx, y + 1, 3, 0xd5b77a, 0.75));
        if (i % 2 === 0) pieces.push(this.add.rectangle(tx, y + 35, 13, 5, 0xa1a79b, 0.92).setRotation(i * 0.12));
        else pieces.push(this.add.circle(tx, y + 37, 8, 0x6d746f, 0.92).setScale(0.62, 1));
      }
    };
    const makeCrateStack = (x: number, y: number) => {
      const boxes: Array<[number, number, number, number]> = [[-24, 4, 31, 27], [7, 5, 30, 26], [-9, -20, 35, 26]];
      for (const [ox, oy, w, h] of boxes) {
        pieces.push(this.add.rectangle(x + ox, y + oy, w, h, 0x8a6038, 0.96).setStrokeStyle(2, 0x4f3221, 0.76));
        pieces.push(this.add.line(x + ox, y + oy, -w / 2 + 3, -h / 2 + 3, w / 2 - 3, h / 2 - 3, 0x4f3221, 0.48));
        pieces.push(this.add.line(x + ox, y + oy, w / 2 - 3, -h / 2 + 3, -w / 2 + 3, h / 2 - 3, 0x4f3221, 0.48));
      }
    };
    const makeNoticeBoard = (x: number, y: number) => {
      pieces.push(this.add.rectangle(x, y + 4, 110, 56, 0x5b3d28, 0.98).setStrokeStyle(2, 0x2d2018, 0.7));
      pieces.push(this.add.rectangle(x, y, 94, 38, 0xb89561, 0.92).setStrokeStyle(1, 0x3e2b1e, 0.55));
      for (const [ox, oy, w, h, c] of [[-28, -6, 18, 17, 0xf4f1e8], [0, 1, 22, 15, 0xf2d16b], [28, -8, 17, 20, 0xe7dbbe]] as const) {
        pieces.push(this.add.rectangle(x + ox, y + oy, w, h, c, 0.88).setRotation(ox * 0.002));
        pieces.push(this.add.circle(x + ox - 4, y + oy - 4, 2, 0x7b5638, 0.8));
      }
      pieces.push(this.add.rectangle(x - 44, y + 46, 8, 34, 0x6a4a31, 0.95));
      pieces.push(this.add.rectangle(x + 44, y + 46, 8, 34, 0x6a4a31, 0.95));
    };
    const makeWoodTable = (x: number, y: number) => {
      pieces.push(this.add.ellipse(x + 2, y + 21, 84, 18, 0x000000, 0.13));
      pieces.push(this.add.rectangle(x, y, 82, 30, 0x8a6038, 0.97).setStrokeStyle(2, 0x4f3221, 0.72));
      pieces.push(this.add.rectangle(x, y - 10, 70, 5, 0xd2b16c, 0.32));
      pieces.push(this.add.circle(x - 24, y - 5, 6, 0xd4b483, 0.85));
      pieces.push(this.add.rectangle(x + 20, y - 2, 18, 13, 0xe7dbbe, 0.85).setRotation(0.08));
      pieces.push(this.add.rectangle(x + 39, y + 1, 15, 12, 0xe7dbbe, 0.8).setRotation(-0.1));
    };
    const makeVegetableBed = (x: number, y: number, w: number) => {
      pieces.push(this.add.rectangle(x, y + 6, w, 34, 0x68482f, 0.96).setStrokeStyle(2, 0x3d2a1e, 0.7));
      for (let i = 0; i < Math.floor(w / 26); i += 1) {
        const px = x - w / 2 + 18 + i * 26;
        pieces.push(this.add.circle(px - 4, y + 2, 8, 0x6aae4d, 0.94));
        pieces.push(this.add.circle(px + 4, y + 4, 7, 0x4f8b45, 0.94));
        if (i % 2 === 0) pieces.push(this.add.circle(px + 2, y - 3, 3, 0xe8846b, 0.92));
      }
    };

    if (palette.sign === "Forge") {
      makeBench(right - 22, lower - 12, 82, 0x6e4b32);
      makeToolRack(cx + 8, top - 8);
      makeCrateStack(left - 4, lower - 8);
      pieces.push(this.add.rectangle(left + 8, top + 34, 64, 58, 0x2e2d2a, 0.98).setStrokeStyle(3, 0x1f1d1b, 0.7));
      pieces.push(this.add.rectangle(left + 8, top + 58, 44, 20, 0x8a4a32, 0.95).setStrokeStyle(2, 0x2d2018, 0.7));
      pieces.push(this.add.circle(left + 8, top + 44, 26, 0xf8a84e, 0.22));
      pieces.push(this.add.triangle(left + 8, top + 48, 0, 19, 12, -14, 24, 19, 0xe8846b, 0.96));
      pieces.push(this.add.triangle(left + 12, top + 50, 0, 14, 9, -9, 18, 14, 0xf8d44e, 0.92));
      pieces.push(this.add.ellipse(cx - 4, lower - 16, 72, 26, 0x26303c, 0.95).setStrokeStyle(3, 0xa1a79b, 0.76));
      pieces.push(this.add.rectangle(cx - 4, lower + 2, 54, 28, 0x4a5362, 0.92).setStrokeStyle(2, 0x20252c, 0.64));
      pieces.push(this.add.rectangle(right - 4, top + 58, 58, 18, 0x4b3728, 0.95).setStrokeStyle(2, 0x2d2018, 0.65));
      pieces.push(this.add.rectangle(right - 4, top + 80, 42, 42, 0x795437, 0.95).setStrokeStyle(2, 0x2d2018, 0.65));
      pieces.push(this.add.rectangle(right - 21, top + 80, 8, 34, 0x9da49d, 0.95).setRotation(0.55));
      pieces.push(this.add.rectangle(right + 8, top + 76, 8, 40, 0x9da49d, 0.95).setRotation(-0.55));
      pieces.push(this.add.ellipse(left + 78, top + 64, 42, 28, 0x3b312a, 0.96).setStrokeStyle(2, 0x9da49d, 0.45));
    } else if (palette.sign === "Herbs") {
      pieces.push(this.add.rectangle(left + 28, top - 6, 72, 52, 0x7b5638, 0.96).setStrokeStyle(2, 0x3d2a1e, 0.65));
      pieces.push(this.add.rectangle(left + 28, top - 6, 60, 4, 0xd2b16c, 0.35));
      for (let i = 0; i < 6; i += 1) {
        pieces.push(this.add.circle(left + 1 + i * 11, top - 20 + (i % 2) * 14, 5, i % 2 ? 0x8fbf63 : 0xc9985b, 0.92));
      }
      pieces.push(this.add.rectangle(right - 18, top - 6, 46, 46, 0x815f3c, 0.96).setStrokeStyle(2, 0x3d2a1e, 0.64));
      pieces.push(this.add.circle(right - 18, top - 10, 18, 0x6fa4c7, 0.72).setStrokeStyle(3, 0x3b5f71, 0.66));
      makeVegetableBed(cx, top + 42, 124);
      makeVegetableBed(cx, top + 94, 124);
      makePlanter(left + 12, top + 72);
      makePlanter(right - 34, top + 72);
      makeWoodTable(right - 34, lower - 8);
      pieces.push(this.add.rectangle(cx, lower + 8, 82, 16, 0x7b5638, 0.92).setStrokeStyle(1, 0xe2d58f, 0.36));
    } else if (palette.sign === "Lantern Inn") {
      makeBench(cx, top + 48, 118, 0x7b5638);
      for (const x of [left + 20, right - 20]) {
        pieces.push(this.add.circle(x, lower - 8, 24, 0x8a6038, 0.92).setStrokeStyle(2, 0xe2bd78, 0.42));
        pieces.push(this.add.rectangle(x, lower - 8, 8, 36, 0xf0cf87, 0.12));
      }
      pieces.push(this.add.circle(cx, top + 14, 18, 0xf8d44e, 0.18));
      pieces.push(this.add.circle(cx, top + 14, 6, 0xf8d44e, 0.9));
    } else if (palette.sign === "Old Bridge") {
      pieces.push(this.add.rectangle(cx, top + 68, area.w - 86, 34, 0xa1855b, 0.9).setStrokeStyle(2, 0x4f3b2c, 0.55));
      for (let x = area.x + 70; x < area.x + area.w - 54; x += 32) {
        pieces.push(this.add.rectangle(x, top + 68, 5, 42, 0x5e4936, 0.8));
      }
      pieces.push(this.add.rectangle(cx, lower, 100, 18, 0x6fa4c7, 0.26));
    } else {
      makeBench(cx, top + 54, 106, 0x6d4930);
      makePlanter(left + 28, lower - 4);
      pieces.push(this.add.rectangle(right - 24, top + 52, 46, 54, 0x213e2a, 0.9).setStrokeStyle(1, 0xdbcf84, 0.45));
      pieces.push(this.add.rectangle(right - 24, top + 52, 20, 42, 0x426d44, 0.72));
    }
    if (palette.sign === "Notice Hall") {
      makeNoticeBoard(cx, top + 12);
    }
    return pieces;
  }

  private syncPlayer(first: boolean) {
    if (!this.world) return;
    const pos = this.area(this.world.player.locationId)?.door ?? new Phaser.Math.Vector2(560, 485);
    const appearanceKey = playerAppearanceKey(this.world);
    if (this.player && this.playerAppearanceKey !== appearanceKey) {
      const previous = new Phaser.Math.Vector2(this.player.x, this.player.y);
      this.player.destroy();
      this.player = undefined;
      this.playerNameplate?.destroy();
      this.playerNameplate = undefined;
      this.playerNameplateKey = "";
      this.player = makeActor(this, "player", playerFillForWorld(this.world), PLAYER_RADIUS, this.world.player.appearance);
      this.player.setPosition(previous.x, previous.y);
      this.playerAppearanceKey = appearanceKey;
      this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
      this.cameras.main.setZoom(1.35);
    }
    if (!this.player) {
      this.player = makeActor(this, "player", playerFillForWorld(this.world), PLAYER_RADIUS, this.world.player.appearance);
      this.player.setPosition(pos.x, pos.y);
      this.playerAppearanceKey = appearanceKey;
      this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
      this.cameras.main.setZoom(1.35);
    } else if (first) {
      this.player.setPosition(pos.x, pos.y);
    }
    this.syncPlayerNameplate();
  }

  private syncNpcs(initial: boolean) {
    if (!this.world) return;
    const wanted = new Set(this.world.npcs.filter((npc) => npc.id !== this.world?.player.characterId).map((npc) => npc.id));
    for (const id of [...this.actors.keys()]) {
      if (id !== "player" && !wanted.has(id)) {
        const actor = this.actors.get(id);
        actor?.graphic.destroy();
        actor?.nameplate.destroy();
        actor?.status?.destroy();
        actor?.bubble?.destroy();
        this.minimap?.npcDots.get(id)?.destroy();
        this.minimap?.npcDots.delete(id);
        this.actors.delete(id);
      }
    }
    for (const npc of this.world.npcs) {
      if (npc.id === this.world.player.characterId) continue;
      const target = this.npcTarget(npc);
      let actor = this.actors.get(npc.id);
      if (!actor) {
        const graphic = makeActor(this, npc.id, actorFillForNpc(npc), 14, npc.appearance);
        graphic.setSize(48, 62);
        graphic.setInteractive();
        graphic.on("pointerup", () => {
          this.queueNpcInteraction(npc.id);
        });
        graphic.on("pointerover", () => {
          this.tweens.add({ targets: graphic, scale: 1.08, duration: 200, ease: "Back.Out" });
          this.flashActor(npc.id);
        });
        graphic.on("pointerout", () => {
          this.tweens.add({ targets: graphic, scale: 1, duration: 200, ease: "Power2" });
        });
        actor = {
          graphic,
          nameplate: this.makeActorNameplate(npcNameplateText(npc), npcRoleTag(npc), actorFillForNpc(npc), npc.factionId === "challengers"),
          nameplateKey: npcNameplateKey(npc),
          bubble: null,
          status: null,
          flashUntil: 0,
          home: new Phaser.Math.Vector2(target.x, target.y),
          target: null,
          nextWanderAt: this.time.now + Phaser.Math.Between(700, 2800),
          lastStepAt: 0,
        };
        this.actors.set(npc.id, actor);
      }
      const nextNameplateKey = npcNameplateKey(npc);
      if (actor.nameplateKey !== nextNameplateKey) {
        actor.nameplate.destroy();
        actor.nameplate = this.makeActorNameplate(npcNameplateText(npc), npcRoleTag(npc), actorFillForNpc(npc), npc.factionId === "challengers");
        actor.nameplateKey = nextNameplateKey;
      }
      actor.home.set(target.x, target.y);
      if (initial) actor.graphic.setPosition(target.x, target.y);
      else if (!actor.target) this.tweens.add({ targets: actor.graphic, x: target.x, y: target.y, duration: 500, ease: "Sine.InOut" });
    }
  }

  private syncPlayerNameplate() {
    if (!this.world || !this.player) return;
    const label = this.world.player.name ?? "New Hero";
    const key = `player:${label}:${this.world.player.characterId ?? ""}`;
    if (!this.playerNameplate || this.playerNameplateKey !== key) {
      this.playerNameplate?.destroy();
      this.playerNameplate = this.makeActorNameplate(label, "Player", playerFillForWorld(this.world), false, true);
      this.playerNameplateKey = key;
    }
    this.positionNameplate(this.playerNameplate, this.player, -64, true);
  }

  private makeActorNameplate(
    name: string,
    role: string,
    color: number,
    hostile = false,
    player = false,
  ) {
    const displayName = shortActorName(name);
    const width = player ? 104 : 88;
    const height = 26;
    const border = hostile ? 0xe8846b : player ? 0x58a6ff : color;
    const bg = this.add.rectangle(0, 0, width, height, 0x05070b, 0.78)
      .setStrokeStyle(1, border, hostile || player ? 0.72 : 0.42);
    const badge = this.add.circle(-width / 2 + 15, 0, 10, color, 0.96)
      .setStrokeStyle(1, player ? 0xf8d44e : 0xf4f1e8, 0.46);
    const initials = this.add.text(-width / 2 + 15, 0, initialsForName(name), {
      fontFamily: "ui-sans-serif, system-ui",
      fontSize: "7px",
      color: "#05070b",
      fontStyle: "900",
    }).setOrigin(0.5);
    const roleText = this.add.text(-width / 2 + 30, -8, role.toUpperCase(), {
      fontFamily: "ui-sans-serif, system-ui",
      fontSize: "6px",
      color: hostile ? "#e8846b" : player ? "#9fc3ff" : "#cbd2df",
      fontStyle: "900",
    }).setOrigin(0, 0.5);
    const nameText = this.add.text(-width / 2 + 30, 5, truncateName(displayName, player ? 14 : 10), {
      fontFamily: "'Cinzel', serif",
      fontSize: "9px",
      color: "#f4f1e8",
      fontStyle: "900",
    }).setOrigin(0, 0.5);
    const container = this.add.container(0, 0, [bg, badge, initials, roleText, nameText])
      .setDepth(213)
      .setAlpha(player ? 0.96 : 0.88);
    container.setSize(width, height);
    return container;
  }

  private positionNameplate(
    nameplate: Phaser.GameObjects.Container,
    actor: Phaser.GameObjects.Container,
    offsetY: number,
    player: boolean,
    offsetX = 0,
  ) {
    nameplate.setPosition(actor.x + offsetX, actor.y + offsetY);
    nameplate.setDepth(Math.round(actor.y) + (player ? 42 : 38));
  }

  private nameplateOffsetForNpc(npc: Npc, baseY: number) {
    if (!this.world) return { x: 0, y: baseY };
    const sameLocation = this.world.npcs
      .filter((candidate) =>
        candidate.id !== this.world?.player.characterId &&
        candidate.locationId === npc.locationId &&
        !candidate.combat?.defeated
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    const index = Math.max(0, sameLocation.findIndex((candidate) => candidate.id === npc.id));
    const center = (sameLocation.length - 1) / 2;
    return {
      x: (index - center) * 72,
      y: baseY - (index % 2) * 8,
    };
  }

  private syncItems() {
    if (!this.world) return;
    const visible = new Set(this.world.items.filter((item) => item.locationId).map((item) => item.id));
    for (const [id, sprite] of [...this.itemSprites]) {
      if (!visible.has(id)) {
        sprite.destroy();
        this.itemSprites.delete(id);
      }
    }
    for (const item of this.world.items) {
      if (!item.locationId) continue;
      const pos = this.itemTarget(item.id, item.locationId);
      let sprite = this.itemSprites.get(item.id);
      if (!sprite) {
        const marker = this.makeItemMarker(item.id, item.name);
        marker.setSize(48, 48);
        marker.setInteractive();
        marker.on("pointerup", () => {
          this.queueItemInteraction(item.id);
        });
        this.itemSprites.set(item.id, marker);
        sprite = marker;
      }
      sprite.setPosition(pos.x, pos.y).setDepth(Math.round(pos.y) + 1);
    }
  }

  private syncProps() {
    if (!this.world) return;
    const visible = new Set((this.world.interactables ?? []).map((prop) => prop.id));
    for (const [id, sprite] of [...this.propSprites]) {
      if (!visible.has(id)) {
        sprite.destroy();
        this.propSprites.delete(id);
      }
    }
    for (const prop of this.world.interactables ?? []) {
      const pos = this.propTarget(prop);
      let sprite = this.propSprites.get(prop.id);
      if (!sprite) {
        const marker = this.makePropMarker(prop);
        marker.setSize(52, 52);
        marker.setInteractive();
        marker.on("pointerup", () => {
          this.queuePropInteraction(prop.id);
        });
        this.propSprites.set(prop.id, marker);
        sprite = marker;
      }
      const alpha = prop.inspected ? 0.58 : 1;
      sprite.setPosition(pos.x, pos.y).setDepth(Math.round(pos.y) + 2).setAlpha(alpha);
    }
  }

  private syncObjectivePins() {
    for (const pin of this.objectivePins) pin.destroy();
    this.objectivePins = [];
    if (!this.world) return;

    const objectives = activeObjectives(this.world).slice(0, 3);
    for (let i = 0; i < objectives.length; i += 1) {
      const objective = objectives[i]!;
      const position = this.objectivePosition(objective);
      if (!position) continue;
      this.objectivePins.push(this.makeObjectivePin(position.x, position.y, objective, i));
    }
  }

  private objectivePosition(objective: Objective): Phaser.Math.Vector2 | null {
    if (objective.targetType === "item") {
      const item = this.itemSprites.get(objective.targetId);
      if (item) return new Phaser.Math.Vector2(item.x, item.y - 26);
    }
    const area = this.area(objective.locationId);
    if (!area) return null;
    if (objective.targetType === "npc") {
      const actor = this.actors.get(objective.targetId);
      if (actor && this.world?.player.locationId === objective.locationId) {
        return new Phaser.Math.Vector2(actor.graphic.x, actor.graphic.y - 68);
      }
    }
    return new Phaser.Math.Vector2(area.door.x, area.door.y - 52);
  }

  private makeObjectivePin(x: number, y: number, objective: Objective, index: number) {
    const color = objective.status === "active" ? 0xf8d44e : 0x9fc3ff;
    const halo = this.add.circle(0, 0, 18, color, objective.status === "active" ? 0.16 : 0.1);
    const ring = this.add.circle(0, 0, 13).setStrokeStyle(2, color, 0.9);
    const diamond = this.add.rectangle(0, 0, 10, 10, color, 0.92).setRotation(Math.PI / 4);
    const label = this.add.text(0, -28, index === 0 ? objective.text : objective.questTitle, {
      fontFamily: "ui-sans-serif, system-ui",
      fontSize: "10px",
      color: "#10151d",
      backgroundColor: objective.status === "active" ? "#f8d44eee" : "#9fc3ffee",
      padding: { x: 6, y: 3 },
      wordWrap: { width: 154 },
      align: "center",
    }).setOrigin(0.5, 1);
    const pin = this.add.container(x, y, [halo, ring, diamond, label]).setDepth(Math.round(y) + 90);
    this.tweens.add({
      targets: [halo, ring],
      scale: { from: 0.86, to: 1.18 },
      alpha: { from: 0.78, to: 0.32 },
      duration: 1100 + index * 130,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
    this.tweens.add({
      targets: pin,
      y: y - 5,
      duration: 1350 + index * 100,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
    return pin;
  }

  private itemTarget(itemId: string, locationId: string) {
    const placement = ITEM_PLACEMENTS[itemId];
    if (placement && placement.locationId === locationId) return { x: placement.x, y: placement.y };
    const area = this.area(locationId) ?? this.area("square")!;
    const offsets: Record<string, [number, number]> = {
      lantern: [area.w * 0.35, area.h - 42],
      rumor_note: [area.w * 0.58, area.h - 38],
      bellows_leather: [area.w * 0.42, area.h - 56],
      blue_ember: [area.w * 0.72, area.h - 46],
    };
    const [ox, oy] = offsets[itemId] ?? [area.w * 0.5, area.h - 42];
    return { x: area.x + ox, y: area.y + oy };
  }

  private propTarget(prop: InteractableProp) {
    const area = this.area(prop.locationId) ?? this.area("square")!;
    const offsets: Record<string, [number, number]> = {
      forge_tool_rack: [area.w * 0.66, area.h * 0.42],
      bridge_scars: [area.w * 0.46, area.h * 0.62],
      inn_notice: [area.w * 0.5, area.h * 0.36],
      training_timer: [area.w * 0.66, area.h * 0.42],
      hero_kiosk_report: [area.w * 0.5, area.h * 0.36],
      sonic_challenge_marks: [area.w * 0.46, area.h * 0.62],
    };
    const [ox, oy] = offsets[prop.id] ?? [area.w * 0.36, area.h * 0.48];
    return { x: area.x + ox, y: area.y + oy };
  }

  private makePropMarker(prop: InteractableProp) {
    const color = prop.relatedQuestId ? 0x9fc3ff : 0xf8d44e;
    const glow = this.add.circle(0, -14, 18, color, prop.inspected ? 0.08 : 0.16);
    const ring = this.add.circle(0, -14, 11).setStrokeStyle(2, color, prop.inspected ? 0.42 : 0.9);
    const glyph = this.add.text(0, -15, "?", {
      fontFamily: "ui-sans-serif, system-ui",
      fontSize: "15px",
      color: "#10151d",
      fontStyle: "bold",
    }).setOrigin(0.5);
    const label = this.add.text(0, 7, prop.name, {
      fontFamily: "ui-sans-serif, system-ui",
      fontSize: "9px",
      color: "#eaf5ff",
      backgroundColor: "#10151d99",
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5, 0).setVisible(false);
    const marker = this.add.container(0, 0, [glow, ring, glyph, label]);
    marker.on("pointerover", () => label.setVisible(true));
    marker.on("pointerout", () => label.setVisible(false));
    this.tweens.add({
      targets: [glow, ring],
      scale: { from: 0.9, to: 1.18 },
      alpha: { from: prop.inspected ? 0.22 : 0.82, to: prop.inspected ? 0.08 : 0.34 },
      duration: 1300,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
    return marker;
  }

  private makeItemMarker(itemId: string, name: string) {
    const frameByItem: Record<string, number> = {
      shears: 39,
      lantern: 35,
      rumor_note: 34,
      bellows_leather: 40,
      blue_ember: 36,
    };
    const glowColor = itemId === "blue_ember" ? 0x58a6ff : 0xf8d44e;
    const glow = this.add.circle(0, -14, itemId === "blue_ember" ? 24 : 16, glowColor, itemId === "blue_ember" ? 0.22 : 0.12);
    const base = this.textures.exists("russpuppy-rpg")
      ? this.add.image(0, 0, "russpuppy-rpg", frameByItem[itemId] ?? 34).setOrigin(0.5, 1).setScale(2.05)
      : this.add.circle(0, -10, 8, glowColor, 0.95);
    const label = this.add.text(0, 8, name, {
      fontFamily: "ui-sans-serif, system-ui",
      fontSize: "9px",
      color: "#f8f1c4",
      backgroundColor: "#10151d99",
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5, 0).setVisible(false);
    const marker = this.add.container(0, 0, [glow, base, label]);
    marker.on("pointerover", () => label.setVisible(true));
    marker.on("pointerout", () => label.setVisible(false));
    this.tweens.add({
      targets: marker,
      y: "-=4",
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
    return marker;
  }

  private showItemCard(itemId: string, name: string, description: string) {
    this.interactionCard?.destroy();
    const width = Math.min(360, this.viewportWidth() - 48);
    const height = 78;
    const x = 24;
    const y = this.viewportHeight() - height - 24;
    const bg = this.add.rectangle(x, y, width, height, 0x10151d, 0.9)
      .setOrigin(0)
      .setStrokeStyle(1, itemId === "blue_ember" ? 0x58a6ff : 0xf8d44e, 0.72)
      .setScrollFactor(0);
    const title = this.add.text(x + 16, y + 14, name, {
      fontFamily: "ui-sans-serif, system-ui",
      fontSize: "14px",
      color: "#f4f1e8",
      fontStyle: "bold",
    }).setScrollFactor(0);
    const line = this.add.text(x + 16, y + 38, description, {
      fontFamily: "ui-sans-serif, system-ui",
      fontSize: "11px",
      color: "#cbd2df",
      wordWrap: { width: width - 32 },
    }).setScrollFactor(0);
    this.interactionCard = this.add.container(0, 0, [bg, title, line]).setDepth(240);
    this.tweens.add({
      targets: this.interactionCard,
      alpha: { from: 1, to: 0 },
      delay: 3000,
      duration: 420,
      onComplete: () => {
        this.interactionCard?.destroy();
        this.interactionCard = undefined;
      },
    });
  }

  private showPropCard(prop: InteractableProp) {
    this.interactionCard?.destroy();
    const width = Math.min(420, this.viewportWidth() - 48);
    const height = 92;
    const x = 24;
    const y = this.viewportHeight() - height - 24;
    const bg = this.add.rectangle(x, y, width, height, 0x10151d, 0.92)
      .setOrigin(0)
      .setStrokeStyle(1, 0x9fc3ff, 0.78)
      .setScrollFactor(0);
    const title = this.add.text(x + 16, y + 13, prop.name, {
      fontFamily: "ui-sans-serif, system-ui",
      fontSize: "14px",
      color: "#f4f1e8",
      fontStyle: "bold",
    }).setScrollFactor(0);
    const line = this.add.text(x + 16, y + 36, prop.inspected ? prop.inspectText : prop.description, {
      fontFamily: "ui-sans-serif, system-ui",
      fontSize: "11px",
      color: "#cbd2df",
      wordWrap: { width: width - 32 },
    }).setScrollFactor(0);
    this.interactionCard = this.add.container(0, 0, [bg, title, line]).setDepth(240);
    this.tweens.add({
      targets: this.interactionCard,
      alpha: { from: 1, to: 0 },
      delay: 3800,
      duration: 420,
      onComplete: () => {
        this.interactionCard?.destroy();
        this.interactionCard = undefined;
      },
    });
  }

  private queueNpcInteraction(npcId: string) {
    if (!this.world || !this.player) return;
    const npc = this.world.npcs.find((candidate) => candidate.id === npcId);
    const actor = this.actors.get(npcId);
    if (!npc || !actor) return;
    if (npc.locationId !== this.world.player.locationId) {
      this.travelTo(npc.locationId);
      return;
    }
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, actor.graphic.x, actor.graphic.y) <= INTERACT_DISTANCE) {
      this.showNpcCard(npc);
      this.handlers.onNpcClick?.(npc.id);
      return;
    }
    this.setDestination(actor.graphic.x, actor.graphic.y + 22, { npcId });
  }

  private queueItemInteraction(itemId: string) {
    if (!this.world || !this.player) return;
    const item = this.world.items.find((candidate) => candidate.id === itemId);
    const sprite = this.itemSprites.get(itemId);
    if (!item || !sprite) return;
    if (item.locationId !== this.world.player.locationId) {
      if (item.locationId) this.travelTo(item.locationId);
      return;
    }
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, sprite.x, sprite.y) <= INTERACT_DISTANCE) {
      this.showItemCard(item.id, item.name, item.description ?? "Useful somehow.");
      this.handlers.onItemClick?.(item.id);
      return;
    }
    this.setDestination(sprite.x, sprite.y + 16, { itemId });
  }

  private queuePropInteraction(propId: string) {
    if (!this.world || !this.player) return;
    const prop = (this.world.interactables ?? []).find((candidate) => candidate.id === propId);
    const sprite = this.propSprites.get(propId);
    if (!prop || !sprite) return;
    if (prop.locationId !== this.world.player.locationId) {
      this.travelTo(prop.locationId);
      return;
    }
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, sprite.x, sprite.y) <= INTERACT_DISTANCE) {
      this.showPropCard(prop);
      this.handlers.onPropClick?.(prop.id);
      return;
    }
    this.setDestination(sprite.x, sprite.y + 18, { propId });
  }

  private resolvePendingInteraction() {
    const locationId = this.pendingLocation;
    const npcId = this.pendingNpcId;
    const itemId = this.pendingItemId;
    const propId = this.pendingPropId;
    this.clearDestination();
    if (locationId) {
      this.handlers.onLocationClick?.(locationId);
      return;
    }
    if (itemId && this.world) {
      const item = this.world.items.find((candidate) => candidate.id === itemId);
      if (item?.locationId === this.world.player.locationId) {
        this.showItemCard(item.id, item.name, item.description ?? "Useful somehow.");
        this.handlers.onItemClick?.(item.id);
      }
      return;
    }
    if (propId && this.world) {
      const prop = (this.world.interactables ?? []).find((candidate) => candidate.id === propId);
      if (prop?.locationId === this.world.player.locationId) {
        this.showPropCard(prop);
        this.handlers.onPropClick?.(prop.id);
      }
      return;
    }
    if (npcId && this.world) {
      const npc = this.world.npcs.find((candidate) => candidate.id === npcId);
      if (npc?.locationId === this.world.player.locationId) {
        this.showNpcCard(npc);
        this.handlers.onNpcClick?.(npc.id);
      }
    }
  }

  // Actor canvas-render helpers (drawActorFrame, ensureActorSpritesheet,
  // makeActor, shade, hex) live in ./actor-render.ts now.


  private movePlayer(dt: number) {
    if (!this.player) return;
    const velocity = this.keyboardVelocity();
    if (velocity.lengthSq() > 0) {
      this.clearDestination();
      this.playerFacing = velocity.clone().normalize();
      velocity.normalize().scale(PLAYER_SPEED * dt);
      this.tryMove(velocity.x, velocity.y);
      this.updateCharacterPose(this.player, true, this.playerFacing, true);
      this.emitPlayerFootstep();
      return;
    }
    if (!this.destination) {
      this.updateCharacterPose(this.player, false, this.playerFacing, true);
      return;
    }
    const delta = new Phaser.Math.Vector2(this.destination.x - this.player.x, this.destination.y - this.player.y);
    const distance = delta.length();
    if (distance <= ARRIVE_DISTANCE) {
      if (this.destinationQueue.length > 0) {
        this.destination = this.destinationQueue.shift() ?? null;
        return;
      }
      this.updateCharacterPose(this.player, false, this.playerFacing, true);
      this.resolvePendingInteraction();
      return;
    }
    this.playerFacing = delta.clone().normalize();
    delta.normalize().scale(Math.min(PLAYER_SPEED * dt, distance));
    if (this.destinationIgnoresCollision) {
      this.player.x = Phaser.Math.Clamp(this.player.x + delta.x, PLAYER_RADIUS, WORLD_W - PLAYER_RADIUS);
      this.player.y = Phaser.Math.Clamp(this.player.y + delta.y, PLAYER_RADIUS, WORLD_H - PLAYER_RADIUS);
    } else {
      this.tryMove(delta.x, delta.y);
    }
    this.updateCharacterPose(this.player, true, this.playerFacing, true);
    this.emitPlayerFootstep();
  }

  private keyboardVelocity() {
    const v = new Phaser.Math.Vector2(0, 0);
    if (this.cursors?.left.isDown || this.keys?.["A"]?.isDown) v.x -= 1;
    if (this.cursors?.right.isDown || this.keys?.["D"]?.isDown) v.x += 1;
    if (this.cursors?.up.isDown || this.keys?.["W"]?.isDown) v.y -= 1;
    if (this.cursors?.down.isDown || this.keys?.["S"]?.isDown) v.y += 1;
    return v;
  }

  private tryMove(dx: number, dy: number) {
    if (!this.player) return;
    const before = { x: this.player.x, y: this.player.y };
    this.player.x = Phaser.Math.Clamp(this.player.x + dx, PLAYER_RADIUS, WORLD_W - PLAYER_RADIUS);
    if (this.collides(this.player.x, this.player.y)) this.player.x = before.x;
    this.player.y = Phaser.Math.Clamp(this.player.y + dy, PLAYER_RADIUS, WORLD_H - PLAYER_RADIUS);
    if (this.collides(this.player.x, this.player.y)) this.player.y = before.y;
  }

  private collides(x: number, y: number) {
    return this.collidesWithObstacle(x, y) || this.tileBlocks(x, y);
  }

  private collidesWithObstacle(x: number, y: number) {
    return this.obstacles.some((o) =>
      x + PLAYER_RADIUS > o.x && x - PLAYER_RADIUS < o.x + o.w &&
      y + PLAYER_RADIUS > o.y && y - PLAYER_RADIUS < o.y + o.h
    );
  }

  private tileBlocks(x: number, y: number) {
    const tile = this.groundLayer?.getTileAtWorldXY(x, y, true);
    return tile?.index === TILE.water;
  }

  private travelTo(locationId: string) {
    this.setTravelDestination(locationId);
  }

  private setTravelDestination(locationId: string) {
    const area = this.area(locationId);
    if (!area || !this.player) return;
    const target = this.locationEntryPoint(area);
    const waypoints = this.travelWaypoints(locationId, target);
    if (waypoints.length === 0) {
      this.showDestinationMarker(target.x, target.y, false);
      return;
    }
    this.destination = waypoints.shift() ?? null;
    this.destinationQueue = waypoints;
    this.destinationIgnoresCollision = true;
    this.pendingLocation = locationId;
    this.pendingNpcId = null;
    this.pendingItemId = null;
    this.showDestinationMarker(target.x, target.y, true);
  }

  private travelWaypoints(locationId: string, target: Phaser.Math.Vector2): Phaser.Math.Vector2[] {
    if (!this.player) return [];
    const segments: Phaser.Math.Vector2[] = [];
    const currentArea = this.world ? this.area(this.world.player.locationId) : null;
    let from = new Phaser.Math.Vector2(this.player.x, this.player.y);

    if (currentArea && currentArea.id !== "square" && currentArea.id !== locationId) {
      const out = this.findPath(from.x, from.y, currentArea.door.x, currentArea.door.y);
      if (out.length === 0) return [];
      segments.push(...out);
      from = new Phaser.Math.Vector2(currentArea.door.x, currentArea.door.y);
    }

    if (locationId !== "square") {
      const area = this.area(locationId);
      if (!area) return [];
      const toDoor = this.findPath(from.x, from.y, area.door.x, area.door.y);
      if (toDoor.length === 0) return [];
      segments.push(...toDoor);
      from = new Phaser.Math.Vector2(area.door.x, area.door.y);
    }

    const intoRoom = this.findPath(from.x, from.y, target.x, target.y);
    if (intoRoom.length === 0) return locationId === "square" ? segments : [...segments, target];
    segments.push(...intoRoom);
    return dedupeCloseWaypoints(segments);
  }

  private locationEntryPoint(area: RectArea): Phaser.Math.Vector2 {
    if (area.id === "square") return new Phaser.Math.Vector2(area.door.x, area.door.y);
    const override = ROOM_ENTRY_OVERRIDES[area.id];
    if (override && !this.tileBlocks(override.x, override.y) && !this.collidesWithObstacle(override.x, override.y)) {
      return new Phaser.Math.Vector2(override.x, override.y);
    }
    const candidates: Phaser.Math.Vector2[] = [];
    for (let y = area.y + area.h - 54; y >= area.y + 62; y -= 18) {
      for (const offset of [0, -42, 42, -78, 78, -112, 112]) {
        candidates.push(new Phaser.Math.Vector2(area.x + area.w / 2 + offset, y));
      }
    }
    candidates.push(new Phaser.Math.Vector2(area.door.x, area.door.y));
    return candidates.find((point) =>
      point.x > area.x + PLAYER_RADIUS &&
      point.x < area.x + area.w - PLAYER_RADIUS &&
      point.y > area.y + PLAYER_RADIUS &&
      point.y < area.y + area.h - PLAYER_RADIUS &&
      !this.tileBlocks(point.x, point.y) &&
      !this.collidesWithObstacle(point.x, point.y)
    ) ?? new Phaser.Math.Vector2(area.door.x, area.door.y);
  }

  private setDestination(
    x: number,
    y: number,
    pending: { locationId?: string | null; npcId?: string | null; itemId?: string | null; propId?: string | null } = {}
  ) {
    const clampedX = Phaser.Math.Clamp(x, PLAYER_RADIUS, WORLD_W - PLAYER_RADIUS);
    const clampedY = Phaser.Math.Clamp(y, PLAYER_RADIUS, WORLD_H - PLAYER_RADIUS);
    if (this.tileBlocks(clampedX, clampedY) || this.collidesWithObstacle(clampedX, clampedY)) {
      this.showDestinationMarker(clampedX, clampedY, false);
      return;
    }
    const waypoints = this.player ? this.findPath(this.player.x, this.player.y, clampedX, clampedY) : [new Phaser.Math.Vector2(clampedX, clampedY)];
    if (waypoints.length === 0) {
      this.showDestinationMarker(clampedX, clampedY, false);
      return;
    }
    this.destination = waypoints.shift() ?? null;
    this.destinationQueue = waypoints;
    this.destinationIgnoresCollision = false;
    this.pendingLocation = pending.locationId ?? null;
    this.pendingNpcId = pending.npcId ?? null;
    this.pendingItemId = pending.itemId ?? null;
    this.pendingPropId = pending.propId ?? null;
    this.showDestinationMarker(clampedX, clampedY, true);
  }

  private findPath(fromX: number, fromY: number, toX: number, toY: number) {
    const cols = Math.floor(WORLD_W / TILE_SIZE);
    const rows = Math.floor(WORLD_H / TILE_SIZE);
    const start = this.tileCoord(fromX, fromY);
    const goal = this.tileCoord(toX, toY);
    const startKey = `${start.x},${start.y}`;
    const goalKey = `${goal.x},${goal.y}`;
    if (startKey === goalKey) return [new Phaser.Math.Vector2(toX, toY)];

    const queue = [start];
    const cameFrom = new Map<string, string | null>([[startKey, null]]);
    const directions = [
      { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
      { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 },
    ];

    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index]!;
      if (`${current.x},${current.y}` === goalKey) break;
      for (const direction of directions) {
        const next = { x: current.x + direction.x, y: current.y + direction.y };
        const key = `${next.x},${next.y}`;
        if (cameFrom.has(key)) continue;
        if (next.x < 0 || next.y < 0 || next.x >= cols || next.y >= rows) continue;
        if (!this.tileIsWalkable(next.x, next.y)) continue;
        if (direction.x !== 0 && direction.y !== 0 && (!this.tileIsWalkable(current.x + direction.x, current.y) || !this.tileIsWalkable(current.x, current.y + direction.y))) continue;
        cameFrom.set(key, `${current.x},${current.y}`);
        queue.push(next);
      }
    }

    if (!cameFrom.has(goalKey)) return [];
    const reversed: Array<{ x: number; y: number }> = [];
    let key: string | null = goalKey;
    while (key) {
      const [x, y] = key.split(",").map(Number);
      if (Number.isFinite(x) && Number.isFinite(y)) reversed.push({ x: x!, y: y! });
      key = cameFrom.get(key) ?? null;
    }
    const tiles = reversed.reverse();
    const waypoints: Phaser.Math.Vector2[] = [];
    let previousDirection = "";
    for (let i = 1; i < tiles.length; i += 1) {
      const previous = tiles[i - 1]!;
      const current = tiles[i]!;
      const next = tiles[i + 1];
      const direction = `${Math.sign(current.x - previous.x)},${Math.sign(current.y - previous.y)}`;
      if (next && direction === previousDirection) continue;
      previousDirection = direction;
      waypoints.push(new Phaser.Math.Vector2(current.x * TILE_SIZE + TILE_SIZE / 2, current.y * TILE_SIZE + TILE_SIZE / 2));
    }
    waypoints.push(new Phaser.Math.Vector2(toX, toY));
    return waypoints;
  }

  private tileCoord(x: number, y: number) {
    return {
      x: Phaser.Math.Clamp(Math.floor(x / TILE_SIZE), 0, Math.floor(WORLD_W / TILE_SIZE) - 1),
      y: Phaser.Math.Clamp(Math.floor(y / TILE_SIZE), 0, Math.floor(WORLD_H / TILE_SIZE) - 1),
    };
  }

  private tileIsWalkable(tileX: number, tileY: number) {
    const x = tileX * TILE_SIZE + TILE_SIZE / 2;
    const y = tileY * TILE_SIZE + TILE_SIZE / 2;
    return !this.tileBlocks(x, y) && !this.collidesWithObstacle(x, y);
  }

  private clearDestination() {
    this.destination = null;
    this.destinationQueue = [];
    this.destinationIgnoresCollision = false;
    this.pendingLocation = null;
    this.pendingNpcId = null;
    this.pendingItemId = null;
    this.pendingPropId = null;
    this.destinationMarker?.destroy();
    this.destinationMarker = undefined;
  }

  private showDestinationMarker(x: number, y: number, valid: boolean) {
    this.destinationMarker?.destroy();
    const color = valid ? 0xf8d44e : 0xe96a5f;
    const ring = this.add.circle(0, 0, valid ? 13 : 10).setStrokeStyle(2, color, 0.92);
    const dot = this.add.circle(0, 0, 3, color, 0.95);
    const shadow = this.add.circle(0, 0, valid ? 17 : 13, 0x000000, 0.18);
    this.destinationMarker = this.add.container(x, y, [shadow, ring, dot]).setDepth(Math.round(y) + 2);
    this.tweens.add({
      targets: ring,
      scale: { from: 0.65, to: 1.35 },
      alpha: { from: 1, to: valid ? 0.15 : 0 },
      duration: valid ? 720 : 280,
      repeat: valid ? -1 : 0,
      ease: "Sine.Out",
      onComplete: () => {
        if (!valid) this.clearDestination();
      },
    });
  }

  private updateActors(dt: number) {
    for (const [id, actor] of this.actors) {
      const npc = id === "player" ? null : this.world?.npcs.find((n) => n.id === id);
      const defeated = Boolean(npc?.combat?.defeated);
      const was = new Phaser.Math.Vector2(actor.graphic.x, actor.graphic.y);
      const walking = defeated ? false : this.updateNpcWander(actor, dt);
      const facing = walking ? new Phaser.Math.Vector2(actor.graphic.x - was.x, actor.graphic.y - was.y).normalize() : new Phaser.Math.Vector2(0, 1);
      this.updateCharacterPose(actor.graphic, walking, facing, false, this.time.now < actor.flashUntil ? 0xf8d44e : undefined);
      if (defeated) this.applyDefeatedPose(actor.graphic);
      if (walking && this.time.now - actor.lastStepAt > 390) {
        actor.lastStepAt = this.time.now;
        this.emitFootstep(actor.graphic.x, actor.graphic.y + 20, 0.34);
      }
      actor.graphic.setDepth(Math.round(actor.graphic.y));
      const nameplateOffset = npc ? this.nameplateOffsetForNpc(npc, npc.combat?.defeated ? -34 : -58) : { x: 0, y: -58 };
      this.positionNameplate(actor.nameplate, actor.graphic, nameplateOffset.y, false, nameplateOffset.x);
      actor.nameplate.setAlpha(npc?.combat?.defeated ? 0.56 : 0.9);
      actor.bubble?.setPosition(actor.graphic.x, actor.graphic.y - 26);

      const playerDist = this.player ? Phaser.Math.Distance.Between(this.player.x, this.player.y, actor.graphic.x, actor.graphic.y) : 999;
      const mapStatus = npc ? this.npcMapStatus(npc, playerDist) : null;
      const shouldShowStatus = Boolean(mapStatus) && !actor.bubble;

      if (shouldShowStatus) {
        const labelText = mapStatus!.text;
        const statusY = actor.graphic.y + (npc?.combat ? -86 : -82);
        if (!actor.status) {
          actor.status = this.add.text(actor.graphic.x, statusY - 4, labelText, {
            fontFamily: "'Cinzel', serif",
            fontSize: "7px",
            fontStyle: "900",
            color: mapStatus!.color,
            backgroundColor: mapStatus!.background,
            padding: { x: 6, y: 3 },
          }).setOrigin(0.5, 1).setDepth(214).setAlpha(0);

          this.tweens.add({ targets: actor.status, alpha: 1, y: statusY, duration: 400, ease: "Cubic.Out" });
        } else {
          actor.status
            .setText(labelText)
            .setColor(mapStatus!.color)
            .setBackgroundColor(mapStatus!.background)
            .setPosition(actor.graphic.x, statusY)
            .setVisible(true)
            .setAlpha(1);
        }
      } else if (actor.status) {
        if (actor.status.visible && actor.status.alpha > 0.5) {
          this.tweens.add({
            targets: actor.status,
            alpha: 0,
            y: actor.graphic.y - 90,
            duration: 300,
            ease: "Cubic.In",
            onComplete: () => { actor.status?.setVisible(false); }
          });
        }
      }
    }
    this.player?.setDepth(Math.round(this.player.y) + 5);
    if (this.playerNameplate && this.player) this.positionNameplate(this.playerNameplate, this.player, -64, true);
  }

  private npcMapStatus(npc: Npc, playerDist: number): { text: string; color: string; background: string } | null {
    if (npc.combat?.defeated) {
      return { text: "DOWN", color: "#10151d", background: "#f6d85fee" };
    }
    if (npc.combat && playerDist < 420) {
      const hpPct = Math.round((npc.combat.hp / Math.max(1, npc.combat.maxHp)) * 100);
      if (hpPct >= 100 && npc.combat.posture >= 100) return null;
      const color = hpPct <= 30 ? "#f47272" : hpPct <= 65 ? "#f8d44e" : "#f4f1e8";
      return { text: `${hpPct}% HP · ${npc.combat.posture} PST`, color, background: "rgba(5, 5, 7, 0.9)" };
    }
    const intent = npc.plan?.currentIntent;
    if (intent && playerDist < 260) {
      const palette: Partial<Record<string, string>> = {
        help: "#7ed26d",
        ask: "#9fc3ff",
        confront: "#f8d44e",
        gossip: "#e8846b",
        investigate: "#f4f1e8",
        move: "#cbd2df",
        escalate: "#f47272",
      };
      return { text: intent.kind.toUpperCase(), color: palette[intent.kind] ?? "#f8d44e", background: "rgba(5, 5, 7, 0.85)" };
    }
    return null;
  }

  private applyDefeatedPose(actor: Phaser.GameObjects.Container) {
    const sprite = actor.getAt(1) as Phaser.GameObjects.Sprite | undefined;
    const shadow = actor.getAt(0) as Phaser.GameObjects.Ellipse | undefined;
    if (sprite) {
      sprite.setTint(0x8a98ac);
      sprite.setAlpha(0.72);
      sprite.setRotation(Phaser.Math.DegToRad(78));
      sprite.y = PLAYER_RADIUS + 22;
      sprite.scaleX = 0.92;
      sprite.scaleY = 0.92;
    }
    if (shadow) {
      shadow.setScale(1.36, 0.7);
      shadow.setAlpha(0.16);
    }
  }

  private drawAtmosphereParticles() {
    // 1. Falling Petals / Leaves (Slightly pinkish/greenish)
    const petalCount = 32;
    for (let i = 0; i < petalCount; i++) {
      const x = Phaser.Math.Between(0, WORLD_W);
      const y = Phaser.Math.Between(-200, WORLD_H);
      const color = Phaser.Math.RND.pick([0xfff0f3, 0xd4e9d7, 0xfaf9f0]);
      const petal = this.add.rectangle(x, y, 4, 2, color, 0.45).setDepth(2000);

      this.tweens.add({
        targets: petal,
        x: x + Phaser.Math.Between(100, 400),
        y: y + Phaser.Math.Between(400, 1000),
        rotation: 6.28,
        duration: Phaser.Math.Between(12000, 24000),
        repeat: -1,
        ease: "Linear",
        onRepeat: () => {
          petal.setPosition(Phaser.Math.Between(-200, WORLD_W), -20);
        }
      });
    }

    // 2. Dust Motes (Caught in the light beams)
    const moteCount = 60;
    for (let i = 0; i < moteCount; i++) {
      const x = Phaser.Math.Between(0, WORLD_W);
      const y = Phaser.Math.Between(0, WORLD_H);
      const mote = this.add.circle(x, y, 1, 0xffffff, 0.12).setDepth(1500);

      this.tweens.add({
        targets: mote,
        x: x + Phaser.Math.Between(-50, 50),
        y: y + Phaser.Math.Between(-50, 50),
        alpha: { from: 0.04, to: 0.22 },
        duration: Phaser.Math.Between(4000, 8000),
        yoyo: true,
        repeat: -1,
        ease: "Sine.InOut"
      });
    }
  }

  private updateAmbientBarks() {
    if (!this.world || this.time.now < this.nextAmbientBarkAt) return;
    this.nextAmbientBarkAt = this.time.now + Phaser.Math.Between(6200, 9800);
    const barks = ambientBarksForLocation(this.world, this.world.player.locationId)
      .filter((bark) => {
        const actor = this.actors.get(bark.actorId);
        return Boolean(actor) && !actor!.bubble;
      });
    if (barks.length === 0) return;
    const bark = barks[(Math.floor(this.time.now / 1000) + this.world.tick) % barks.length]!;
    this.showBubble(bark.actorId, bark.text);
  }

  private updateNpcWander(actor: ActorState, dt: number) {
    if (this.time.now >= actor.nextWanderAt && !actor.target) {
      actor.target = this.pickWanderTarget(actor);
      actor.nextWanderAt = this.time.now + Phaser.Math.Between(1800, 5400);
    }
    if (!actor.target) return false;
    const delta = new Phaser.Math.Vector2(actor.target.x - actor.graphic.x, actor.target.y - actor.graphic.y);
    const distance = delta.length();
    if (distance <= 4) {
      actor.target = null;
      return false;
    }
    delta.normalize().scale(Math.min(42 * dt, distance));
    actor.graphic.x += delta.x;
    actor.graphic.y += delta.y;
    return true;
  }

  private pickWanderTarget(actor: ActorState) {
    for (let i = 0; i < 8; i += 1) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const distance = Phaser.Math.Between(18, 58);
      const x = Phaser.Math.Clamp(actor.home.x + Math.cos(angle) * distance, PLAYER_RADIUS, WORLD_W - PLAYER_RADIUS);
      const y = Phaser.Math.Clamp(actor.home.y + Math.sin(angle) * distance, PLAYER_RADIUS, WORLD_H - PLAYER_RADIUS);
      if (!this.tileBlocks(x, y) && !this.collidesWithObstacle(x, y)) return new Phaser.Math.Vector2(x, y);
    }
    return actor.home.clone();
  }

  private updateCharacterPose(
    actor: Phaser.GameObjects.Container,
    walking: boolean,
    facing: Phaser.Math.Vector2,
    isPlayer: boolean,
    fillOverride?: number
  ) {
    const sprite = actor.getAt(1) as Phaser.GameObjects.Sprite | undefined;
    if (!sprite) return;
    const directionIndex = this.directionIndex(facing);
    const walkFrame = walking ? 1 + (Math.floor(this.time.now / 115) % 3) : 0;
    const gait = Math.sin(this.time.now / 86);
    sprite.setFrame(directionIndex * 4 + walkFrame);
    sprite.setRotation(0);
    sprite.setAlpha(1);
    sprite.y = PLAYER_RADIUS + 9 + (walking ? Math.abs(gait) * 2.4 : Math.sin((this.time.now + actor.x) / 700) * 0.6);
    sprite.scaleX = walking ? 1 + Math.abs(gait) * 0.035 : 1;
    sprite.scaleY = walking ? 1 - Math.abs(gait) * 0.025 : 1;
    sprite.setTint(fillOverride ?? 0xffffff);
    const shadow = actor.getAt(0) as Phaser.GameObjects.Ellipse | undefined;
    if (shadow) {
      shadow.scaleX = walking ? 1.02 + Math.abs(gait) * 0.08 : 1;
      shadow.scaleY = walking ? 0.96 - Math.abs(gait) * 0.04 : 1;
      shadow.alpha = walking ? 0.24 + Math.abs(gait) * 0.05 : 0.22;
    }
    actor.rotation = isPlayer && walking ? Phaser.Math.Clamp(facing.x * 0.035, -0.04, 0.04) : 0;
  }

  private emitPlayerFootstep() {
    if (!this.player || this.time.now - this.lastPlayerStepAt < 245) return;
    this.lastPlayerStepAt = this.time.now;
    this.emitFootstep(this.player.x, this.player.y + 22, 0.46);
  }

  private emitFootstep(x: number, y: number, alpha: number) {
    const puff = this.add.ellipse(
      x + Phaser.Math.Between(-7, 7),
      y + Phaser.Math.Between(-2, 4),
      Phaser.Math.Between(7, 13),
      Phaser.Math.Between(3, 6),
      0xd9c18d,
      alpha
    ).setDepth(Math.round(y) - 2);
    this.tweens.add({
      targets: puff,
      x: puff.x + Phaser.Math.Between(-8, 8),
      y: puff.y - Phaser.Math.Between(3, 8),
      scaleX: 1.8,
      scaleY: 1.35,
      alpha: 0,
      duration: 520,
      ease: "Sine.Out",
      onComplete: () => puff.destroy(),
    });
  }

  private directionIndex(facing: Phaser.Math.Vector2) {
    const angle = Phaser.Math.Angle.Wrap(Math.atan2(facing.y, facing.x));
    const eighth = Math.PI / 4;
    const indexFromRight = Math.round(angle / eighth);
    const map: Record<number, number> = {
      0: 2, 1: 1, 2: 0, 3: 7, 4: 6,
      "-4": 6, "-3": 5, "-2": 4, "-1": 3,
    };
    return map[indexFromRight] ?? 0;
  }

  private updatePrompt() {
    if (!this.player || !this.prompt || !this.world) return;
    const item = this.nearestItem();
    const prop = this.nearestProp();
    const npc = this.nearestNpc();
    const area = this.nearestDoor();
    if (item) {
      this.prompt.setText(`E Pick up ${item.name}`);
      this.prompt.setPosition(this.player.x, this.player.y + 42).setVisible(true);
      if (this.keys?.["E"] && Phaser.Input.Keyboard.JustDown(this.keys["E"])) {
        this.showItemCard(item.id, item.name, item.description ?? "Useful somehow.");
        this.handlers.onItemClick?.(item.id);
      }
      return;
    }
    if (prop) {
      this.prompt.setText(`E Inspect ${prop.name}`);
      this.prompt.setPosition(this.player.x, this.player.y + 42).setVisible(true);
      if (this.keys?.["E"] && Phaser.Input.Keyboard.JustDown(this.keys["E"])) {
        this.showPropCard(prop);
        this.handlers.onPropClick?.(prop.id);
      }
      return;
    }
    if (npc) {
      this.prompt.setText(`E Talk`);
      this.prompt.setPosition(this.player.x, this.player.y + 42).setVisible(true);
      if (this.keys?.["E"] && Phaser.Input.Keyboard.JustDown(this.keys["E"])) {
        this.showNpcCard(npc);
        this.handlers.onNpcClick?.(npc.id);
      }
      return;
    }
    if (area) {
      this.prompt.setText("E Enter");
      this.prompt.setPosition(this.player.x, this.player.y + 42).setVisible(true);
      if (this.keys?.["E"] && Phaser.Input.Keyboard.JustDown(this.keys["E"])) this.travelTo(area.id);
      return;
    }
    this.prompt.setVisible(false);
  }

  private showNpcCard(npc: Npc) {
    this.interactionCard?.destroy();
    const width = Math.min(420, this.viewportWidth() - 48);
    const height = 92;
    const x = 24;
    const y = this.viewportHeight() - height - 24;
    const bg = this.add.rectangle(x, y, width, height, 0x10151d, 0.92)
      .setOrigin(0)
      .setStrokeStyle(1, 0x52617d, 0.95)
      .setScrollFactor(0);
    const portrait = this.add.circle(x + 40, y + 45, 24, actorFillForNpc(npc))
      .setStrokeStyle(2, 0x1a2430)
      .setScrollFactor(0);
    const initial = this.add.text(x + 40, y + 45, npc.name[0] ?? "?", {
      fontFamily: "ui-sans-serif, system-ui",
      fontSize: "18px",
      color: "#24120b",
      fontStyle: "bold",
    }).setOrigin(0.5).setScrollFactor(0);
    const latestMemory = npc.memories.at(-1)?.text ?? "No recent memory.";
    const title = this.add.text(x + 78, y + 16, npc.name, {
      fontFamily: "ui-sans-serif, system-ui",
      fontSize: "15px",
      color: "#f4f1e8",
      fontStyle: "bold",
    }).setScrollFactor(0);
    const line = this.add.text(x + 78, y + 40, latestMemory, {
      fontFamily: "ui-sans-serif, system-ui",
      fontSize: "12px",
      color: "#cbd2df",
      wordWrap: { width: width - 100 },
    }).setScrollFactor(0);
    this.interactionCard = this.add.container(0, 0, [bg, portrait, initial, title, line]).setDepth(240);
    this.tweens.add({
      targets: this.interactionCard,
      alpha: { from: 1, to: 0 },
      delay: 4200,
      duration: 450,
      onComplete: () => {
        this.interactionCard?.destroy();
        this.interactionCard = undefined;
      },
    });
  }

  private createMinimap() {
    if (this.minimap) return;
    const scale = 0.086;
    const width = WORLD_W * scale;
    const height = WORLD_H * scale;
    const { x, y } = this.minimapPosition(width, height);
    const bg = this.add.rectangle(0, 0, width + 12, height + 12, 0x10151d, 0.58)
      .setOrigin(0)
      .setStrokeStyle(1, 0xf8d44e, 0.2);
    const map = this.add.graphics();
    const tileColors: Record<number, number> = {
      [TILE.grass]: 0x315738,
      [TILE.grassAlt]: 0x2b5034,
      [TILE.path]: 0xad9365,
      [TILE.pathEdge]: 0x82704f,
      [TILE.water]: 0x274864,
      [TILE.bridge]: 0x957b4e,
      [TILE.plaza]: 0x515967,
      [TILE.garden]: 0x35633d,
      [TILE.forest]: 0x203f2c,
    };
    const layer = buildGroundLayer();
    for (let row = 0; row < layer.length; row += 1) {
      for (let col = 0; col < (layer[row]?.length ?? 0); col += 1) {
        map.fillStyle(tileColors[layer[row]![col]!] ?? 0x315738, 0.9);
        map.fillRect(6 + col * TILE_SIZE * scale, 6 + row * TILE_SIZE * scale, TILE_SIZE * scale + 0.2, TILE_SIZE * scale + 0.2);
      }
    }
    for (const area of Object.values(AREA_LAYOUT)) {
      map.fillStyle(0xd0b074, 0.8);
      map.fillRect(6 + area.x * scale, 6 + area.y * scale, area.w * scale, area.h * scale);
      map.fillStyle(0xf8d44e, 1);
      map.fillCircle(6 + area.door.x * scale, 6 + area.door.y * scale, 1.5);
    }
    const cameraView = this.add.rectangle(6, 6, this.viewportWidth() * scale, this.viewportHeight() * scale)
      .setOrigin(0)
      .setStrokeStyle(1, 0xffffff, 0.7);
    const playerDot = this.add.circle(6, 6, 3, 0x58a6ff, 1)
      .setStrokeStyle(1, 0xdceeff, 1);
    const container = this.add.container(x, y, [bg, map, cameraView, playerDot])
      .setScrollFactor(0)
      .setDepth(230);
    this.minimap = { container, playerDot, cameraView, npcDots: new Map(), x, y, scale };
  }

  private updateMinimap() {
    if (!this.minimap || !this.player) return;
    const { playerDot, cameraView, npcDots, scale } = this.minimap;
    playerDot.setPosition(6 + this.player.x * scale, 6 + this.player.y * scale);
    cameraView
      .setPosition(6 + this.cameras.main.scrollX * scale, 6 + this.cameras.main.scrollY * scale)
      .setSize(this.cameras.main.displayWidth * scale, this.cameras.main.displayHeight * scale);
    for (const [id, actor] of this.actors) {
      let dot = npcDots.get(id);
      if (!dot) {
        dot = this.add.circle(0, 0, 2.1, this.colorFor(id, false), 0.95)
          .setStrokeStyle(1, 0x10151d, 1);
        this.minimap.container.add(dot);
        npcDots.set(id, dot);
      }
      dot.setPosition(6 + actor.graphic.x * scale, 6 + actor.graphic.y * scale);
    }
    for (const [id, dot] of [...npcDots]) {
      if (!this.actors.has(id)) {
        dot.destroy();
        npcDots.delete(id);
      }
    }
  }

  private handleResize() {
    const width = this.viewportWidth();
    const height = this.viewportHeight();
    this.cameras.main.setViewport(0, 0, width, height);
    this.tintRect?.setSize(width, height);
    this.repositionMinimap();
    this.updateMinimap();
  }

  private viewportWidth(): number {
    return Math.max(1, this.scale.gameSize.width || this.cameras.main.width || FALLBACK_VIEW_W);
  }

  private viewportHeight(): number {
    return Math.max(1, this.scale.gameSize.height || this.cameras.main.height || FALLBACK_VIEW_H);
  }

  private minimapPosition(width: number, height: number) {
    return {
      x: Math.max(12, this.viewportWidth() - width - MINIMAP_HUD_CLEARANCE),
      y: Math.max(58, this.viewportHeight() - height - 18),
    };
  }

  private repositionMinimap() {
    if (!this.minimap) return;
    const width = WORLD_W * this.minimap.scale;
    const height = WORLD_H * this.minimap.scale;
    const { x, y } = this.minimapPosition(width, height);
    this.minimap.container.setPosition(x, y);
    this.minimap.x = x;
    this.minimap.y = y;
  }

  private nearestNpc(): Npc | null {
    if (!this.world || !this.player) return null;
    return this.world.npcs.find((npc) => {
      const actor = this.actors.get(npc.id);
      return actor ? Phaser.Math.Distance.Between(this.player!.x, this.player!.y, actor.graphic.x, actor.graphic.y) <= INTERACT_DISTANCE : false;
    }) ?? null;
  }

  private nearestItem() {
    if (!this.world || !this.player) return null;
    return this.world.items.find((item) => {
      if (item.locationId !== this.world!.player.locationId) return false;
      const sprite = this.itemSprites.get(item.id);
      return sprite ? Phaser.Math.Distance.Between(this.player!.x, this.player!.y, sprite.x, sprite.y) <= INTERACT_DISTANCE : false;
    }) ?? null;
  }

  private nearestProp(): InteractableProp | null {
    if (!this.world || !this.player) return null;
    return (this.world.interactables ?? []).find((prop) => {
      if (prop.locationId !== this.world!.player.locationId) return false;
      const sprite = this.propSprites.get(prop.id);
      return sprite ? Phaser.Math.Distance.Between(this.player!.x, this.player!.y, sprite.x, sprite.y) <= INTERACT_DISTANCE : false;
    }) ?? null;
  }

  private nearestDoor(): RectArea | null {
    if (!this.world || !this.player) return null;
    return this.world.locations
      .map((location) => this.area(location.id))
      .filter((area): area is RectArea => Boolean(area))
      .find((area) => Phaser.Math.Distance.Between(this.player!.x, this.player!.y, area.door.x, area.door.y) <= INTERACT_DISTANCE) ?? null;
  }

  private updateTint() {
    if (!this.world || !this.tintRect) return;
    const tod = timeOfDay(this.world.clock);
    const color = isNight(this.world.clock) ? 0x10264d : tod === "dusk" ? 0xff8c50 : tod === "dawn" ? 0xffd88c : 0xffffff;
    const alpha = isNight(this.world.clock) ? 0.28 : tod === "dusk" || tod === "dawn" ? 0.08 : 0;
    this.tintRect.setFillStyle(color, alpha);
    // Lamps pulse on at night, fade out during the day. Container alpha
    // multiplies with the internal pulse tween on glow/lamp.
    const lampFactor = isNight(this.world.clock)
      ? 1
      : tod === "dusk" || tod === "dawn"
        ? 0.55
        : 0.15;
    for (const lamp of this.lamps) lamp.setAlpha(lampFactor);
  }

  private npcTarget(npc: Npc) {
    const area = this.area(npc.locationId) ?? this.area("square")!;
    const here = this.world?.npcs.filter((other) => other.locationId === npc.locationId) ?? [];
    const idx = Math.max(0, here.findIndex((other) => other.id === npc.id));
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    return {
      x: area.x + 45 + col * 42,
      y: area.y + area.h - 46 - row * 34,
    };
  }

  private area(id: string): RectArea | null {
    const layout = AREA_LAYOUT[id];
    const location = this.world?.locations.find((loc) => loc.id === id);
    if (!layout || !location) return null;
    return { ...layout, door: new Phaser.Math.Vector2(layout.door.x, layout.door.y), name: location.name };
  }

  private colorFor(id: string, flashing: boolean): number {
    if (flashing) return 0xf8d44e;
    if (id === "player") return 0x58a6ff;
    const npc = this.world?.npcs.find((n) => n.id === id);
    if (npc) return actorFillForNpc(npc);
    return 0xff8a65;
  }
}

export function centerOf(location: Location) {
  return { x: location.x + location.w / 2, y: location.y + location.h / 2 };
}

function actorFillForNpc(npc: Npc): number {
  const color = npc.appearance?.palette?.[0];
  const parsed = color ? parseCssHexColor(color) : null;
  if (parsed !== null) return parsed;
  if (npc.id === "tomas") return 0x6f4b35;
  if (npc.id === "mira") return 0x708a4b;
  if (npc.id === "lena") return 0xa96a42;
  if (npc.id === "orrin") return 0x355a82;
  return npc.tier === "quest" ? 0xb5e48c : 0xff8a65;
}

function agentFxPalette(actionType: ActionType, fromDirector: boolean): AgentFxPalette {
  if (fromDirector) return { main: 0xf8d44e, accent: 0xffffff, label: "DIRECTOR", symbol: "!" };
  const palettes: Partial<Record<ActionType, AgentFxPalette>> = {
    move: { main: 0x9fc3ff, accent: 0xeaf5ff, label: "MOVE", symbol: ">" },
    talk: { main: 0x7ed26d, accent: 0xeaf5ff, label: "TALK", symbol: "\"" },
    gossip: { main: 0xe8846b, accent: 0xf8f1c4, label: "RUMOR", symbol: "?" },
    confront: { main: 0xf47272, accent: 0xffffff, label: "CLASH", symbol: "!" },
    inspect: { main: 0xcbd2df, accent: 0xffffff, label: "CHECK", symbol: "*" },
    remember: { main: 0x9fc3ff, accent: 0xf8f1c4, label: "MEMORY", symbol: "+" },
    pickup: { main: 0xf8d44e, accent: 0xffffff, label: "ITEM", symbol: "+" },
    drop: { main: 0x8a98ac, accent: 0xeaf5ff, label: "DROP", symbol: "-" },
    give: { main: 0x7ed26d, accent: 0xf8f1c4, label: "GIVE", symbol: "+" },
    offer_quest: { main: 0xf8d44e, accent: 0xffffff, label: "QUEST", symbol: "!" },
    accept_quest: { main: 0x7ed26d, accent: 0xffffff, label: "ACCEPT", symbol: "!" },
    complete_quest: { main: 0x7ed26d, accent: 0xf8f1c4, label: "DONE", symbol: "*" },
    fail_quest: { main: 0xf47272, accent: 0xffffff, label: "FAILED", symbol: "x" },
    choose_character: { main: 0x58a6ff, accent: 0xffffff, label: "HERO", symbol: "*" },
  };
  return palettes[actionType] ?? { main: 0xcbd2df, accent: 0xffffff, label: actionType.toUpperCase(), symbol: "*" };
}

function actionFxCaption(text: string, fallback: string): string {
  const compact = text
    .replace(/\s+/g, " ")
    .replace(/^(Director clue:|Director beat:)\s*/i, "")
    .trim();
  if (!compact) return fallback;
  const firstWords = compact.split(/\s+/).slice(0, 2).join(" ");
  return firstWords.length > 12 ? fallback : firstWords.toUpperCase();
}

function npcNameplateText(npc: Npc): string {
  return npc.name;
}

function npcRoleTag(npc: Npc): string {
  if (npc.factionId === "challengers") return "Hostile";
  if (npc.factionId === "heroes") return npc.tier === "quest" ? "Quest" : "Hero";
  return npc.tier === "quest" ? "Quest" : "NPC";
}

function npcNameplateKey(npc: Npc): string {
  return [
    npc.id,
    npc.name,
    npc.role ?? "",
    npc.factionId ?? "",
    npc.tier ?? "",
    npc.combat?.defeated ? "down" : "up",
  ].join("|");
}

function initialsForName(name: string): string {
  const short = shortActorName(name);
  const parts = short.trim().split(/\s+/).filter(Boolean);
  const value = parts.length > 1 ? `${parts[0]![0]}${parts.at(-1)![0]}` : short.slice(0, 2);
  return value.toUpperCase();
}

function shortActorName(name: string): string {
  if (/speed-o'?-/i.test(name)) return "Sonic";
  if (/mumen/i.test(name)) return "Mumen";
  if (/new hero/i.test(name)) return "New Hero";
  if (name.length <= 12) return name;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts[0] ?? name;
}

function truncateName(name: string, max: number): string {
  if (name.length <= max) return name;
  return `${name.slice(0, Math.max(1, max - 1))}.`;
}

function playerFillForWorld(world: World): number {
  const color = world.player.appearance?.palette?.[0];
  const parsed = color ? parseCssHexColor(color) : null;
  return parsed ?? 0x526f3f;
}

function playerAppearanceKey(world: World): string {
  return [
    world.player.characterId ?? "custom",
    world.player.name ?? "",
    world.player.appearance?.sourceLook ?? "",
    world.player.appearance?.palette?.join(",") ?? "",
    world.player.appearance?.visualTags?.join(",") ?? "",
  ].join("|");
}

function dedupeCloseWaypoints(waypoints: Phaser.Math.Vector2[]): Phaser.Math.Vector2[] {
  const result: Phaser.Math.Vector2[] = [];
  for (const point of waypoints) {
    const previous = result.at(-1);
    if (!previous || Phaser.Math.Distance.Between(previous.x, previous.y, point.x, point.y) > ARRIVE_DISTANCE) {
      result.push(point);
    }
  }
  return result;
}

function parseCssHexColor(value: string): number | null {
  const trimmed = value.trim();
  const match = /^#?([0-9a-f]{6})$/i.exec(trimmed);
  return match ? Number.parseInt(match[1]!, 16) : null;
}
