import * as THREE from "three";

import { activeObjectives, type Objective } from "../../../src/objectives.ts";
import { type Exit, type InteractableProp, type Item, type Location, type Npc, timeOfDay, type World } from "../../../src/types.ts";

const WORLD_SCALE = 0.018;
const MIN_BUILDING_HEIGHT = 0.45;
const DEFAULT_CAMERA_YAW = Math.atan2(4.8, 7.2);
const DEFAULT_CAMERA_DISTANCE = Math.hypot(4.8, 7.2);
const MIN_CAMERA_DISTANCE = 5.8;
const MAX_CAMERA_DISTANCE = 11.5;
const CAMERA_HEIGHT = 6.4;
const TRAVEL_ANIMATION_MS = 520;

export interface SceneLocationNode {
  id: string;
  name: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  active: boolean;
  groundColor: string;
  structureColor: string;
  accentColor: string;
  visualTags: string[];
  landmarks: string[];
}

export interface SceneActorNode {
  id: string;
  name: string;
  locationId: string;
  x: number;
  z: number;
  color: string;
  accentColor: string;
  bodyShape: "average" | "broad" | "caped" | "mechanical" | "small" | "slim";
  player: boolean;
  quest: boolean;
}

export interface SceneItemNode {
  id: string;
  name: string;
  locationId: string;
  x: number;
  z: number;
  color: string;
  emissiveColor: string;
  material: NonNullable<Item["visual"]>["material"];
  shape: NonNullable<Item["visual"]>["shape"];
  visualTags: string[];
}

export interface ScenePropNode {
  id: string;
  name: string;
  locationId: string;
  x: number;
  z: number;
  inspected: boolean;
}

export interface SceneObjectiveNode {
  id: string;
  label: string;
  text: string;
  targetType: Objective["targetType"];
  targetId: string;
  locationId: string;
  x: number;
  z: number;
  color: string;
  primary: boolean;
}

export interface ScenePathNode {
  fromId: string;
  toId: string;
  from: { x: number; z: number };
  to: { x: number; z: number };
}

export interface SceneAtmosphereNode {
  id: string;
  kind: "mist" | "spark" | "firefly" | "signal" | "dust";
  x: number;
  z: number;
  y: number;
  color: string;
  scale: number;
}

export interface SceneMoodNode {
  phase: "dawn" | "day" | "dusk" | "night";
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

export interface WorldSceneModel {
  locations: SceneLocationNode[];
  paths: ScenePathNode[];
  atmosphere: SceneAtmosphereNode[];
  actors: SceneActorNode[];
  items: SceneItemNode[];
  props: ScenePropNode[];
  objectives: SceneObjectiveNode[];
  mood: SceneMoodNode;
  bounds: { width: number; depth: number };
  cameraTarget: { x: number; z: number };
}

export function buildWorldSceneModel(world: World): WorldSceneModel {
  const bounds = worldBounds(world.locations);
  const activeLocation = world.locations.find((location) => location.id === world.player.locationId) ?? world.locations[0];
  const locations = world.locations.map((location) => locationNode(location, world.player.locationId));
  const paths = world.exits.map((exit) => pathNode(exit, world.locations)).filter((node): node is ScenePathNode => Boolean(node));
  const atmosphere = locations.flatMap((location) => atmosphereNodesFor(location));
  const actors = [
    playerNode(world, activeLocation),
    ...world.npcs
      .filter((npc) => npc.id !== world.player.characterId)
      .map((npc) => actorNode(npc, world.locations.find((location) => location.id === npc.locationId))),
  ].filter((node): node is SceneActorNode => Boolean(node));
  const items = world.items
    .map((item) => itemNode(item, world.locations.find((location) => location.id === item.locationId)))
    .filter((node): node is SceneItemNode => Boolean(node));
  const props = (world.interactables ?? [])
    .map((prop) => propNode(prop, world.locations.find((location) => location.id === prop.locationId)))
    .filter((node): node is ScenePropNode => Boolean(node));
  const objectives = activeObjectives(world)
    .slice(0, 3)
    .map((objective, index) => objectiveNode(objective, index, locations, actors, items))
    .filter((node): node is SceneObjectiveNode => Boolean(node));
  const target = activeLocation ? centerForLocation(activeLocation) : { x: 0, z: 0 };
  return {
    locations,
    paths,
    atmosphere,
    actors,
    items,
    props,
    objectives,
    mood: sceneMoodForClock(world),
    bounds,
    cameraTarget: target,
  };
}

interface ThreeWorldRendererOptions {
  onLocationSelect?: (locationId: string) => void;
  onNpcSelect?: (npcId: string) => void;
  onItemSelect?: (itemId: string) => void;
  onPropSelect?: (propId: string) => void;
  onTargetHover?: (target: SceneTarget | null) => void;
  onContextStatus?: (status: WebglContextStatus) => void;
}

export type WebglContextStatus = "ready" | "lost" | "restored";

export interface SceneTarget {
  kind: "location" | "npc" | "item" | "prop";
  id: string;
  label: string;
  action: string;
}

export class ThreeWorldRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
  private readonly hemisphereLight = new THREE.HemisphereLight(0xcfe7ff, 0x222018, 1.7);
  private readonly sunLight = new THREE.DirectionalLight(0xffe1a0, 2.2);
  private readonly root = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly pickableLocations: THREE.Object3D[] = [];
  private readonly pickableActors: THREE.Object3D[] = [];
  private readonly pickableItems: THREE.Object3D[] = [];
  private readonly pickableProps: THREE.Object3D[] = [];
  private frame = 0;
  private disposed = false;
  private onLocationSelect: ((locationId: string) => void) | null = null;
  private onNpcSelect: ((npcId: string) => void) | null = null;
  private onItemSelect: ((itemId: string) => void) | null = null;
  private onPropSelect: ((propId: string) => void) | null = null;
  private onTargetHover: ((target: SceneTarget | null) => void) | null = null;
  private onContextStatus: ((status: WebglContextStatus) => void) | null = null;
  private hoverKey: string | null = null;
  private cameraYaw = DEFAULT_CAMERA_YAW;
  private cameraDistance = DEFAULT_CAMERA_DISTANCE;
  private cameraTarget = { x: 0, z: 0 };
  private readonly previousActorPositions = new Map<string, { x: number; z: number }>();
  private readonly movingActors = new Set<THREE.Object3D>();
  private cameraMotion: TravelMotion | null = null;
  private currentWorld: World | null = null;
  private contextLost = false;

  constructor(private readonly container: HTMLElement, options: ThreeWorldRendererOptions = {}) {
    this.onLocationSelect = options.onLocationSelect ?? null;
    this.onNpcSelect = options.onNpcSelect ?? null;
    this.onItemSelect = options.onItemSelect ?? null;
    this.onPropSelect = options.onPropSelect ?? null;
    this.onTargetHover = options.onTargetHover ?? null;
    this.onContextStatus = options.onContextStatus ?? null;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x070a0f, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);
    this.renderer.domElement.addEventListener("pointerdown", this.handlePointerDown);
    this.renderer.domElement.addEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.addEventListener("pointerleave", this.handlePointerLeave);
    this.renderer.domElement.addEventListener("webglcontextlost", this.handleContextLost);
    this.renderer.domElement.addEventListener("webglcontextrestored", this.handleContextRestored);
    this.scene.add(this.root);
    this.scene.fog = new THREE.FogExp2(0x0a0d12, 0.035);
    this.sunLight.position.set(6, 10, 5);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 32;
    this.sunLight.shadow.camera.left = -10;
    this.sunLight.shadow.camera.right = 14;
    this.sunLight.shadow.camera.top = 14;
    this.sunLight.shadow.camera.bottom = -10;
    this.scene.add(this.hemisphereLight, this.sunLight);
    this.resize();
  }

  resize(): void {
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(320, Math.round(rect.width));
    const height = Math.max(240, Math.round(rect.height));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  renderWorld(world: World): void {
    this.currentWorld = world;
    if (this.contextLost) return;
    const model = buildWorldSceneModel(world);
    this.applySceneMood(model.mood);
    disposeObjectTree(this.root);
    this.root.clear();
    this.pickableLocations.length = 0;
    this.pickableActors.length = 0;
    this.pickableItems.length = 0;
    this.pickableProps.length = 0;
    this.root.add(makeGround(model));
    this.root.add(makeSkyline(model));
    for (const path of model.paths) this.root.add(makePathMesh(path));
    this.root.add(makeAtmosphereMesh(model.atmosphere));
    for (const location of model.locations) {
      const mesh = makeLocationMesh(location);
      this.root.add(mesh);
      const pickable = mesh.getObjectByName(`pick:${location.id}`);
      if (pickable) this.pickableLocations.push(pickable);
      this.root.add(makeLabelSprite(location.name, location.x, location.height + 0.34, location.z, location.active));
    }
    for (const prop of model.props) {
      const mesh = makePropMesh(prop);
      this.root.add(mesh);
      const pickable = mesh.getObjectByName(`pick:prop:${prop.id}`);
      if (pickable) this.pickableProps.push(pickable);
    }
    for (const item of model.items) {
      const mesh = makeItemMesh(item);
      this.root.add(mesh);
      const pickable = mesh.getObjectByName(`pick:item:${item.id}`);
      if (pickable) this.pickableItems.push(pickable);
    }
    for (const actor of model.actors) {
      const motion = this.actorMotion(actor);
      const mesh = makeActorMesh(actor, motion);
      this.root.add(mesh);
      if (motion) this.movingActors.add(mesh);
      const pickable = mesh.getObjectByName(`pick:actor:${actor.id}`);
      if (!actor.player && pickable) this.pickableActors.push(pickable);
    }
    for (const objective of model.objectives) this.root.add(makeObjectiveBeaconMesh(objective));
    this.startCameraMotion(model.cameraTarget);
    this.previousActorPositions.clear();
    for (const actor of model.actors) this.previousActorPositions.set(actor.id, { x: actor.x, z: actor.z });
    this.updateCamera();
  }

  orbitCamera(deltaRadians: number): number {
    this.cameraYaw = normalizeRadians(this.cameraYaw + deltaRadians);
    this.updateCamera();
    return this.cameraBearingDegrees();
  }

  resetCamera(): number {
    this.cameraYaw = DEFAULT_CAMERA_YAW;
    this.cameraDistance = DEFAULT_CAMERA_DISTANCE;
    this.updateCamera();
    return this.cameraBearingDegrees();
  }

  zoomCamera(delta: number): number {
    this.cameraDistance = clamp(this.cameraDistance + delta, MIN_CAMERA_DISTANCE, MAX_CAMERA_DISTANCE);
    this.updateCamera();
    return this.cameraZoomPercent();
  }

  cameraBearingDegrees(): number {
    return Math.round(normalizeRadians(this.cameraYaw) * 180 / Math.PI);
  }

  cameraZoomPercent(): number {
    const progress = (MAX_CAMERA_DISTANCE - this.cameraDistance) / (MAX_CAMERA_DISTANCE - MIN_CAMERA_DISTANCE);
    return Math.round(clamp(progress, 0, 1) * 100);
  }

  render(): void {
    if (this.contextLost) return;
    this.renderer.render(this.scene, this.camera);
  }

  start(): void {
    const animate = () => {
      if (this.disposed) return;
      this.frame = requestAnimationFrame(animate);
      const now = performance.now();
      this.root.rotation.y = Math.sin(now / 5800) * 0.015;
      this.animateTravel(now);
      this.animateSceneAffordances(now);
      this.render();
    };
    animate();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.renderer.domElement.removeEventListener("pointerdown", this.handlePointerDown);
    this.renderer.domElement.removeEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.removeEventListener("pointerleave", this.handlePointerLeave);
    this.renderer.domElement.removeEventListener("webglcontextlost", this.handleContextLost);
    this.renderer.domElement.removeEventListener("webglcontextrestored", this.handleContextRestored);
    disposeObjectTree(this.root);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    const target = this.targetAt(event);
    if (target?.kind === "npc") {
      this.onNpcSelect?.(target.id);
      return;
    }
    if (target?.kind === "item") {
      this.onItemSelect?.(target.id);
      return;
    }
    if (target?.kind === "prop") {
      this.onPropSelect?.(target.id);
      return;
    }
    if (target?.kind === "location") this.onLocationSelect?.(target.id);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const target = this.targetAt(event);
    const key = target ? `${target.kind}:${target.id}` : null;
    this.renderer.domElement.style.cursor = target ? "pointer" : "";
    if (key === this.hoverKey) return;
    this.hoverKey = key;
    this.onTargetHover?.(target);
  };

  private readonly handlePointerLeave = (): void => {
    this.renderer.domElement.style.cursor = "";
    if (!this.hoverKey) return;
    this.hoverKey = null;
    this.onTargetHover?.(null);
  };

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
    this.movingActors.clear();
    this.cameraMotion = null;
    this.renderer.domElement.style.cursor = "";
    this.onTargetHover?.(null);
    this.onContextStatus?.("lost");
  };

  private readonly handleContextRestored = (): void => {
    this.contextLost = false;
    this.onContextStatus?.("restored");
    if (this.currentWorld) this.renderWorld(this.currentWorld);
    this.render();
    window.setTimeout(() => this.onContextStatus?.("ready"), 900);
  };

  private updateCamera(): void {
    this.camera.position.set(
      this.cameraTarget.x + Math.sin(this.cameraYaw) * this.cameraDistance,
      CAMERA_HEIGHT,
      this.cameraTarget.z + Math.cos(this.cameraYaw) * this.cameraDistance
    );
    this.camera.lookAt(this.cameraTarget.x, 0.25, this.cameraTarget.z);
    this.render();
  }

  private applySceneMood(mood: SceneMoodNode): void {
    this.renderer.setClearColor(new THREE.Color(mood.skyColor), 1);
    this.scene.fog = new THREE.FogExp2(new THREE.Color(mood.fogColor), mood.fogDensity);
    this.hemisphereLight.color.set(mood.hemisphereSky);
    this.hemisphereLight.groundColor.set(mood.hemisphereGround);
    this.hemisphereLight.intensity = mood.hemisphereIntensity;
    this.sunLight.color.set(mood.sunColor);
    this.sunLight.intensity = mood.sunIntensity;
    this.sunLight.position.set(mood.sunPosition.x, mood.sunPosition.y, mood.sunPosition.z);
  }

  private actorMotion(actor: SceneActorNode): TravelMotion | null {
    const previous = this.previousActorPositions.get(actor.id);
    if (!previous || distance(previous, actor) < 0.01) return null;
    return { from: previous, to: { x: actor.x, z: actor.z }, startedAt: performance.now(), durationMs: TRAVEL_ANIMATION_MS };
  }

  private startCameraMotion(target: { x: number; z: number }): void {
    if (distance(this.cameraTarget, target) < 0.01) {
      this.cameraTarget = target;
      this.cameraMotion = null;
      return;
    }
    this.cameraMotion = { from: this.cameraTarget, to: target, startedAt: performance.now(), durationMs: TRAVEL_ANIMATION_MS };
  }

  private animateTravel(now: number): void {
    for (const actor of [...this.movingActors]) {
      const motion = readTravelMotion(actor);
      if (motion) {
        const progress = easedProgress(motion, now);
        actor.position.set(lerp(motion.from.x, motion.to.x, progress), 0, lerp(motion.from.z, motion.to.z, progress));
        if (progress >= 1) this.movingActors.delete(actor);
      } else {
        this.movingActors.delete(actor);
      }
    }
    if (this.cameraMotion) {
      const progress = easedProgress(this.cameraMotion, now);
      this.cameraTarget = {
        x: lerp(this.cameraMotion.from.x, this.cameraMotion.to.x, progress),
        z: lerp(this.cameraMotion.from.z, this.cameraMotion.to.z, progress),
      };
      if (progress >= 1) this.cameraMotion = null;
      this.updateCamera();
    }
  }

  private animateSceneAffordances(now: number): void {
    this.root.traverse((object) => {
      const animation = object.userData["sceneAnimation"];
      if (!isSceneAnimation(animation)) return;
      const phase = now / animation.speedMs + animation.offset;
      if (animation.kind === "bob") object.position.y = animation.baseY + Math.sin(phase) * animation.amplitude;
      if (animation.kind === "pulse") object.scale.setScalar(animation.baseScale + Math.sin(phase) * animation.amplitude);
    });
  }

  private targetAt(event: PointerEvent): SceneTarget | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return (
      this.firstHitTarget(this.pickableItems) ??
      this.firstHitTarget(this.pickableProps) ??
      this.firstHitTarget(this.pickableActors) ??
      this.firstHitTarget(this.pickableLocations)
    );
  }

  private firstHitTarget(objects: THREE.Object3D[]): SceneTarget | null {
    if (objects.length === 0) return null;
    const hit = this.raycaster.intersectObjects(objects, false)[0];
    const target = hit?.object.userData["target"];
    return isSceneTarget(target) ? target : null;
  }
}

interface TravelMotion {
  from: { x: number; z: number };
  to: { x: number; z: number };
  startedAt: number;
  durationMs: number;
}

interface SceneAnimation {
  kind: "bob" | "pulse";
  baseY: number;
  baseScale: number;
  amplitude: number;
  speedMs: number;
  offset: number;
}

function normalizeRadians(value: number): number {
  const fullTurn = Math.PI * 2;
  return ((value % fullTurn) + fullTurn) % fullTurn;
}

function isSceneTarget(value: unknown): value is SceneTarget {
  return Boolean(value && typeof value === "object" && typeof (value as SceneTarget).id === "string" && typeof (value as SceneTarget).label === "string");
}

function isSceneAnimation(value: unknown): value is SceneAnimation {
  return Boolean(value && typeof value === "object" && typeof (value as SceneAnimation).kind === "string");
}

function readTravelMotion(object: THREE.Object3D): TravelMotion | null {
  const motion = object.userData["travelMotion"];
  return motion && typeof motion === "object" ? motion as TravelMotion : null;
}

function easedProgress(motion: TravelMotion, now: number): number {
  const raw = Math.min(1, Math.max(0, (now - motion.startedAt) / motion.durationMs));
  return raw * raw * (3 - 2 * raw);
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function distance(from: { x: number; z: number }, to: { x: number; z: number }): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

function worldBounds(locations: Location[]): { width: number; depth: number } {
  const maxX = Math.max(...locations.map((location) => location.x + location.w), 1);
  const maxY = Math.max(...locations.map((location) => location.y + location.h), 1);
  return { width: maxX * WORLD_SCALE, depth: maxY * WORLD_SCALE };
}

function centerForLocation(location: Location): { x: number; z: number } {
  return {
    x: (location.x + location.w / 2) * WORLD_SCALE,
    z: (location.y + location.h / 2) * WORLD_SCALE,
  };
}

function locationNode(location: Location, activeLocationId: string): SceneLocationNode {
  const center = centerForLocation(location);
  const area = location.w * location.h;
  const palette = locationPalette(location);
  return {
    id: location.id,
    name: location.name,
    x: center.x,
    z: center.z,
    width: Math.max(0.9, location.w * WORLD_SCALE),
    depth: Math.max(0.72, location.h * WORLD_SCALE),
    height: MIN_BUILDING_HEIGHT + Math.min(1.6, area / 90_000) + (location.visual?.elevation ?? 0),
    active: location.id === activeLocationId,
    groundColor: palette.ground,
    structureColor: palette.structure,
    accentColor: palette.accent,
    visualTags: location.visual?.visualTags ?? [],
    landmarks: location.visual?.landmarks ?? fallbackLandmarks(location),
  };
}

function locationPalette(location: Location): { ground: string; structure: string; accent: string } {
  const fallback = paletteForText(`${location.id} ${location.name}`);
  return {
    ground: location.visual?.palette?.ground ?? fallback.ground,
    structure: location.visual?.palette?.structure ?? fallback.structure,
    accent: location.visual?.palette?.accent ?? fallback.accent,
  };
}

function paletteForText(text: string): { ground: string; structure: string; accent: string } {
  if (/forge|training|engine|repair/i.test(text)) return { ground: "#3a3028", structure: "#8a4c2e", accent: "#f08a38" };
  if (/garden|wood|rookery|home/i.test(text)) return { ground: "#243f2a", structure: "#497c4a", accent: "#b5e48c" };
  if (/bridge|overpass|alley|threat/i.test(text)) return { ground: "#27313d", structure: "#657180", accent: "#7fd0ff" };
  if (/inn|kiosk|counter|report/i.test(text)) return { ground: "#2f3344", structure: "#596477", accent: "#f8d44e" };
  return { ground: "#283546", structure: "#5d718b", accent: "#f5d782" };
}

function fallbackLandmarks(location: Location): string[] {
  const text = `${location.id} ${location.name}`;
  if (/forge|training|engine/i.test(text)) return ["forge_chimney"];
  if (/garden|wood|rookery/i.test(text)) return ["garden_planter"];
  if (/inn|kiosk|counter/i.test(text)) return ["lantern_post"];
  if (/bridge|overpass/i.test(text)) return ["bridge_span"];
  return ["notice_board"];
}

function pathNode(exit: Exit, locations: Location[]): ScenePathNode | null {
  const from = locations.find((location) => location.id === exit.from);
  const to = locations.find((location) => location.id === exit.to);
  if (!from || !to) return null;
  return {
    fromId: from.id,
    toId: to.id,
    from: centerForLocation(from),
    to: centerForLocation(to),
  };
}

function atmosphereNodesFor(location: SceneLocationNode): SceneAtmosphereNode[] {
  const kind = atmosphereKindFor(location);
  const count = location.active ? 5 : 3;
  return Array.from({ length: count }, (_, index) => {
    const offset = stableOffset(`${location.id}:atmosphere:${index}`, 0.72 + index * 0.08);
    return {
      id: `${location.id}:${kind}:${index}`,
      kind,
      x: location.x + offset.x,
      z: location.z + offset.z,
      y: location.height + 0.28 + (index % 3) * 0.16,
      color: atmosphereColor(kind, location),
      scale: 0.75 + (index % 4) * 0.12,
    };
  });
}

function atmosphereKindFor(location: SceneLocationNode): SceneAtmosphereNode["kind"] {
  const text = `${location.name} ${location.visualTags.join(" ")} ${location.landmarks.join(" ")}`.toLowerCase();
  if (/bridge|overpass|alley|threat|monster|ruin/.test(text)) return "dust";
  if (/cloud|fog|sky|harbor|rookery/.test(text)) return "mist";
  if (/forge|engine|metal|soot|cyborg|training/.test(text)) return "spark";
  if (/garden|wood|herb|home/.test(text)) return "firefly";
  return "signal";
}

function atmosphereColor(kind: SceneAtmosphereNode["kind"], location: SceneLocationNode): string {
  if (kind === "mist") return "#9fc3ff";
  if (kind === "dust") return "#b9a58f";
  return location.accentColor;
}

function sceneMoodForClock(world: World): SceneMoodNode {
  const phase = timeOfDay(world.clock);
  if (phase === "dawn") {
    return {
      phase,
      skyColor: "#101827",
      fogColor: "#27384c",
      fogDensity: 0.04,
      hemisphereSky: "#ffd59a",
      hemisphereGround: "#263128",
      hemisphereIntensity: 1.55,
      sunColor: "#ffd28a",
      sunIntensity: 2,
      sunPosition: { x: -4.5, y: 7.2, z: 6.6 },
    };
  }
  if (phase === "dusk") {
    return {
      phase,
      skyColor: "#130f1c",
      fogColor: "#3b2b3d",
      fogDensity: 0.047,
      hemisphereSky: "#ff9f7a",
      hemisphereGround: "#1b202d",
      hemisphereIntensity: 1.3,
      sunColor: "#ff8f5a",
      sunIntensity: 1.55,
      sunPosition: { x: 6.8, y: 4.6, z: -4.2 },
    };
  }
  if (phase === "night") {
    return {
      phase,
      skyColor: "#050812",
      fogColor: "#111827",
      fogDensity: 0.058,
      hemisphereSky: "#7fa8ff",
      hemisphereGround: "#090a0f",
      hemisphereIntensity: 0.9,
      sunColor: "#89a7ff",
      sunIntensity: 0.65,
      sunPosition: { x: -5.8, y: 6.2, z: -4.8 },
    };
  }
  return {
    phase,
    skyColor: "#07111d",
    fogColor: "#0a0d12",
    fogDensity: 0.035,
    hemisphereSky: "#cfe7ff",
    hemisphereGround: "#222018",
    hemisphereIntensity: 1.7,
    sunColor: "#ffe1a0",
    sunIntensity: 2.2,
    sunPosition: { x: 6, y: 10, z: 5 },
  };
}

function playerNode(world: World, location: Location | undefined): SceneActorNode | null {
  if (!location) return null;
  const center = centerForLocation(location);
  const visual = actorVisualFor(world.player.appearance, "#58a6ff");
  return {
    id: "player",
    name: world.player.name ?? "Player",
    locationId: location.id,
    x: center.x,
    z: center.z,
    color: visual.color,
    accentColor: visual.accentColor,
    bodyShape: visual.bodyShape,
    player: true,
    quest: false,
  };
}

function actorNode(npc: Npc, location: Location | undefined): SceneActorNode | null {
  if (!location) return null;
  const center = centerForLocation(location);
  const offset = stableOffset(npc.id, 0.42);
  const visual = actorVisualFor(npc.appearance, npc.tier === "quest" ? "#b5e48c" : "#ff8a65");
  return {
    id: npc.id,
    name: npc.name,
    locationId: location.id,
    x: center.x + offset.x,
    z: center.z + offset.z,
    color: visual.color,
    accentColor: visual.accentColor,
    bodyShape: visual.bodyShape,
    player: false,
    quest: npc.tier === "quest",
  };
}

function actorVisualFor(appearance: Npc["appearance"] | World["player"]["appearance"], fallbackColor: string): {
  color: string;
  accentColor: string;
  bodyShape: SceneActorNode["bodyShape"];
} {
  const palette = appearance?.palette ?? [];
  return {
    color: palette[0] ?? fallbackColor,
    accentColor: palette[2] ?? palette[1] ?? palette[0] ?? fallbackColor,
    bodyShape: actorBodyShapeFor(appearance),
  };
}

function actorBodyShapeFor(appearance: Npc["appearance"] | World["player"]["appearance"]): SceneActorNode["bodyShape"] {
  const text = `${appearance?.sourceLook ?? ""} ${appearance?.bodyType ?? ""} ${appearance?.silhouette ?? ""} ${appearance?.outfit ?? ""} ${(appearance?.visualTags ?? []).join(" ")}`.toLowerCase();
  if (/cyborg|mechanical|robot|armor|armored/.test(text)) return "mechanical";
  if (/cape|caped|cloak/.test(text)) return "caped";
  if (/child|small|short|quick/.test(text)) return "small";
  if (/broad|strong|heavy|blacksmith|large|shoulder/.test(text)) return "broad";
  if (/lean|slim|ninja|floating|psychic|athletic/.test(text)) return "slim";
  return "average";
}

function itemNode(item: Item, location: Location | undefined): SceneItemNode | null {
  if (!location || item.holderId) return null;
  const center = centerForLocation(location);
  const offset = stableOffset(item.id, 0.58);
  const visual = itemVisualFor(item);
  return {
    id: item.id,
    name: item.name,
    locationId: location.id,
    x: center.x + offset.x,
    z: center.z + offset.z,
    color: visual.color,
    emissiveColor: visual.emissiveColor,
    material: visual.material,
    shape: visual.shape,
    visualTags: visual.visualTags,
  };
}

function itemVisualFor(item: Item): {
  color: string;
  emissiveColor: string;
  material: NonNullable<Item["visual"]>["material"];
  shape: NonNullable<Item["visual"]>["shape"];
  visualTags: string[];
} {
  const fallback = itemVisualFallback(`${item.id} ${item.name} ${item.description ?? ""}`);
  return {
    color: item.visual?.palette?.primary ?? fallback.color,
    emissiveColor: item.visual?.palette?.emissive ?? fallback.emissiveColor,
    material: item.visual?.material ?? fallback.material,
    shape: item.visual?.shape ?? fallback.shape,
    visualTags: item.visual?.visualTags ?? fallback.visualTags,
  };
}

function itemVisualFallback(text: string): {
  color: string;
  emissiveColor: string;
  material: NonNullable<Item["visual"]>["material"];
  shape: NonNullable<Item["visual"]>["shape"];
  visualTags: string[];
} {
  if (/gear|core|crystal|prism|glass|ember/i.test(text)) {
    return { color: "#9fc3ff", emissiveColor: "#12304a", material: "crystal", shape: /gear/i.test(text) ? "gear" : "core", visualTags: itemVisualTags(text) };
  }
  if (/flag|scrap|cloth|paint/i.test(text)) {
    return { color: "#e05f7a", emissiveColor: "#3a1420", material: "cloth", shape: "scrap", visualTags: itemVisualTags(text) };
  }
  if (/coupon|note|paper|map|letter/i.test(text)) {
    return { color: "#f7e8a5", emissiveColor: "#3d331a", material: "paper", shape: "note", visualTags: itemVisualTags(text) };
  }
  if (/radio|signal/i.test(text)) {
    return { color: "#596477", emissiveColor: "#7fd0ff", material: "radio", shape: "radio", visualTags: itemVisualTags(text) };
  }
  if (/scale|bone|shell|fang/i.test(text)) {
    return { color: "#7fd0ff", emissiveColor: "#17324a", material: "organic", shape: "scale", visualTags: itemVisualTags(text) };
  }
  if (/token|coin|brass|badge|key/i.test(text)) {
    return { color: "#d8a441", emissiveColor: "#3d2a05", material: "metal", shape: "token", visualTags: itemVisualTags(text) };
  }
  return { color: "#f8d44e", emissiveColor: "#4a3300", material: "metal", shape: "trinket", visualTags: itemVisualTags(text) };
}

function itemVisualTags(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 3).slice(0, 6);
}

function propNode(prop: InteractableProp, location: Location | undefined): ScenePropNode | null {
  if (!location) return null;
  const center = centerForLocation(location);
  const offset = stableOffset(prop.id, 0.54);
  return {
    id: prop.id,
    name: prop.name,
    locationId: location.id,
    x: center.x + offset.x,
    z: center.z + offset.z,
    inspected: Boolean(prop.inspected),
  };
}

function objectiveNode(
  objective: Objective,
  index: number,
  locations: SceneLocationNode[],
  actors: SceneActorNode[],
  items: SceneItemNode[]
): SceneObjectiveNode | null {
  const target =
    objective.targetType === "item"
      ? items.find((item) => item.id === objective.targetId)
      : objective.targetType === "npc"
        ? actors.find((actor) => actor.id === objective.targetId)
        : locations.find((location) => location.id === objective.locationId);
  const fallback = locations.find((location) => location.id === objective.locationId);
  const anchor = target ?? fallback;
  if (!anchor) return null;
  return {
    id: objective.questId,
    label: objective.questTitle,
    text: objective.text,
    targetType: objective.targetType,
    targetId: objective.targetId,
    locationId: objective.locationId,
    x: anchor.x,
    z: anchor.z,
    color: objective.status === "active" ? "#f8d44e" : "#9fc3ff",
    primary: index === 0,
  };
}

function stableOffset(id: string, radius: number): { x: number; z: number } {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const angle = (hash % 360) * Math.PI / 180;
  const scale = 0.45 + ((hash >> 8) % 40) / 100;
  return { x: Math.cos(angle) * radius * scale, z: Math.sin(angle) * radius * scale };
}

function makeGround(model: WorldSceneModel): THREE.Object3D {
  const geometry = new THREE.BoxGeometry(model.bounds.width + 2.4, 0.08, model.bounds.depth + 2.4);
  const material = new THREE.MeshStandardMaterial({ color: 0x172018, roughness: 0.9, metalness: 0.02 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(model.bounds.width / 2, -0.06, model.bounds.depth / 2);
  applyShadows(mesh, { receive: true });
  return mesh;
}

function makeSkyline(model: WorldSceneModel): THREE.Object3D {
  const group = new THREE.Group();
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.92, metalness: 0.02 });
  const back = new THREE.Mesh(new THREE.BoxGeometry(model.bounds.width + 4, 2.6, 0.08), wallMaterial);
  back.position.set(model.bounds.width / 2, 1.25, -1.2);
  const side = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, model.bounds.depth + 2), wallMaterial);
  side.position.set(-1.1, 1.05, model.bounds.depth / 2);
  group.add(back, side);
  applyShadows(group, { receive: true });
  return group;
}

function makePathMesh(path: ScenePathNode): THREE.Object3D {
  const dx = path.to.x - path.from.x;
  const dz = path.to.z - path.from.z;
  const length = Math.hypot(dx, dz);
  const geometry = new THREE.BoxGeometry(0.13, 0.045, Math.max(0.1, length));
  const material = new THREE.MeshStandardMaterial({ color: 0x7d8796, roughness: 0.86, metalness: 0.03 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set((path.from.x + path.to.x) / 2, 0.025, (path.from.z + path.to.z) / 2);
  mesh.rotation.y = Math.atan2(dx, dz);
  applyShadows(mesh, { receive: true });
  return mesh;
}

function makeAtmosphereMesh(nodes: SceneAtmosphereNode[]): THREE.Object3D {
  const group = new THREE.Group();
  group.name = "atmosphere";
  for (const node of nodes) {
    const color = new THREE.Color(node.color);
    const radius = node.kind === "mist" ? 0.16 : node.kind === "dust" ? 0.055 : 0.038;
    const opacity = node.kind === "mist" ? 0.18 : node.kind === "dust" ? 0.22 : 0.68;
    const geometry = new THREE.SphereGeometry(radius * node.scale, node.kind === "mist" ? 12 : 8, node.kind === "mist" ? 8 : 6);
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `atmosphere:${node.id}`;
    mesh.position.set(node.x, node.y, node.z);
    mesh.userData["sceneAnimation"] =
      node.kind === "mist" || node.kind === "dust"
        ? bobAnimation(node.id, node.y, node.kind === "mist" ? 0.055 : 0.025)
        : pulseAnimation(node.id, node.scale, node.kind === "spark" ? 0.18 : 0.1);
    group.add(mesh);
  }
  return group;
}

function makeLocationMesh(location: SceneLocationNode): THREE.Object3D {
  const group = new THREE.Group();
  group.name = `location:${location.id}`;
  const geometry = new THREE.BoxGeometry(location.width, location.height, location.depth);
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(location.active ? location.accentColor : location.structureColor),
    roughness: 0.74,
    metalness: location.visualTags.some((tag) => /metal|cyborg|kiosk|engine/.test(tag)) ? 0.16 : 0.04,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `pick:${location.id}`;
  mesh.userData["locationId"] = location.id;
  mesh.userData["target"] = { kind: "location", id: location.id, label: location.name, action: "Travel" } satisfies SceneTarget;
  mesh.position.set(location.x, location.height / 2, location.z);
  group.add(mesh);

  const ring = new THREE.Mesh(
    new THREE.BoxGeometry(location.width + 0.08, 0.035, location.depth + 0.08),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(location.active ? location.accentColor : location.groundColor), roughness: 0.8 })
  );
  ring.position.set(location.x, 0.02, location.z);
  group.add(ring);
  for (const landmark of location.landmarks) group.add(makeLandmarkMesh(landmark, location));
  if (location.active) {
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.22, 0.9, 16, 1, true),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(location.accentColor), emissive: 0x5f4300, transparent: true, opacity: 0.42 })
    );
    beacon.position.set(location.x, location.height + 0.52, location.z);
    group.add(beacon);
  }
  applyShadows(group, { cast: true, receive: true });
  return group;
}

function makeLandmarkMesh(kind: string, location: SceneLocationNode): THREE.Object3D {
  const group = new THREE.Group();
  group.name = `landmark:${kind}`;
  const accent = new THREE.Color(location.accentColor);
  const structure = new THREE.Color(location.structureColor);
  const x = location.x - location.width * 0.3;
  const z = location.z + location.depth * 0.28;
  if (kind === "forge_chimney" || kind === "engine_stack") {
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.72, 10), new THREE.MeshStandardMaterial({ color: 0x2f2420, roughness: 0.65 }));
    stack.position.set(x, location.height + 0.36, z);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.55 }));
    glow.position.set(x, location.height + 0.78, z);
    group.add(stack, glow);
    return group;
  }
  if (kind === "signal_tower" || kind === "apartment_tower") {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.95, 0.18), new THREE.MeshStandardMaterial({ color: structure, roughness: 0.72 }));
    tower.position.set(x, location.height + 0.48, z);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.38), new THREE.MeshStandardMaterial({ color: accent, roughness: 0.48 }));
    cap.position.set(x, location.height + 1, z);
    group.add(tower, cap);
    return group;
  }
  if (kind === "garden_planter" || kind === "wood_tree") {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.38, 8), new THREE.MeshStandardMaterial({ color: 0x6d4930, roughness: 0.8 }));
    trunk.position.set(x, location.height + 0.2, z);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 8), new THREE.MeshStandardMaterial({ color: accent, roughness: 0.82 }));
    crown.position.set(x, location.height + 0.48, z);
    group.add(trunk, crown);
    return group;
  }
  if (kind === "bridge_span") {
    const span = new THREE.Mesh(new THREE.BoxGeometry(location.width * 0.72, 0.08, 0.12), new THREE.MeshStandardMaterial({ color: structure, roughness: 0.7 }));
    span.position.set(location.x, location.height + 0.26, location.z);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(location.width * 0.78, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: accent, roughness: 0.58 }));
    rail.position.set(location.x, location.height + 0.44, location.z - 0.11);
    group.add(span, rail);
    return group;
  }
  if (kind === "lantern_post" || kind === "kiosk_sign" || kind === "notice_board") {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.56, 0.06), new THREE.MeshStandardMaterial({ color: structure, roughness: 0.68 }));
    post.position.set(x, location.height + 0.28, z);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.22, 0.04), new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5 }));
    sign.position.set(x, location.height + 0.54, z);
    group.add(post, sign);
    return group;
  }
  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5 }));
  marker.position.set(x, location.height + 0.28, z);
  group.add(marker);
  return group;
}

function makeLabelSprite(text: string, x: number, y: number, z: number, active: boolean): THREE.Object3D {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = active ? "rgba(248, 212, 78, 0.92)" : "rgba(230, 233, 239, 0.82)";
    ctx.font = "700 22px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text.slice(0, 22), canvas.width / 2, canvas.height / 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.position.set(x, y, z);
  sprite.scale.set(1.8, 0.45, 1);
  return sprite;
}

function makeActorMesh(actor: SceneActorNode, motion: TravelMotion | null = null): THREE.Object3D {
  const radius = actorRadius(actor);
  const height = actorHeight(actor);
  const geometry = new THREE.CapsuleGeometry(radius, height, 5, 10);
  const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(actor.color), roughness: 0.48 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `pick:actor:${actor.id}`;
  mesh.userData["actorId"] = actor.id;
  mesh.userData["target"] = { kind: "npc", id: actor.id, label: actor.name, action: "Talk" } satisfies SceneTarget;
  mesh.position.set(0, height / 2 + 0.16, 0);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 1.45, 18),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: actor.player ? 0.32 : 0.22 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, 0.035, 0);
  const group = new THREE.Group();
  group.position.set(motion?.from.x ?? actor.x, 0, motion?.from.z ?? actor.z);
  if (motion) group.userData["travelMotion"] = motion;
  const halo = makeTargetHalo(actor.player ? "#58a6ff" : actor.quest ? "#b5e48c" : actor.color, actor.player ? 0.38 : 0.3, actor.player ? 0.18 : 0.12);
  halo.userData["sceneAnimation"] = pulseAnimation(actor.id, 1, actor.player ? 0.08 : 0.05);
  group.add(shadow, halo, mesh);
  const accessory = makeActorAccessoryMesh(actor, height, radius);
  if (accessory) group.add(accessory);
  group.add(makeActorNameplate(actor, height));
  applyShadows(mesh, { cast: true });
  return group;
}

function actorRadius(actor: SceneActorNode): number {
  if (actor.bodyShape === "broad") return actor.player ? 0.22 : 0.18;
  if (actor.bodyShape === "small" || actor.bodyShape === "slim") return actor.player ? 0.16 : 0.12;
  return actor.player ? 0.18 : 0.14;
}

function actorHeight(actor: SceneActorNode): number {
  if (actor.bodyShape === "small") return actor.player ? 0.58 : 0.44;
  if (actor.bodyShape === "broad") return actor.player ? 0.76 : 0.66;
  if (actor.bodyShape === "slim") return actor.player ? 0.76 : 0.58;
  return actor.player ? 0.72 : actor.quest ? 0.62 : 0.52;
}

function makeActorAccessoryMesh(actor: SceneActorNode, height: number, radius: number): THREE.Object3D | null {
  const accent = new THREE.Color(actor.accentColor);
  const material = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5, metalness: actor.bodyShape === "mechanical" ? 0.42 : 0.04 });
  const group = new THREE.Group();
  group.name = `actor-accessory:${actor.id}:${actor.bodyShape}`;
  if (actor.bodyShape === "caped") {
    const cape = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2.6, height * 0.82), material);
    cape.position.set(0, height * 0.72, radius + 0.045);
    cape.rotation.x = -0.18;
    group.add(cape);
  } else if (actor.bodyShape === "mechanical") {
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.32, radius * 0.32, height * 0.62, 8), material);
      arm.position.set(side * radius * 1.42, height * 0.64, 0);
      arm.rotation.z = side * 0.18;
      group.add(arm);
    }
  } else if (actor.bodyShape === "broad") {
    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.7, 0.12, radius * 1.2), material);
    shoulders.position.set(0, height + 0.28, 0);
    group.add(shoulders);
  } else if (actor.bodyShape === "small") {
    const satchel = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.9, 0.12, radius * 0.5), material);
    satchel.position.set(radius * 0.9, height * 0.62, -radius * 0.35);
    group.add(satchel);
  } else if (actor.bodyShape === "slim") {
    const sash = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.92, 0.018, 6, 18), material);
    sash.position.set(0, height * 0.72, 0);
    sash.rotation.x = Math.PI / 2;
    sash.rotation.z = 0.35;
    group.add(sash);
  }
  for (const child of group.children) applyShadows(child, { cast: true });
  return group.children.length > 0 ? group : null;
}

function makeActorNameplate(actor: SceneActorNode, height: number): THREE.Object3D {
  const label = makeLabelSprite(actor.name, 0, height + 0.72, 0, actor.player || actor.quest);
  label.name = `actor-nameplate:${actor.id}`;
  label.scale.set(actor.player ? 1.35 : 1.05, actor.player ? 0.34 : 0.26, 1);
  return label;
}

function makeItemMesh(item: SceneItemNode): THREE.Object3D {
  const group = new THREE.Group();
  group.position.set(item.x, 0, item.z);
  const pickTarget = { kind: "item", id: item.id, label: item.name, action: "Pick up" } satisfies SceneTarget;
  const hitMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })
  );
  hitMesh.name = `pick:item:${item.id}`;
  hitMesh.userData["itemId"] = item.id;
  hitMesh.userData["target"] = pickTarget;
  hitMesh.position.set(0, 0.28, 0);
  const mesh = makeItemShapeMesh(item);
  mesh.name = `item:${item.id}`;
  mesh.userData["itemId"] = item.id;
  mesh.userData["target"] = pickTarget;
  mesh.position.set(0, 0.24, 0);
  mesh.userData["sceneAnimation"] = bobAnimation(item.id, 0.24, 0.045);
  group.add(makeTargetHalo(item.color, 0.28, 0.16), hitMesh, mesh);
  applyShadows(mesh, { cast: true });
  return group;
}

function makeItemShapeMesh(item: SceneItemNode): THREE.Mesh {
  const color = new THREE.Color(item.color);
  const emissive = new THREE.Color(item.emissiveColor);
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: item.material === "glass" || item.material === "crystal" ? 0.42 : item.material === "radio" ? 0.28 : 0.18,
    roughness: item.material === "paper" || item.material === "cloth" ? 0.72 : 0.32,
    metalness: item.material === "metal" || item.material === "radio" ? 0.38 : 0.04,
    side: item.shape === "note" || item.shape === "scrap" ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (item.shape === "token") return new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.045, 24), material);
  if (item.shape === "gear") return new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.03, 8, 22), material);
  if (item.shape === "note") return rotatedItemPlane(new THREE.PlaneGeometry(0.22, 0.15), material);
  if (item.shape === "scrap") return rotatedItemPlane(new THREE.PlaneGeometry(0.25, 0.13), material);
  if (item.shape === "radio") return new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.14, 0.11), material);
  if (item.shape === "scale") return rotatedItemPlane(new THREE.CircleGeometry(0.12, 3), material);
  if (item.shape === "core") return new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 1), material);
  return new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 1), material);
}

function rotatedItemPlane(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2.6;
  mesh.rotation.z = -0.22;
  return mesh;
}

function makePropMesh(prop: ScenePropNode): THREE.Object3D {
  const group = new THREE.Group();
  group.position.set(prop.x, 0, prop.z);
  const pickTarget = { kind: "prop", id: prop.id, label: prop.name, action: "Inspect" } satisfies SceneTarget;
  const hitMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.34, 0.38),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })
  );
  hitMesh.name = `pick:prop:${prop.id}`;
  hitMesh.userData["propId"] = prop.id;
  hitMesh.userData["target"] = pickTarget;
  hitMesh.position.set(0, 0.18, 0);
  const geometry = new THREE.BoxGeometry(0.16, prop.inspected ? 0.1 : 0.18, 0.16);
  const material = new THREE.MeshStandardMaterial({
    color: prop.inspected ? 0x7d8796 : 0x9fc3ff,
    emissive: prop.inspected ? 0x0 : 0x102840,
    roughness: 0.56,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `prop:${prop.id}`;
  mesh.userData["propId"] = prop.id;
  mesh.userData["target"] = pickTarget;
  mesh.position.set(0, prop.inspected ? 0.11 : 0.16, 0);
  if (!prop.inspected) mesh.userData["sceneAnimation"] = bobAnimation(prop.id, 0.16, 0.024);
  group.add(makeTargetHalo(prop.inspected ? "#7d8796" : "#9fc3ff", 0.25, prop.inspected ? 0.08 : 0.14), hitMesh, mesh);
  applyShadows(mesh, { cast: true });
  return group;
}

function makeObjectiveBeaconMesh(objective: SceneObjectiveNode): THREE.Object3D {
  const group = new THREE.Group();
  group.name = `objective:${objective.id}`;
  group.position.set(objective.x, 0, objective.z);
  const color = new THREE.Color(objective.color);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(objective.primary ? 0.045 : 0.032, objective.primary ? 0.16 : 0.12, objective.primary ? 1.45 : 1.08, 18, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: objective.primary ? 0.34 : 0.2, depthWrite: false })
  );
  beam.name = `objective:beam:${objective.id}`;
  beam.position.set(0, objective.primary ? 0.72 : 0.54, 0);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(objective.primary ? 0.36 : 0.28, objective.primary ? 0.48 : 0.38, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: objective.primary ? 0.56 : 0.34, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.07;
  ring.userData["sceneAnimation"] = pulseAnimation(`objective:${objective.id}`, 1, objective.primary ? 0.1 : 0.06);
  const marker = new THREE.Mesh(
    new THREE.OctahedronGeometry(objective.primary ? 0.14 : 0.1, 1),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: objective.primary ? 0.75 : 0.42, roughness: 0.35 })
  );
  marker.position.y = objective.primary ? 1.52 : 1.16;
  marker.userData["sceneAnimation"] = bobAnimation(`objective-marker:${objective.id}`, marker.position.y, objective.primary ? 0.08 : 0.05);
  group.add(beam, ring, marker);
  applyShadows(marker, { cast: true });
  return group;
}

function makeTargetHalo(color: string, radius: number, opacity: number): THREE.Object3D {
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.72, radius, 24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity, side: THREE.DoubleSide })
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.052;
  return halo;
}

function applyShadows(root: THREE.Object3D, options: { cast?: boolean; receive?: boolean }): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const material = object.material;
    const visibleMaterial = Array.isArray(material)
      ? material.some((item) => !item.transparent || item.opacity > 0.01)
      : !material.transparent || material.opacity > 0.01;
    if (!visibleMaterial) return;
    object.castShadow = Boolean(options.cast);
    object.receiveShadow = Boolean(options.receive);
  });
}

function bobAnimation(id: string, baseY: number, amplitude: number): SceneAnimation {
  return { kind: "bob", baseY, baseScale: 1, amplitude, speedMs: 420, offset: animationOffset(id) };
}

function pulseAnimation(id: string, baseScale: number, amplitude: number): SceneAnimation {
  return { kind: "pulse", baseY: 0, baseScale, amplitude, speedMs: 560, offset: animationOffset(id) };
}

function animationOffset(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return hash / 97;
}

function disposeObjectTree(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) {
      for (const item of material) item.dispose();
    } else {
      material?.dispose();
    }
  });
}
