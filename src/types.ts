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
export interface RememberAction extends BaseAction { type: "remember"; text: string; }
export interface PickupAction extends BaseAction { type: "pickup"; itemId: ItemId; }
export interface DropAction extends BaseAction { type: "drop"; itemId: ItemId; }
export interface GiveAction extends BaseAction { type: "give"; itemId: ItemId; targetId: ActorId; }
export interface OfferQuestAction extends BaseAction { type: "offer_quest"; questId: QuestId; targetId: ActorId; }
export interface AcceptQuestAction extends BaseAction { type: "accept_quest"; questId: QuestId; }
export interface CompleteQuestAction extends BaseAction { type: "complete_quest"; questId: QuestId; }
export interface FailQuestAction extends BaseAction { type: "fail_quest"; questId: QuestId; }

export type Action =
  | MoveAction | TalkAction | GossipAction | ConfrontAction | RememberAction
  | PickupAction | DropAction | GiveAction
  | OfferQuestAction | AcceptQuestAction | CompleteQuestAction | FailQuestAction;

type WithoutActor<A extends Action> = Omit<A, "actorId"> & { actorId?: "player" };
export type PlayerAction =
  | WithoutActor<MoveAction>
  | WithoutActor<TalkAction>
  | WithoutActor<GossipAction>
  | WithoutActor<ConfrontAction>
  | WithoutActor<RememberAction>
  | WithoutActor<PickupAction>
  | WithoutActor<DropAction>
  | WithoutActor<GiveAction>
  | WithoutActor<OfferQuestAction>
  | WithoutActor<AcceptQuestAction>
  | WithoutActor<CompleteQuestAction>
  | WithoutActor<FailQuestAction>;

export interface Memory { tick: TickIndex; text: string; }
export interface Npc {
  id: ActorId;
  name: string;
  locationId: LocationId;
  goals?: string[];
  relationships: Record<ActorId, number>;
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
  tick: TickIndex;
  player: Player;
  clock: Clock;
  locations: Location[];
  exits: Exit[];
  npcs: Npc[];
  items: Item[];
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
