export type ActorId = string;
export type HolderId = ActorId | "player";
export type LocationId = string;
export type QuestId = string;
export type ItemId = string;
export type TickIndex = number;

export type ActionType =
  | "move"
  | "talk"
  | "gossip"
  | "confront"
  | "fight"
  | "choose_character"
  | "inspect"
  | "remember"
  | "pickup"
  | "drop"
  | "give"
  | "offer_quest"
  | "accept_quest"
  | "complete_quest"
  | "fail_quest";

export interface BaseAction {
  type: ActionType;
  actorId: ActorId;
}
export interface MoveAction extends BaseAction { type: "move"; locationId: LocationId; }
export interface TalkAction extends BaseAction { type: "talk"; targetId: ActorId; text: string; }
export interface GossipAction extends BaseAction { type: "gossip"; targetId: ActorId; aboutId: ActorId; text: string; }
export interface ConfrontAction extends BaseAction { type: "confront"; targetId: ActorId; text: string; }
export interface FightAction extends BaseAction { type: "fight"; targetId: ActorId; moveId?: string; text?: string; }
export interface ChooseCharacterAction extends BaseAction { type: "choose_character"; targetId: ActorId; }
export interface InspectAction extends BaseAction { type: "inspect"; propId: string; }
export interface RememberAction extends BaseAction { type: "remember"; text: string; }
export interface PickupAction extends BaseAction { type: "pickup"; itemId: ItemId; }
export interface DropAction extends BaseAction { type: "drop"; itemId: ItemId; }
export interface GiveAction extends BaseAction { type: "give"; itemId: ItemId; targetId: ActorId; }
export interface OfferQuestAction extends BaseAction { type: "offer_quest"; questId: QuestId; targetId: ActorId; }
export interface AcceptQuestAction extends BaseAction { type: "accept_quest"; questId: QuestId; }
export interface CompleteQuestAction extends BaseAction { type: "complete_quest"; questId: QuestId; }
export interface FailQuestAction extends BaseAction { type: "fail_quest"; questId: QuestId; }

export type Action =
  | MoveAction | TalkAction | GossipAction | ConfrontAction | FightAction | ChooseCharacterAction | InspectAction | RememberAction
  | PickupAction | DropAction | GiveAction
  | OfferQuestAction | AcceptQuestAction | CompleteQuestAction | FailQuestAction;

type WithoutActor<A extends Action> = Omit<A, "actorId"> & { actorId?: "player" };
export type PlayerAction =
  | WithoutActor<MoveAction>
  | WithoutActor<TalkAction>
  | WithoutActor<GossipAction>
  | WithoutActor<ConfrontAction>
  | WithoutActor<FightAction>
  | WithoutActor<ChooseCharacterAction>
  | WithoutActor<InspectAction>
  | WithoutActor<RememberAction>
  | WithoutActor<PickupAction>
  | WithoutActor<DropAction>
  | WithoutActor<GiveAction>
  | WithoutActor<OfferQuestAction>
  | WithoutActor<AcceptQuestAction>
  | WithoutActor<CompleteQuestAction>
  | WithoutActor<FailQuestAction>;

export type MemoryVisibility = "private" | "shared" | "public";
export interface MemoryMeta {
  importance?: number;
  tags?: string[];
  sourceActorId?: ActorId | "world" | "director";
  visibility?: MemoryVisibility;
  emotionalWeight?: number;
}

export type AgentNeedKey = "safety" | "trust" | "resources" | "status" | "rest" | "curiosity" | "revenge" | "duty";
export type AgentGoalKind = "survive" | "protect" | "investigate" | "repair" | "hide" | "reveal" | "help" | "harm" | "gain_status";
export type AgentGoalStatus = "active" | "blocked" | "satisfied" | "abandoned";
export type AgentIntentKind =
  | "wait"
  | "help"
  | "ask"
  | "avoid"
  | "confront"
  | "gossip"
  | "trade"
  | "investigate"
  | "move"
  | "hide"
  | "escalate";

export interface AgentTraits {
  personality?: string[];
  values?: string[];
  flaws?: string[];
  fears?: string[];
  speechStyle?: string;
}

export interface AgentMood {
  emotion: string;
  stress: number;
  confidence: number;
  suspicion: number;
}

export interface AgentGoal {
  id: string;
  title: string;
  kind: AgentGoalKind;
  priority: number;
  status?: AgentGoalStatus;
  targetId?: ActorId | LocationId | ItemId;
  blocker?: string;
}

export interface AgentSecret {
  id: string;
  text: string;
  risk: number;
  knownBy?: Array<ActorId | "player">;
}

export interface CombatState {
  hp: number;
  maxHp: number;
  posture: number;
  defeated?: boolean;
  lastMoveId?: string;
}

export interface AgentIntent {
  kind: AgentIntentKind;
  targetId?: ActorId | LocationId | ItemId;
  reason: string;
  updatedTick: TickIndex;
}

export interface ScheduleBlock {
  hour: number;
  locationId: LocationId;
  intent: string;
}

export interface AgentPlan {
  currentIntent?: AgentIntent;
  nextActionHint?: string;
  schedule?: ScheduleBlock[];
}

export interface CharacterAppearance {
  sourceLook?: string;
  bodyType?: string;
  hair?: string;
  outfit?: string;
  palette?: string[];
  silhouette?: string;
  visualTags?: string[];
  portrait?: string;
  spriteSheet?: string;
}

export interface LocationVisualDesign {
  role?: string;
  description?: string;
  palette?: {
    ground?: string;
    structure?: string;
    accent?: string;
  };
  visualTags?: string[];
  landmarks?: string[];
  elevation?: number;
}

export interface RelationshipAxes {
  trust?: number;
  affection?: number;
  fear?: number;
  respect?: number;
  debt?: number;
  suspicion?: number;
}

export interface Memory { tick: TickIndex; text: string; meta?: MemoryMeta; }
export interface Npc {
  id: ActorId;
  name: string;
  locationId: LocationId;
  role?: string;
  factionId?: string;
  description?: string;
  traits?: AgentTraits;
  needs?: Partial<Record<AgentNeedKey, number>>;
  mood?: AgentMood;
  goals?: string[];
  ambitions?: AgentGoal[];
  plan?: AgentPlan;
  secrets?: AgentSecret[];
  combat?: CombatState;
  appearance?: CharacterAppearance;
  relationships: Record<ActorId, number>;
  relationshipAxes?: Record<ActorId | "player", RelationshipAxes>;
  memories: Memory[];
  tier?: "background" | "normal" | "quest";
}

export interface Location {
  id: LocationId;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  visual?: LocationVisualDesign;
}

export interface Exit {
  from: LocationId;
  to: LocationId;
  bidirectional?: boolean;
  label?: string;
}

export interface Item {
  id: ItemId;
  name: string;
  description?: string;
  locationId?: LocationId;
  holderId?: HolderId;
}

export interface InteractableProp {
  id: string;
  name: string;
  locationId: LocationId;
  description: string;
  inspectText: string;
  clueTags?: string[];
  relatedQuestId?: QuestId;
  involvedIds?: Array<ActorId | LocationId>;
  pressureDelta?: number;
  inspected?: boolean;
}

export interface Clock {
  hoursPerTick: number;
  hour: number;
  day: number;
}

export type QuestStatus = "open" | "active" | "done" | "failed";
export interface Quest {
  id: QuestId;
  title: string;
  description?: string;
  giverId?: ActorId;
  status?: QuestStatus;
  acceptedBy?: ActorId | "player";
  rewards?: { relationshipDelta?: Record<ActorId, number> };
  consequences?: { relationshipDelta?: Record<ActorId, number> };
}

export interface Player {
  locationId: LocationId;
  name?: string;
  characterId?: ActorId;
  appearance?: CharacterAppearance;
}

export interface Story {
  title: string;
  premise: string;
  opening: string;
  currentObjective?: string;
  mysteries?: string[];
  beats?: string[];
}

export type StoryPhase = "starter" | "nightfall_warning" | "shadow_confrontation" | "dawn_after_tasks";
export interface StoryProgress {
  phase: StoryPhase;
  unlockedCutsceneIds: string[];
  playedCutsceneIds: string[];
}

export interface WorldRule {
  id: string;
  text: string;
  kind?: "physical" | "magic" | "social" | "story" | "safety";
}

export interface Faction {
  id: string;
  name: string;
  goals?: string[];
  resources?: string[];
  reputation?: number;
}

export interface WorldTension {
  id: string;
  title: string;
  pressure: number;
  status?: "quiet" | "active" | "escalating" | "resolved";
  involvedIds?: string[];
}

export interface VillainPlan {
  id: string;
  actorId: ActorId;
  title: string;
  objective: string;
  stage: number;
  hidden: boolean;
  pressure: number;
  nextTrigger?: string;
  knownFacts?: string[];
}

export interface DirectorState {
  pressure: number;
  quietTicks: number;
  lastNudgeTick?: TickIndex;
  pendingReveals?: string[];
}

export interface AppliedAction { applied: true; action: Action; text: string; fromDirector?: boolean; }
export interface RejectedAction { applied: false; action: Action; reason: string; fromDirector?: boolean; }
export type ActionResult = AppliedAction | RejectedAction;

export interface TickActionEntry { action: Action; text: string; fromDirector?: boolean; }
export interface TickRejectedEntry { action: Action; reason: string; }
export interface TickSummary {
  tick: TickIndex;
  actions: TickActionEntry[];
  rejected: TickRejectedEntry[];
  checksum: string;
  clock: Clock;
}

export interface World {
  id: string;
  name: string;
  story?: Story;
  storyProgress?: StoryProgress;
  tick: TickIndex;
  player: Player;
  clock: Clock;
  rules?: WorldRule[];
  factions?: Faction[];
  tensions?: WorldTension[];
  villainPlans?: VillainPlan[];
  directorState?: DirectorState;
  locations: Location[];
  exits: Exit[];
  npcs: Npc[];
  items: Item[];
  interactables?: InteractableProp[];
  quests?: Quest[];
  eventLog: TickSummary[];
}

export type Proposer = (world: World) => Promise<Action[]> | Action[];
export type Director = (world: World) => Promise<Action | null> | (Action | null);

export type Tier = "background" | "normal" | "quest";

export interface ProposeRequest {
  tier?: Tier;
  system: string;
  user: string;
  signal?: AbortSignal;
}
export interface ProposeMeta {
  tier: Tier;
  model: string | null;
  latencyMs: number;
  usage?: unknown;
  error: string | null;
  jsonOk: boolean;
}
export type ProposeResult =
  | { skipped: true; reason: string }
  | { skipped?: false; action: Partial<Action> & { type: ActionType | "skip"; reason?: string }; raw?: string; meta?: ProposeMeta }
  | { skipped?: false; error: string; raw?: string; meta?: ProposeMeta };

export const HOURS_PER_DAY = 24;
export function isNight(clock: Clock): boolean {
  return clock.hour < 6 || clock.hour >= 20;
}
export function timeOfDay(clock: Clock): "dawn" | "day" | "dusk" | "night" {
  const h = clock.hour;
  if (h < 6) return "night";
  if (h < 9) return "dawn";
  if (h < 18) return "day";
  if (h < 21) return "dusk";
  return "night";
}
