import Phaser from "phaser";
import type { World } from "../../../src/types.ts";
import { isNight, timeOfDay } from "../../../src/types.ts";

export const NPC_CLICK = "npc-click";
export const LOCATION_CLICK = "location-click";

interface DotState {
  graphic: Phaser.GameObjects.Container;
  bubble: Phaser.GameObjects.Container | null;
  flashUntil: number;
}

export class VillageScene extends Phaser.Scene {
  private world: World | null = null;
  private locationLabels = new Map<string, Phaser.GameObjects.Container>();
  private exitGraphics?: Phaser.GameObjects.Graphics;
  private dots = new Map<string, DotState>();
  private tintRect?: Phaser.GameObjects.Rectangle;
  private bubbleTexts = new Map<string, Phaser.GameObjects.Text>();

  constructor() {
    super("village");
  }

  create() {
    this.exitGraphics = this.add.graphics();
    this.tintRect = this.add.rectangle(0, 0, 660, 500, 0x000000, 0).setOrigin(0).setDepth(50);
  }

  setWorld(world: World) {
    const first = !this.world;
    this.world = world;
    this.redrawLocations();
    this.redrawExits();
    this.redrawActors(first);
    this.redrawTint();
  }

  flashActor(actorId: string) {
    const dot = this.dots.get(actorId);
    if (dot) dot.flashUntil = this.time.now + 1500;
  }

  showBubble(actorId: string, text: string) {
    const dot = this.dots.get(actorId);
    if (!dot) return;
    const existing = this.bubbleTexts.get(actorId);
    if (existing) existing.destroy();
    const target = dot.graphic;
    const bubble = this.add.text(target.x, target.y - 20, text, {
      fontFamily: "ui-sans-serif, system-ui",
      fontSize: "11px",
      color: "#e6e9ef",
      backgroundColor: "#161b24cc",
      padding: { x: 6, y: 4 },
      wordWrap: { width: 180 },
    }).setOrigin(0.5, 1).setDepth(100);
    this.bubbleTexts.set(actorId, bubble);
    this.tweens.add({
      targets: bubble,
      alpha: { from: 1, to: 0 },
      y: bubble.y - 12,
      duration: 4000,
      ease: "Sine.Out",
      onComplete: () => bubble.destroy(),
    });
  }

  override update() {
    if (!this.world) return;
    for (const [id, dot] of this.dots) {
      const flashing = this.time.now < dot.flashUntil;
      const inner = dot.graphic.getAt(0) as Phaser.GameObjects.Arc;
      if (inner) inner.setFillStyle(this.colorFor(id, flashing), 1);
      const bubble = this.bubbleTexts.get(id);
      if (bubble) bubble.setPosition(dot.graphic.x, dot.graphic.y - 20);
    }
  }

  private redrawLocations() {
    if (!this.world) return;
    for (const loc of this.world.locations) {
      const existing = this.locationLabels.get(loc.id);
      if (existing) existing.destroy();
      const isCurrent = this.world.player.locationId === loc.id;
      const fill = isCurrent ? 0x19212e : 0x11161f;
      const stroke = isCurrent ? 0x3b4a66 : 0x232a36;
      const rect = this.add.rectangle(loc.x, loc.y, loc.w, loc.h, fill).setOrigin(0).setStrokeStyle(isCurrent ? 2 : 1, stroke);
      rect.setInteractive({ cursor: "pointer" });
      rect.on("pointerup", () => this.events.emit(LOCATION_CLICK, loc.id));
      const label = this.add.text(loc.x + 10, loc.y + 6, loc.name, {
        fontFamily: "ui-sans-serif, system-ui",
        fontSize: "12px",
        color: "#cbd2df",
        fontStyle: "bold",
      }).setOrigin(0);
      const itemsHere = this.world.items.filter((item) => item.locationId === loc.id);
      const itemBadge = itemsHere.length
        ? this.add.text(loc.x + loc.w - 12, loc.y + 6, `◆ ${itemsHere.length}`, {
            fontFamily: "ui-sans-serif, system-ui",
            fontSize: "11px",
            color: "#f8d44e",
          }).setOrigin(1, 0)
        : null;
      const container = this.add.container(0, 0, itemBadge ? [rect, label, itemBadge] : [rect, label]);
      this.locationLabels.set(loc.id, container);
    }
  }

  private redrawExits() {
    if (!this.world || !this.exitGraphics) return;
    this.exitGraphics.clear();
    this.exitGraphics.lineStyle(2, 0x78849c, 0.4);
    for (const exit of this.world.exits) {
      const a = this.world.locations.find((l) => l.id === exit.from);
      const b = this.world.locations.find((l) => l.id === exit.to);
      if (!a || !b) continue;
      this.exitGraphics.beginPath();
      this.exitGraphics.moveTo(a.x + a.w / 2, a.y + a.h / 2);
      this.exitGraphics.lineTo(b.x + b.w / 2, b.y + b.h / 2);
      this.exitGraphics.strokePath();
    }
  }

  private redrawActors(initial: boolean) {
    if (!this.world) return;
    const wantedIds = new Set<string>(["player", ...this.world.npcs.map((n) => n.id)]);
    for (const id of [...this.dots.keys()]) {
      if (!wantedIds.has(id)) {
        this.dots.get(id)?.graphic.destroy();
        this.dots.delete(id);
      }
    }
    this.placeActor("player", this.playerTarget(), 12, "P", initial);
    for (const npc of this.world.npcs) {
      this.placeActor(npc.id, this.npcTarget(npc.id), 10, npc.name[0] ?? "?", initial);
    }
  }

  private placeActor(id: string, target: { x: number; y: number }, radius: number, label: string, initial: boolean) {
    let dot = this.dots.get(id);
    if (!dot) {
      const arc = this.add.circle(0, 0, radius, this.colorFor(id, false));
      const text = this.add.text(0, 0, label, {
        fontFamily: "ui-sans-serif, system-ui",
        fontSize: `${Math.round(radius * 0.95)}px`,
        color: "#0a0d12",
        fontStyle: "bold",
      }).setOrigin(0.5);
      const container = this.add.container(target.x, target.y, [arc, text]).setDepth(20);
      container.setSize(radius * 2, radius * 2);
      container.setInteractive({ useHandCursor: true });
      container.on("pointerup", () => this.events.emit(NPC_CLICK, id));
      dot = { graphic: container, bubble: null, flashUntil: 0 };
      this.dots.set(id, dot);
      if (!initial) container.setAlpha(0).setScale(0.6);
      if (!initial) this.tweens.add({ targets: container, alpha: 1, scale: 1, duration: 200 });
    } else {
      this.tweens.add({ targets: dot.graphic, x: target.x, y: target.y, duration: 600, ease: "Sine.InOut" });
    }
  }

  private redrawTint() {
    if (!this.world || !this.tintRect) return;
    const tod = timeOfDay(this.world.clock);
    const color = isNight(this.world.clock) ? 0x142850 : tod === "dusk" ? 0xff8c50 : tod === "dawn" ? 0xffe0a0 : 0xffffff;
    const alpha = isNight(this.world.clock) ? 0.45 : tod === "dusk" || tod === "dawn" ? 0.1 : 0;
    this.tintRect.setFillStyle(color, alpha);
  }

  private playerTarget() {
    const loc = this.world!.locations.find((l) => l.id === this.world!.player.locationId)!;
    return { x: loc.x + 16, y: loc.y + loc.h - 16 };
  }

  private npcTarget(id: string) {
    const npc = this.world!.npcs.find((n) => n.id === id)!;
    const loc = this.world!.locations.find((l) => l.id === npc.locationId)!;
    const here = this.world!.npcs.filter((n) => n.locationId === npc.locationId);
    const idx = here.findIndex((n) => n.id === id);
    const cols = Math.max(2, Math.ceil(Math.sqrt(here.length)));
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const cellW = (loc.w - 24) / cols;
    return { x: loc.x + 12 + col * cellW + cellW / 2, y: loc.y + 28 + row * 22 };
  }

  private colorFor(id: string, flashing: boolean): number {
    if (flashing) return 0xf8d44e;
    if (id === "player") return 0x58a6ff;
    const npc = this.world?.npcs.find((n) => n.id === id);
    if (npc?.tier === "quest") return 0xb5e48c;
    return 0xff8a65;
  }
}
