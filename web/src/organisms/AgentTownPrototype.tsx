import Phaser from "phaser";
import { useEffect, useRef, useState } from "react";

import {
  CAST,
  type CastMember,
  type Direction,
  initialSnapshot,
  nextObjective,
  PROPS,
  propVisible,
  type RoomId,
  type StorySnapshot,
  type WorldProp,
  ZONES,
  zoneUnlocked,
} from "./agent-town-world.ts";

const FRAME_WIDTH = 48;
const FRAME_HEIGHT = 96;
const SHEET_COLUMNS = 56;
const FRAMES_PER_DIR = 6;
const CHARACTER_SCALE = 0.72;
const SPEED = 150;
const INTERACT_DISTANCE = 64;
const DOOR_TRIGGER_DISTANCE = 34;
const MAP_KEY = "zcity-outdoor";
const OFFICE_MAP_KEY = "hero-hq-interior";
const PLAYER_KEY = "character_09";
const WORLD_WIDTH = 192 * 16;
const WORLD_HEIGHT = 128 * 16;
const OFFICE_WORLD_WIDTH = 27 * 48;
const OFFICE_WORLD_HEIGHT = 20 * 48;

const OUTDOOR_TILESETS = [
  ["openrtp_exterior", "/openrtp/exterior.png"],
] as const;

const OFFICE_TILESETS = [
  ["room_builder", "Room_Builder_Office_48x48.png"],
  ["modern_office", "Modern_Office_48x48.png"],
  ["Classroom & Library", "5_Classroom_and_library_48x48.png"],
  ["Basement", "14_Basement_48x48.png"],
  ["Generic Interiors", "1_Generic_48x48.png"],
  ["Interios Room Builder", "Room_Builder_48x48.png"],
  ["6_Music_and_sport_48x48", "6_Music_and_sport_48x48.png"],
  ["3_Bathroom_48x48", "3_Bathroom_48x48.png"],
  ["4_Bedroom_48x48", "4_Bedroom_48x48.png"],
  ["2_LivingRoom_48x48", "2_LivingRoom_48x48.png"],
  ["7_Art_48x48", "7_Art_48x48.png"],
  ["8_Gym_48x48", "8_Gym_48x48.png"],
  ["9_Fishing_48x48", "9_Fishing_48x48.png"],
  ["11_Halloween_48x48", "11_Halloween_48x48.png"],
  ["13_Conference_Hall_48x48", "13_Conference_Hall_48x48.png"],
  ["16_Grocery_store_48x48", "16_Grocery_store_48x48.png"],
] as const;

const DIRECTIONS = ["right", "up", "left", "down"] as const;
type MapMode = RoomId;
type DoorEntry = { label: string; x: number; y: number; marker: Phaser.GameObjects.Container; tag: Phaser.GameObjects.Text; action: () => void };

export function AgentTownPrototype() {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<OfficePrototypeScene | null>(null);
  const snapshotRef = useRef<StorySnapshot>(initialSnapshot());
  const [active, setActive] = useState<CastMember>(CAST[0]!);
  const [snapshot, setSnapshot] = useState<StorySnapshot>(() => initialSnapshot());
  const [met, setMet] = useState<Set<string>>(() => new Set());
  const [log, setLog] = useState<string[]>(() => ["Walk the city. Press E near a character or marker."]);
  const [mapMode, setMapMode] = useState<MapMode>("outdoor");

  const applyCharacterTalk = (character: CastMember) => {
    setActive(character);
    setMet((current) => new Set(current).add(character.id));
    const result = reduceCharacterTalk(snapshotRef.current, character);
    snapshotRef.current = result.snapshot;
    setSnapshot(result.snapshot);
    setLog((existing) => [...result.entries, `${character.name}: ${character.memory}`, ...existing].slice(0, 6));
  };

  const applyPropInspect = (prop: WorldProp) => {
    const result = reducePropInspect(snapshotRef.current, prop);
    snapshotRef.current = result.snapshot;
    setSnapshot(result.snapshot);
    setLog((existing) => [...result.entries, ...existing].slice(0, 6));
  };

  useEffect(() => {
    if (!hostRef.current) return undefined;
    const scene = new OfficePrototypeScene((character) => {
      applyCharacterTalk(character);
    }, (prop) => {
      applyPropInspect(prop);
    }, setMapMode);
    sceneRef.current = scene;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      width: 1280,
      height: 720,
      pixelArt: true,
      roundPixels: true,
      backgroundColor: "#111827",
      scale: { mode: Phaser.Scale.RESIZE },
      physics: {
        default: "arcade",
        arcade: { gravity: { x: 0, y: 0 } },
      },
      scene,
    });
    return () => {
      game.destroy(true);
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    snapshotRef.current = snapshot;
    sceneRef.current?.applySnapshot(snapshot);
  }, [snapshot]);

  const activeZone = ZONES.find((zone) => zone.id === snapshot.activeZone) ?? ZONES[0]!;
  const primaryAction = primaryStoryAction(snapshot);
  const steps = questSteps(snapshot);
  const roomAction = roomActionFor(activeZone.id, mapMode);

  return (
    <div className="agent-town-shell">
      <div className="agent-town-game" ref={hostRef} aria-label="Agent town prototype" />
      <aside className="agent-town-panel" aria-label="Quest journal">
        <div className="agent-town-kicker">
          <span>Patrol</span>
          <b>{met.size}/{CAST.length} met</b>
        </div>
        <section className="agent-town-objective">
          <h1>City Patrol</h1>
          <strong>{snapshot.objective}</strong>
          <p>{activeZone.description}</p>
          <ol className="agent-town-steps">
            {steps.map((step) => (
              <li key={step.label} className={step.done ? "done" : step.current ? "current" : ""}>
                {step.label}
              </li>
            ))}
          </ol>
          {primaryAction && (
            <button
              type="button"
              onClick={() => {
                if (primaryAction.kind === "prop") {
                  applyPropInspect(primaryAction.prop);
                  sceneRef.current?.focusProp(primaryAction.prop.id);
                } else {
                  const character = CAST.find((candidate) => candidate.id === primaryAction.characterId);
                  if (character) {
                    applyCharacterTalk(character);
                    sceneRef.current?.focusCharacter(character.id);
                  }
                }
              }}
            >
              Track: {primaryAction.label}
            </button>
          )}
        </section>
        <section className="agent-town-card">
          <small>{active.role}</small>
          <h2>{active.name}</h2>
          <p>{active.line}</p>
          <button type="button" onClick={() => sceneRef.current?.focusCharacter(active.id)}>Find {active.name}</button>
        </section>
        <section className="agent-town-zones" aria-label="Travel">
          <small>Travel</small>
          {roomAction && (
            <button type="button" onClick={() => sceneRef.current?.switchRoom(roomAction.mapMode)}>
              <span>{roomAction.label}</span>
              <small>{roomAction.hint}</small>
            </button>
          )}
          {ZONES.map((zone) => {
            const unlocked = zoneUnlocked(zone, snapshot.flags);
            return (
              <button
                key={zone.id}
                type="button"
                disabled={!unlocked}
                className={zone.id === snapshot.activeZone ? "active" : ""}
                onClick={() => {
                  setSnapshot((current) => ({ ...current, activeZone: zone.id }));
                  sceneRef.current?.goToZone(zone.id);
                }}
              >
                <span>{zone.name}</span>
                <small>{unlocked ? "Open" : "Locked"}</small>
              </button>
            );
          })}
        </section>
        <section className="agent-town-inventory" aria-label="Inventory">
          <small>Inventory</small>
          <p>{snapshot.inventory.length > 0 ? snapshot.inventory.join(", ") : "Empty"}</p>
        </section>
        <section className="agent-town-log">
          {log.map((entry, index) => <p key={`${index}-${entry}`}>{entry}</p>)}
        </section>
        <a href="?legacy=1">Open old build</a>
      </aside>
    </div>
  );
}

class OfficePrototypeScene extends Phaser.Scene {
  private player?: Phaser.Physics.Arcade.Sprite;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private eKey?: Phaser.Input.Keyboard.Key;
  private collisionGroup?: Phaser.Physics.Arcade.StaticGroup;
  private characters = new Map<string, { data: CastMember; sprite: Phaser.Physics.Arcade.Sprite; prompt: Phaser.GameObjects.Text; tag: Phaser.GameObjects.Text }>();
  private props = new Map<string, { data: WorldProp; marker: Phaser.GameObjects.Container; tag: Phaser.GameObjects.Text }>();
  private target: { x: number; y: number } | null = null;
  private facing: Direction = "down";
  private prompt?: Phaser.GameObjects.Text;
  private playerTag?: Phaser.GameObjects.Text;
  private alertTint?: Phaser.GameObjects.Rectangle;
  private currentSnapshot: StorySnapshot = initialSnapshot();
  private selectedId = CAST[0]!.id;
  private mapMode: MapMode = "outdoor";
  private doors = new Map<string, DoorEntry>();

  constructor(
    private readonly onTalk: (character: CastMember) => void,
    private readonly onInspect: (prop: WorldProp) => void,
    private readonly onMapMode: (mapMode: MapMode) => void,
  ) {
    super("OfficePrototypeScene");
  }

  init(data?: { mapMode?: MapMode; snapshot?: StorySnapshot; selectedId?: string }) {
    this.mapMode = data?.mapMode ?? this.mapMode;
    this.currentSnapshot = data?.snapshot ?? this.currentSnapshot;
    this.selectedId = data?.selectedId ?? this.selectedId;
  }

  preload() {
    this.load.tilemapTiledJSON(MAP_KEY, "/openrtp/zcity-outdoor.json");
    this.load.tilemapTiledJSON(OFFICE_MAP_KEY, "/agent-town/maps/office2.json");
    for (const [name, file] of OUTDOOR_TILESETS) this.load.image(name, file);
    for (const [name, file] of OFFICE_TILESETS) this.load.image(name, `/agent-town/tilesets/${file}`);
    for (const key of new Set([PLAYER_KEY, ...CAST.map((character) => character.sprite)])) {
      const suffix = key.replace("character_", "");
      this.load.spritesheet(key, `/agent-town/characters/Premade_Character_48x48_${suffix}.png`, {
        frameWidth: FRAME_WIDTH,
        frameHeight: FRAME_HEIGHT,
      });
    }
    this.load.spritesheet("agent-town-arrow", "/agent-town/sprites/arrow_down_48x48.png", {
      frameWidth: 48,
      frameHeight: 48,
    });
  }

  create() {
    this.characters.clear();
    this.props.clear();
    this.doors.clear();
    for (const key of new Set([PLAYER_KEY, ...CAST.map((character) => character.sprite)])) createCharacterAnimations(this, key);
    createArrowAnimation(this);

    const mapConfig = this.mapConfig();
    const map = this.make.tilemap({ key: mapConfig.key });
    const tilesets = mapConfig.tilesets.map(([name]) => map.addTilesetImage(name, name)).filter((tileset): tileset is Phaser.Tilemaps.Tileset => Boolean(tileset));
    this.collisionGroup = this.physics.add.staticGroup();
    this.createWorldLayers(map, tilesets);

    this.player = this.physics.add.sprite(mapConfig.spawn.x, mapConfig.spawn.y, PLAYER_KEY, frameFor("down"));
    this.player.setScale(mapConfig.characterScale);
    this.player.setDepth(10);
    this.player.setCollideWorldBounds(true);
    configureBody(this.player);
    this.physics.add.collider(this.player, this.collisionGroup);
    this.playerTag = this.add.text(this.player.x, this.player.y + 34, "Tatsumaki", {
      fontFamily: "Montserrat, sans-serif",
      fontSize: "11px",
      color: "#f6f1e8",
      backgroundColor: "rgba(25, 77, 46, 0.82)",
      padding: { x: 6, y: 3 },
    }).setOrigin(0.5, 0).setDepth(24);

    this.physics.world.setBounds(0, 0, mapConfig.width, mapConfig.height);
    this.cameras.main.setBounds(0, 0, mapConfig.width, mapConfig.height);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setZoom(mapConfig.zoom);

    for (const character of CAST) this.addCharacter(character);
    for (const prop of PROPS) this.addProp(prop);
    if (this.mapMode === "outdoor") {
      this.addZoneLabels();
      this.addDoor("hero-hq-door", "Enter Hero HQ", 710, 520, () => this.switchMap("hqInterior"));
      this.addDoor("market-door", "Enter Market Hall", 1538, 516, () => this.switchMap("marketInterior"));
      this.addDoor("dojo-door", "Enter Dojo", 592, 1368, () => this.switchMap("dojoInterior"));
      this.addDoor("alley-door", "Enter Alley Gate", 2178, 1568, () => this.switchMap("alleyInterior"));
    } else {
      this.addDoor("hero-hq-exit", "Exit to city", 610, 820, () => this.switchMap("outdoor"));
    }
    this.alertTint = this.add.rectangle(0, 0, mapConfig.width, mapConfig.height, 0xff3b30, 0).setOrigin(0).setDepth(2).setScrollFactor(1);

    this.cursors = this.input.keyboard?.createCursorKeys();
    this.keys = this.input.keyboard?.addKeys("W,A,S,D") as Record<string, Phaser.Input.Keyboard.Key>;
    this.eKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.input.keyboard?.disableGlobalCapture();
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonReleased()) return;
      this.target = { x: pointer.worldX, y: pointer.worldY };
    });

    this.prompt = this.add.text(0, 0, "Press E", promptStyle()).setOrigin(0.5, 1).setDepth(30).setVisible(false);
    this.applySnapshot(this.currentSnapshot);
  }

  override update() {
    if (!this.player) return;
    const movement = this.inputVector();
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (movement.x !== 0 || movement.y !== 0) {
      this.target = null;
      body.setVelocity(movement.x * SPEED, movement.y * SPEED);
      this.setFacing(movement);
    } else if (this.target) {
      const dx = this.target.x - this.player.x;
      const dy = this.target.y - this.player.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= 6) {
        this.target = null;
        body.setVelocity(0, 0);
      } else {
        body.setVelocity((dx / distance) * SPEED, (dy / distance) * SPEED);
        this.setFacing({ x: dx, y: dy });
      }
    } else {
      body.setVelocity(0, 0);
    }

    this.syncAnimation();
    this.playerTag?.setPosition(this.player.x, this.player.y + 34);
    this.updateCharacterLabels();
    if (this.tryDoorTransition()) return;
    const nearest = this.nearestInteractable();
    if (this.prompt) {
      this.prompt.setVisible(Boolean(nearest));
      if (nearest) this.prompt.setPosition(nearest.x, nearest.y - 48);
      if (nearest) this.prompt.setText(nearest.kind === "character" ? "Talk" : nearest.kind === "door" ? nearest.data.label : "Inspect");
    }
    if (nearest && this.eKey && Phaser.Input.Keyboard.JustDown(this.eKey)) {
      if (nearest.kind === "character") this.talk(nearest.data);
      else if (nearest.kind === "prop") this.inspect(nearest.data);
      else nearest.data.action();
    }
  }

  focusCharacter(id: string) {
    const character = this.characters.get(id);
    if (!character) return;
    this.selectedId = id;
    this.movePlayerNear(character.sprite.x, character.sprite.y);
  }

  focusProp(id: string) {
    const prop = this.props.get(id);
    if (!prop) return;
    this.movePlayerNear(prop.marker.x, prop.marker.y);
  }

  enterHeroHq() {
    this.switchRoom("hqInterior");
  }

  exitHeroHq() {
    this.switchRoom("outdoor");
  }

  switchRoom(mapMode: MapMode) {
    this.switchMap(mapMode);
  }

  goToZone(zoneId: string) {
    const zone = ZONES.find((candidate) => candidate.id === zoneId);
    if (!zone) return;
    this.currentSnapshot = { ...this.currentSnapshot, activeZone: zone.id };
    if (this.mapMode !== "outdoor") {
      this.currentSnapshot = { ...this.currentSnapshot, activeZone: zone.id };
      this.switchMap("outdoor");
      return;
    }
    if (!this.player) return;
    this.player.setPosition(zone.spawn.x, zone.spawn.y);
    this.target = null;
    this.cameras.main.pan(zone.focus.x, zone.focus.y, 280, "Quad.easeOut", true);
  }

  applySnapshot(snapshot: StorySnapshot) {
    this.currentSnapshot = snapshot;
    this.alertTint?.setAlpha(snapshot.flags.alertRaised ? 0.08 : 0);
    for (const entry of this.props.values()) {
      const visible = propVisible(entry.data, snapshot.flags);
      entry.marker.setVisible(visible);
      entry.tag.setVisible(visible);
    }
    for (const entry of this.characters.values()) {
      const zone = ZONES.find((candidate) => candidate.id === entry.data.zoneId);
      const unlocked = !zone || zoneUnlocked(zone, snapshot.flags);
      entry.sprite.setVisible(unlocked);
      entry.tag.setVisible(unlocked);
      entry.prompt.setVisible(unlocked && entry.data.id === this.selectedId);
    }
  }

  private addCharacter(character: CastMember) {
    const position = this.characterPosition(character);
    if (!position) return;
    const sprite = this.physics.add.sprite(position.x, position.y, character.sprite, frameFor("down"));
    sprite.setScale(this.mapConfig().characterScale);
    sprite.setDepth(9);
    sprite.setInteractive({ useHandCursor: true });
    configureBody(sprite);
    if (this.collisionGroup) this.physics.add.collider(sprite, this.collisionGroup);
    sprite.play(`${character.sprite}:idle-down`);
    sprite.on("pointerup", () => {
      this.selectedId = character.id;
      this.target = { x: sprite.x, y: sprite.y + 38 };
      this.talk(character);
    });
    const tag = this.add.text(position.x, position.y + 34, character.name, {
      fontFamily: "Montserrat, sans-serif",
      fontSize: "11px",
      color: "#f6f1e8",
      backgroundColor: "rgba(11, 18, 32, 0.78)",
      padding: { x: 6, y: 3 },
    }).setOrigin(0.5, 0).setDepth(24);
    const prompt = this.add.text(position.x, position.y - 42, "!", {
      fontFamily: "Montserrat, sans-serif",
      fontSize: "18px",
      color: "#1f2937",
      backgroundColor: "#f8d44e",
      padding: { x: 7, y: 1 },
    }).setOrigin(0.5).setDepth(24).setVisible(false);
    this.characters.set(character.id, { data: character, sprite, prompt, tag });
  }

  private createWorldLayers(map: Phaser.Tilemaps.Tilemap, tilesets: Phaser.Tilemaps.Tileset[]) {
    for (const layerName of ["ground", "detail", "structures", "canopy", "floor", "walls", "furniture", "objects"]) {
      if (!map.getLayer(layerName)) continue;
      const layer = map.createLayer(layerName, tilesets, 0, 0);
      layer?.setDepth(layerName === "canopy" ? 18 : layerName === "objects" || layerName === "structures" ? 4 : 1);
    }
    if (map.getLayer("overhead")) {
      const overhead = map.createLayer("overhead", tilesets, 0, 0);
      overhead?.setDepth(20);
    }
    const collisions = map.getObjectLayer("collisions")?.objects ?? [];
    for (const object of collisions) {
      const body = this.add.rectangle(
        (object.x ?? 0) + (object.width ?? 0) / 2,
        (object.y ?? 0) + (object.height ?? 0) / 2,
        object.width ?? 0,
        object.height ?? 0,
        0x000000,
        0,
      );
      this.physics.add.existing(body, true);
      this.collisionGroup?.add(body);
    }
  }

  private addZoneLabels() {
    for (const zone of ZONES) {
      this.add.text(zone.focus.x, zone.focus.y - 104, zone.name, {
        fontFamily: "Montserrat, sans-serif",
        fontSize: "11px",
        color: "#f6f1e8",
        backgroundColor: "rgba(11, 18, 32, 0.72)",
        padding: { x: 7, y: 4 },
      }).setOrigin(0.5).setDepth(25);
    }
  }

  private addProp(prop: WorldProp) {
    const position = this.propPosition(prop);
    if (!position) return;
    const base = this.add.circle(0, 0, 15, prop.color, 0.95);
    const label = this.add.text(0, 0, prop.symbol, {
      fontFamily: "Montserrat, sans-serif",
      fontSize: "15px",
      color: "#111827",
      fontStyle: "bold",
    }).setOrigin(0.5);
    const marker = this.add.container(position.x, position.y, [base, label]).setDepth(14).setSize(34, 34);
    marker.setInteractive(new Phaser.Geom.Circle(0, 0, 22), Phaser.Geom.Circle.Contains);
    marker.on("pointerup", () => {
      this.target = { x: position.x, y: position.y + 34 };
      this.inspect(prop);
    });
    const tag = this.add.text(position.x, position.y + 21, prop.label, {
      fontFamily: "Montserrat, sans-serif",
      fontSize: "11px",
      color: "#f6f1e8",
      backgroundColor: "rgba(11, 18, 32, 0.78)",
      padding: { x: 6, y: 3 },
    }).setOrigin(0.5, 0).setDepth(24);
    this.props.set(prop.id, { data: prop, marker, tag });
  }

  private addDoor(id: string, labelText: string, x: number, y: number, action: () => void) {
    const base = this.add.rectangle(0, 0, 42, 22, 0xf8d44e, 0.92).setStrokeStyle(1, 0x21170f, 0.55);
    const label = this.add.text(0, 0, "IN", {
      fontFamily: "Montserrat, sans-serif",
      fontSize: "12px",
      color: "#21170f",
      fontStyle: "bold",
    }).setOrigin(0.5);
    const marker = this.add.container(x, y, [base, label]).setDepth(14).setSize(46, 28);
    marker.setInteractive(new Phaser.Geom.Rectangle(-23, -14, 46, 28), Phaser.Geom.Rectangle.Contains);
    marker.on("pointerup", action);
    const tag = this.add.text(x, y + 20, labelText, {
      fontFamily: "Montserrat, sans-serif",
      fontSize: "11px",
      color: "#f6f1e8",
      backgroundColor: "rgba(11, 18, 32, 0.78)",
      padding: { x: 6, y: 3 },
    }).setOrigin(0.5, 0).setDepth(24);
    this.doors.set(id, { label: labelText, x, y, marker, tag, action });
  }

  private movePlayerNear(x: number, y: number) {
    if (!this.player) return;
    if (this.mapMode !== "outdoor") {
      this.switchMap("outdoor");
      return;
    }
    this.player.setPosition(x, y + 42);
    this.target = null;
    this.cameras.main.pan(x, y, 220, "Quad.easeOut", true);
  }

  private inputVector() {
    let x = 0;
    let y = 0;
    if (this.cursors?.left.isDown || this.keys?.["A"]?.isDown) x -= 1;
    if (this.cursors?.right.isDown || this.keys?.["D"]?.isDown) x += 1;
    if (this.cursors?.up.isDown || this.keys?.["W"]?.isDown) y -= 1;
    if (this.cursors?.down.isDown || this.keys?.["S"]?.isDown) y += 1;
    if (x !== 0 && y !== 0) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    return { x, y };
  }

  private setFacing(vector: { x: number; y: number }) {
    if (Math.abs(vector.x) > Math.abs(vector.y)) this.facing = vector.x < 0 ? "left" : "right";
    else if (vector.y !== 0) this.facing = vector.y < 0 ? "up" : "down";
  }

  private syncAnimation() {
    if (!this.player) return;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const prefix = body.velocity.length() > 0 ? "walk" : "idle";
    const key = `${PLAYER_KEY}:${prefix}-${this.facing}`;
    if (this.player.anims.currentAnim?.key !== key) this.player.play(key);
  }

  private updateCharacterLabels() {
    for (const [id, entry] of this.characters) {
      entry.tag.setPosition(entry.sprite.x, entry.sprite.y + 34);
      entry.prompt.setPosition(entry.sprite.x, entry.sprite.y - 42);
      entry.prompt.setVisible(id === this.selectedId);
    }
  }

  private nearestInteractable():
    | { kind: "character"; data: CastMember; x: number; y: number }
    | { kind: "prop"; data: WorldProp; x: number; y: number }
    | { kind: "door"; data: DoorEntry; x: number; y: number }
    | null {
    if (!this.player) return null;
    let nearest:
      | { kind: "character"; data: CastMember; x: number; y: number }
      | { kind: "prop"; data: WorldProp; x: number; y: number }
      | { kind: "door"; data: DoorEntry; x: number; y: number }
      | null = null;
    let distance = Number.POSITIVE_INFINITY;
    for (const entry of this.doors.values()) {
      const candidateDistance = Phaser.Math.Distance.Between(this.player.x, this.player.y, entry.x, entry.y);
      if (candidateDistance < distance) {
        nearest = { kind: "door", data: entry, x: entry.x, y: entry.y };
        distance = candidateDistance;
      }
    }
    if (nearest?.kind === "door" && distance <= INTERACT_DISTANCE) return nearest;
    for (const entry of this.characters.values()) {
      if (!entry.sprite.visible) continue;
      const candidateDistance = Phaser.Math.Distance.Between(this.player.x, this.player.y, entry.sprite.x, entry.sprite.y);
      if (candidateDistance < distance) {
        nearest = { kind: "character", data: entry.data, x: entry.sprite.x, y: entry.sprite.y };
        distance = candidateDistance;
      }
    }
    for (const entry of this.props.values()) {
      if (!entry.marker.visible) continue;
      const candidateDistance = Phaser.Math.Distance.Between(this.player.x, this.player.y, entry.marker.x, entry.marker.y);
      if (candidateDistance < distance) {
        nearest = { kind: "prop", data: entry.data, x: entry.marker.x, y: entry.marker.y };
        distance = candidateDistance;
      }
    }
    return distance <= INTERACT_DISTANCE ? nearest : null;
  }

  private tryDoorTransition(): boolean {
    if (!this.player) return false;
    for (const entry of this.doors.values()) {
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, entry.x, entry.y);
      if (distance <= DOOR_TRIGGER_DISTANCE) {
        entry.action();
        return true;
      }
    }
    return false;
  }

  private talk(character: CastMember) {
    this.selectedId = character.id;
    this.onTalk(character);
  }

  private inspect(prop: WorldProp) {
    this.onInspect(prop);
  }

  private switchMap(mapMode: MapMode) {
    this.mapMode = mapMode;
    this.currentSnapshot = { ...this.currentSnapshot, activeZone: zoneForMapMode(mapMode) };
    this.onMapMode(mapMode);
    this.scene.restart({
      mapMode,
      snapshot: this.currentSnapshot,
      selectedId: this.selectedId,
    });
  }

  private mapConfig(): {
    key: string;
    width: number;
    height: number;
    zoom: number;
    characterScale: number;
    spawn: { x: number; y: number };
    tilesets: readonly (readonly [string, string])[];
  } {
    if (this.mapMode !== "outdoor") {
      return {
        key: OFFICE_MAP_KEY,
        width: OFFICE_WORLD_WIDTH,
        height: OFFICE_WORLD_HEIGHT,
        zoom: 0.9,
        characterScale: 0.86,
        spawn: { x: 610, y: 760 },
        tilesets: OFFICE_TILESETS,
      };
    }
    const zone = ZONES.find((candidate) => candidate.id === this.currentSnapshot.activeZone) ?? ZONES[0]!;
    return {
      key: MAP_KEY,
      width: WORLD_WIDTH,
      height: WORLD_HEIGHT,
      zoom: 1.5,
      characterScale: CHARACTER_SCALE,
      spawn: zone.spawn,
      tilesets: OUTDOOR_TILESETS,
    };
  }

  private characterPosition(character: CastMember): { x: number; y: number } | null {
    if (this.mapMode === "outdoor") return character.roomId ? null : { x: character.x, y: character.y };
    if (character.roomId !== this.mapMode) return null;
    const interiorPositions: Record<string, { x: number; y: number }> = {
      hq_dispatcher: { x: 420, y: 310 },
      records_clerk: { x: 565, y: 285 },
      market_keeper: { x: 420, y: 310 },
      ramen_vendor: { x: 565, y: 440 },
      dojo_attendant: { x: 520, y: 405 },
      alley_watch: { x: 520, y: 405 },
    };
    return interiorPositions[character.id] ?? null;
  }

  private propPosition(prop: WorldProp): { x: number; y: number } | null {
    if (this.mapMode === "outdoor") return prop.roomId ? null : { x: prop.x, y: prop.y };
    if (prop.roomId !== this.mapMode) return null;
    const interiorPositions: Record<string, { x: number; y: number }> = {
      hq_case_file: { x: 650, y: 320 },
      market_ledger: { x: 480, y: 390 },
      dojo_bell: { x: 610, y: 480 },
      gate_report: { x: 610, y: 480 },
    };
    return interiorPositions[prop.id] ?? null;
  }
}

function reduceCharacterTalk(snapshot: StorySnapshot, character: CastMember): { snapshot: StorySnapshot; entries: string[] } {
  if (character.id === "saitama" && snapshot.flags.couponFound && !snapshot.flags.couponReturned) {
    const flags = { ...snapshot.flags, couponReturned: true };
    return {
      snapshot: {
        ...snapshot,
        flags,
        inventory: snapshot.inventory.filter((item) => item !== "Grocery coupon"),
        activeZone: "hq",
        objective: nextObjective(flags),
      },
      entries: ["Saitama takes the coupon. Market Street opens and the alert board starts flashing."],
    };
  }
  if (character.id === "sonic" && snapshot.flags.sonicChallenged) {
    return { snapshot, entries: ["Sonic accepts the confrontation. The duel can become the next combat slice."] };
  }
  return { snapshot, entries: [`${character.name} is now available as a conversation lead.`] };
}

function reducePropInspect(snapshot: StorySnapshot, prop: WorldProp): { snapshot: StorySnapshot; entries: string[] } {
  const missing = (prop.requires ?? []).filter((flag) => !snapshot.flags[flag]);
  if (missing.length > 0) {
    return { snapshot, entries: [`${prop.label} is not useful yet.`] };
  }
  const flags = { ...snapshot.flags };
  for (const flag of prop.grants ?? []) flags[flag] = true;
  const inventory = prop.givesItem && !snapshot.inventory.includes(prop.givesItem)
    ? [...snapshot.inventory, prop.givesItem]
    : snapshot.inventory;
  const nextZone = prop.id === "challenge_mark" ? "alley" : snapshot.activeZone;
  return {
    snapshot: {
      ...snapshot,
      flags,
      inventory,
      activeZone: nextZone,
      objective: nextObjective(flags),
    },
    entries: [prop.inspectText],
  };
}

function primaryStoryAction(snapshot: StorySnapshot):
  | { kind: "prop"; label: string; prop: WorldProp }
  | { kind: "character"; label: string; characterId: string }
  | null {
  if (!snapshot.flags.couponFound) return { kind: "prop", label: "Inspect coupon box", prop: PROPS.find((prop) => prop.id === "coupon_box")! };
  if (!snapshot.flags.couponReturned) return { kind: "character", label: "Give coupon to Saitama", characterId: "saitama" };
  if (!snapshot.flags.alertRaised) return { kind: "prop", label: "Inspect alert board", prop: PROPS.find((prop) => prop.id === "alert_board")! };
  if (!snapshot.flags.sonicChallenged) return { kind: "prop", label: "Inspect challenge mark", prop: PROPS.find((prop) => prop.id === "challenge_mark")! };
  return { kind: "character", label: "Talk to Sonic", characterId: "sonic" };
}

function questSteps(snapshot: StorySnapshot): Array<{ label: string; done: boolean; current: boolean }> {
  return [
    {
      label: "Recover the missing grocery coupon near Hero HQ.",
      done: snapshot.flags.couponFound,
      current: !snapshot.flags.couponFound,
    },
    {
      label: "Return it to Saitama and unlock the market patrol.",
      done: snapshot.flags.couponReturned,
      current: snapshot.flags.couponFound && !snapshot.flags.couponReturned,
    },
    {
      label: "Check the Hero Association alert board.",
      done: snapshot.flags.alertRaised,
      current: snapshot.flags.couponReturned && !snapshot.flags.alertRaised,
    },
    {
      label: "Trace Sonic's challenge in Monster Alley.",
      done: snapshot.flags.sonicChallenged,
      current: snapshot.flags.alertRaised && !snapshot.flags.sonicChallenged,
    },
  ];
}

function zoneForMapMode(mapMode: MapMode) {
  if (mapMode === "marketInterior") return "market";
  if (mapMode === "alleyInterior") return "alley";
  return "hq";
}

function roomActionFor(zoneId: string, mapMode: MapMode): { label: string; hint: string; mapMode: MapMode } | null {
  if (mapMode !== "outdoor") return { label: "Exit to city", hint: "Outside", mapMode: "outdoor" };
  if (zoneId === "hq") return { label: "Enter Hero HQ", hint: "Room", mapMode: "hqInterior" };
  if (zoneId === "market") return { label: "Enter Market Hall", hint: "Room", mapMode: "marketInterior" };
  if (zoneId === "alley") return { label: "Enter Alley Gate", hint: "Room", mapMode: "alleyInterior" };
  return null;
}

function configureBody(sprite: Phaser.Physics.Arcade.Sprite) {
  const body = sprite.body as Phaser.Physics.Arcade.Body;
  body.setSize(FRAME_WIDTH * 0.5, FRAME_HEIGHT * 0.2);
  body.setOffset(FRAME_WIDTH * 0.25, FRAME_HEIGHT * 0.75);
}

function createCharacterAnimations(scene: Phaser.Scene, spriteKey: string) {
  if (scene.anims.exists(`${spriteKey}:idle-down`)) return;
  for (const [row, prefix, rate] of [[1, "idle", 8], [2, "walk", 10]] as const) {
    DIRECTIONS.forEach((direction, index) => {
      scene.anims.create({
        key: `${spriteKey}:${prefix}-${direction}`,
        frames: scene.anims.generateFrameNumbers(spriteKey, {
          start: row * SHEET_COLUMNS + index * FRAMES_PER_DIR,
          end: row * SHEET_COLUMNS + index * FRAMES_PER_DIR + FRAMES_PER_DIR - 1,
        }),
        frameRate: rate,
        repeat: -1,
      });
    });
  }
}

function createArrowAnimation(scene: Phaser.Scene) {
  if (scene.anims.exists("agent-town-arrow-bounce")) return;
  scene.anims.create({
    key: "agent-town-arrow-bounce",
    frames: scene.anims.generateFrameNumbers("agent-town-arrow", { start: 0, end: 5 }),
    frameRate: 6,
    repeat: -1,
  });
}

function frameFor(direction: Direction): number {
  return SHEET_COLUMNS + DIRECTIONS.indexOf(direction) * FRAMES_PER_DIR;
}

function promptStyle(): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: "Montserrat, sans-serif",
    fontSize: "14px",
    color: "#1f2937",
    backgroundColor: "#f8d44e",
    padding: { x: 8, y: 4 },
  };
}
