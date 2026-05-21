import * as THREE from "three";

import type { Exit, InteractableProp, Item, Location, Npc, World } from "../../../src/types.ts";

const WORLD_SCALE = 0.018;
const MIN_BUILDING_HEIGHT = 0.45;

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
}

export interface ScenePropNode {
  id: string;
  name: string;
  locationId: string;
  x: number;
  z: number;
  inspected: boolean;
}

export interface ScenePathNode {
  fromId: string;
  toId: string;
  from: { x: number; z: number };
  to: { x: number; z: number };
}

export interface WorldSceneModel {
  locations: SceneLocationNode[];
  paths: ScenePathNode[];
  actors: SceneActorNode[];
  items: SceneItemNode[];
  props: ScenePropNode[];
  bounds: { width: number; depth: number };
  cameraTarget: { x: number; z: number };
}

export function buildWorldSceneModel(world: World): WorldSceneModel {
  const bounds = worldBounds(world.locations);
  const activeLocation = world.locations.find((location) => location.id === world.player.locationId) ?? world.locations[0];
  const locations = world.locations.map((location) => locationNode(location, world.player.locationId));
  const paths = world.exits.map((exit) => pathNode(exit, world.locations)).filter((node): node is ScenePathNode => Boolean(node));
  const actors = [
    playerNode(world, activeLocation),
    ...world.npcs.map((npc) => actorNode(npc, world.locations.find((location) => location.id === npc.locationId))),
  ].filter((node): node is SceneActorNode => Boolean(node));
  const items = world.items
    .map((item) => itemNode(item, world.locations.find((location) => location.id === item.locationId)))
    .filter((node): node is SceneItemNode => Boolean(node));
  const props = (world.interactables ?? [])
    .map((prop) => propNode(prop, world.locations.find((location) => location.id === prop.locationId)))
    .filter((node): node is ScenePropNode => Boolean(node));
  const target = activeLocation ? centerForLocation(activeLocation) : { x: 0, z: 0 };
  return {
    locations,
    paths,
    actors,
    items,
    props,
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
}

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
  private hoverKey: string | null = null;

  constructor(private readonly container: HTMLElement, options: ThreeWorldRendererOptions = {}) {
    this.onLocationSelect = options.onLocationSelect ?? null;
    this.onNpcSelect = options.onNpcSelect ?? null;
    this.onItemSelect = options.onItemSelect ?? null;
    this.onPropSelect = options.onPropSelect ?? null;
    this.onTargetHover = options.onTargetHover ?? null;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x070a0f, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);
    this.renderer.domElement.addEventListener("pointerdown", this.handlePointerDown);
    this.renderer.domElement.addEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.addEventListener("pointerleave", this.handlePointerLeave);
    this.scene.add(this.root);
    this.scene.fog = new THREE.FogExp2(0x0a0d12, 0.035);
    this.scene.add(new THREE.HemisphereLight(0xcfe7ff, 0x222018, 1.7));
    const sun = new THREE.DirectionalLight(0xffe1a0, 2.2);
    sun.position.set(6, 10, 5);
    this.scene.add(sun);
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
    const model = buildWorldSceneModel(world);
    disposeObjectTree(this.root);
    this.root.clear();
    this.pickableLocations.length = 0;
    this.pickableActors.length = 0;
    this.pickableItems.length = 0;
    this.pickableProps.length = 0;
    this.root.add(makeGround(model));
    this.root.add(makeSkyline(model));
    for (const path of model.paths) this.root.add(makePathMesh(path));
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
      this.pickableProps.push(mesh);
    }
    for (const item of model.items) {
      const mesh = makeItemMesh(item);
      this.root.add(mesh);
      this.pickableItems.push(mesh);
    }
    for (const actor of model.actors) {
      const mesh = makeActorMesh(actor);
      this.root.add(mesh);
      const pickable = mesh.getObjectByName(`pick:actor:${actor.id}`);
      if (!actor.player && pickable) this.pickableActors.push(pickable);
    }
    this.camera.position.set(model.cameraTarget.x + 4.8, 6.4, model.cameraTarget.z + 7.2);
    this.camera.lookAt(model.cameraTarget.x, 0.25, model.cameraTarget.z);
    this.render();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  start(): void {
    const animate = () => {
      if (this.disposed) return;
      this.frame = requestAnimationFrame(animate);
      this.root.rotation.y = Math.sin(performance.now() / 5800) * 0.015;
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

  private targetAt(event: PointerEvent): SceneTarget | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return (
      this.firstHitTarget(this.pickableActors) ??
      this.firstHitTarget(this.pickableItems) ??
      this.firstHitTarget(this.pickableProps) ??
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

function isSceneTarget(value: unknown): value is SceneTarget {
  return Boolean(value && typeof value === "object" && typeof (value as SceneTarget).id === "string" && typeof (value as SceneTarget).label === "string");
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

function playerNode(world: World, location: Location | undefined): SceneActorNode | null {
  if (!location) return null;
  const center = centerForLocation(location);
  return {
    id: "player",
    name: world.player.name ?? "Player",
    locationId: location.id,
    x: center.x,
    z: center.z,
    color: world.player.appearance?.palette?.[0] ?? "#58a6ff",
    player: true,
    quest: false,
  };
}

function actorNode(npc: Npc, location: Location | undefined): SceneActorNode | null {
  if (!location) return null;
  const center = centerForLocation(location);
  const offset = stableOffset(npc.id, 0.42);
  return {
    id: npc.id,
    name: npc.name,
    locationId: location.id,
    x: center.x + offset.x,
    z: center.z + offset.z,
    color: npc.appearance?.palette?.[0] ?? (npc.tier === "quest" ? "#b5e48c" : "#ff8a65"),
    player: false,
    quest: npc.tier === "quest",
  };
}

function itemNode(item: Item, location: Location | undefined): SceneItemNode | null {
  if (!location || item.holderId) return null;
  const center = centerForLocation(location);
  const offset = stableOffset(item.id, 0.58);
  return {
    id: item.id,
    name: item.name,
    locationId: location.id,
    x: center.x + offset.x,
    z: center.z + offset.z,
    color: "#f8d44e",
  };
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
  return mesh;
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

function makeActorMesh(actor: SceneActorNode): THREE.Object3D {
  const radius = actor.player ? 0.18 : 0.14;
  const height = actor.player ? 0.72 : actor.quest ? 0.62 : 0.52;
  const geometry = new THREE.CapsuleGeometry(radius, height, 5, 10);
  const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(actor.color), roughness: 0.48 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `pick:actor:${actor.id}`;
  mesh.userData["actorId"] = actor.id;
  mesh.userData["target"] = { kind: "npc", id: actor.id, label: actor.name, action: "Talk" } satisfies SceneTarget;
  mesh.position.set(actor.x, height / 2 + 0.16, actor.z);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 1.45, 18),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: actor.player ? 0.32 : 0.22 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(actor.x, 0.035, actor.z);
  const group = new THREE.Group();
  group.add(shadow, mesh);
  return group;
}

function makeItemMesh(item: SceneItemNode): THREE.Object3D {
  const geometry = new THREE.IcosahedronGeometry(0.11, 1);
  const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(item.color), emissive: 0x4a3300, roughness: 0.32 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = item.name;
  mesh.userData["itemId"] = item.id;
  mesh.userData["target"] = { kind: "item", id: item.id, label: item.name, action: "Pick up" } satisfies SceneTarget;
  mesh.position.set(item.x, 0.24, item.z);
  return mesh;
}

function makePropMesh(prop: ScenePropNode): THREE.Object3D {
  const geometry = new THREE.BoxGeometry(0.16, prop.inspected ? 0.1 : 0.18, 0.16);
  const material = new THREE.MeshStandardMaterial({
    color: prop.inspected ? 0x7d8796 : 0x9fc3ff,
    emissive: prop.inspected ? 0x0 : 0x102840,
    roughness: 0.56,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = prop.name;
  mesh.userData["propId"] = prop.id;
  mesh.userData["target"] = { kind: "prop", id: prop.id, label: prop.name, action: "Inspect" } satisfies SceneTarget;
  mesh.position.set(prop.x, prop.inspected ? 0.11 : 0.16, prop.z);
  return mesh;
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
