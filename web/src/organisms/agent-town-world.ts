export type Direction = "down" | "up" | "left" | "right";
export type RoomId = "outdoor" | "hqInterior" | "marketInterior" | "dojoInterior" | "alleyInterior";

export type StoryFlag =
  | "couponFound"
  | "couponReturned"
  | "alertRaised"
  | "monsterAlleyUnlocked"
  | "sonicChallenged";

export type ZoneId = "hq" | "market" | "alley";

export interface CastMember {
  id: string;
  name: string;
  role: string;
  sprite: string;
  x: number;
  y: number;
  zoneId: ZoneId;
  line: string;
  memory: string;
  roomId?: RoomId;
}

export interface WorldZone {
  id: ZoneId;
  name: string;
  description: string;
  origin: { x: number; y: number };
  focus: { x: number; y: number };
  spawn: { x: number; y: number };
  unlockFlag?: StoryFlag;
}

export interface WorldProp {
  id: string;
  label: string;
  zoneId: ZoneId;
  x: number;
  y: number;
  color: number;
  symbol: string;
  inspectText: string;
  requires?: StoryFlag[];
  hiddenWhen?: StoryFlag;
  grants?: StoryFlag[];
  givesItem?: string;
  roomId?: RoomId;
}

export interface StorySnapshot {
  activeZone: ZoneId;
  flags: Record<StoryFlag, boolean>;
  inventory: string[];
  objective: string;
}

export const ZONES: WorldZone[] = [
  {
    id: "hq",
    name: "Hero HQ",
    description: "Central plaza, dispatch board, and the front step into the Hero HQ interior.",
    origin: { x: 512, y: 304 },
    focus: { x: 710, y: 515 },
    spawn: { x: 705, y: 575 },
  },
  {
    id: "market",
    name: "Market Street",
    description: "The east market, ramen stand, clinic, and rumor-heavy patrol route.",
    origin: { x: 1344, y: 240 },
    focus: { x: 1560, y: 545 },
    spawn: { x: 1530, y: 625 },
    unlockFlag: "couponReturned",
  },
  {
    id: "alley",
    name: "Monster Alley",
    description: "A far danger district where the alert becomes a confrontation.",
    origin: { x: 1936, y: 1296 },
    focus: { x: 2200, y: 1520 },
    spawn: { x: 2210, y: 1640 },
    unlockFlag: "monsterAlleyUnlocked",
  },
];

export const CAST: CastMember[] = [
  { id: "saitama", name: "Saitama", role: "Errand hero", sprite: "character_01", x: 690, y: 535, zoneId: "hq", line: "I lost a coupon somewhere. That is the important part.", memory: "Saitama is treating the patrol like a grocery detour." },
  { id: "genos", name: "Genos", role: "Cyborg disciple", sprite: "character_02", x: 780, y: 525, zoneId: "hq", line: "I am collecting incident data and improving the patrol model.", memory: "Genos is logging every clue and over-indexing on Saitama's priorities." },
  { id: "mumen", name: "Mumen Rider", role: "Witness hero", sprite: "character_03", x: 875, y: 590, zoneId: "hq", line: "If we get proof, I can file the alert properly.", memory: "Mumen needs evidence before escalating the public warning." },
  { id: "sonic", name: "Sonic", role: "Ninja rival", sprite: "character_04", x: 2320, y: 1560, zoneId: "alley", line: "This district is finally large enough for a chase.", memory: "Sonic wants any quiet task to become a public challenge." },
  { id: "fubuki", name: "Fubuki", role: "Psychic leader", sprite: "character_05", x: 560, y: 705, zoneId: "hq", line: "A team works when everyone stops fighting the plan.", memory: "Fubuki is watching hierarchy and group control." },
  { id: "king", name: "King", role: "Legend", sprite: "character_06", x: 940, y: 700, zoneId: "hq", line: "I am just standing here. Somehow that helps.", memory: "King calms the plaza by doing almost nothing." },
  { id: "bang", name: "Bang", role: "Master", sprite: "character_01", x: 1585, y: 625, zoneId: "market", line: "A wider patrol route makes footwork worth watching.", memory: "Bang is reading the challenger instead of the rumor." },
  { id: "metal_bat", name: "Metal Bat", role: "Backup", sprite: "character_02", x: 1375, y: 650, zoneId: "market", line: "Tell me when this stops being paperwork.", memory: "Metal Bat is waiting for a real threat near the market gate." },
  { id: "child_emperor", name: "Child Emperor", role: "Analyst", sprite: "character_03", x: 2100, y: 1595, zoneId: "alley", line: "The marks and the monster scale do not match. That matters.", memory: "Child Emperor thinks one clue is bait and one clue is real." },
  { id: "garou", name: "Garou", role: "Rogue martial artist", sprite: "character_04", x: 690, y: 1415, zoneId: "hq", line: "The dojo is quiet. That usually means someone is avoiding a real fight.", memory: "Garou is circling the training yard and testing everyone by posture alone." },
  { id: "hq_dispatcher", name: "HQ Dispatcher", role: "Operations desk", sprite: "character_05", x: 0, y: 0, zoneId: "hq", roomId: "hqInterior", line: "Alerts come in as fragments. Good patrols turn them into routes.", memory: "The dispatcher keeps room traffic separate from the street patrol." },
  { id: "records_clerk", name: "Records Clerk", role: "Archive keeper", sprite: "character_06", x: 0, y: 0, zoneId: "hq", roomId: "hqInterior", line: "If someone moved that coupon, it is probably logged under errands.", memory: "The records clerk tracks quiet details the heroes ignore." },
  { id: "market_keeper", name: "Market Keeper", role: "Shop lead", sprite: "character_03", x: 0, y: 0, zoneId: "market", roomId: "marketInterior", line: "Every receipt tells you who passed through and what they were hiding.", memory: "The market keeper treats purchases like clues." },
  { id: "ramen_vendor", name: "Ramen Vendor", role: "Food stall", sprite: "character_06", x: 0, y: 0, zoneId: "market", roomId: "marketInterior", line: "Fast orders, strange footprints, one loud ninja. That is today's pattern.", memory: "The ramen vendor saw Sonic before anyone filed a report." },
  { id: "dojo_attendant", name: "Dojo Attendant", role: "Training floor", sprite: "character_05", x: 0, y: 0, zoneId: "hq", roomId: "dojoInterior", line: "The bell only rings when someone enters with intent.", memory: "The dojo attendant is watching stance, not reputation." },
  { id: "alley_watch", name: "Alley Watch", role: "Gate scout", sprite: "character_02", x: 0, y: 0, zoneId: "alley", roomId: "alleyInterior", line: "The alley is quiet because the noisy thing already left a message.", memory: "The gate scout marks which threats want attention." },
];

export const PROPS: WorldProp[] = [
  {
    id: "coupon_box",
    label: "Coupon box",
    zoneId: "hq",
    x: 655,
    y: 590,
    color: 0xf8d44e,
    symbol: "$",
    inspectText: "You find Saitama's grocery coupon tucked under the workstation.",
    hiddenWhen: "couponFound",
    grants: ["couponFound"],
    givesItem: "Grocery coupon",
  },
  {
    id: "alert_board",
    label: "Alert board",
    zoneId: "hq",
    x: 850,
    y: 550,
    color: 0x58a6ff,
    symbol: "!",
    inspectText: "The board confirms a monster sign near the alley. The team can move out.",
    requires: ["couponReturned"],
    grants: ["alertRaised", "monsterAlleyUnlocked"],
  },
  {
    id: "challenge_mark",
    label: "Challenge mark",
    zoneId: "alley",
    x: 2210,
    y: 1560,
    color: 0x8d5cff,
    symbol: "X",
    inspectText: "The mark is Sonic's signature. He is baiting the patrol into a duel.",
    requires: ["monsterAlleyUnlocked"],
    grants: ["sonicChallenged"],
  },
  {
    id: "hq_case_file",
    label: "Case file",
    zoneId: "hq",
    roomId: "hqInterior",
    x: 0,
    y: 0,
    color: 0x9bd3ff,
    symbol: "F",
    inspectText: "The file links the grocery coupon, the alert board, and a fast-moving witness near the market.",
  },
  {
    id: "market_ledger",
    label: "Market ledger",
    zoneId: "market",
    roomId: "marketInterior",
    x: 0,
    y: 0,
    color: 0xf0a35e,
    symbol: "L",
    inspectText: "The ledger shows a rush order signed with a sharp slash instead of a name.",
  },
  {
    id: "dojo_bell",
    label: "Dojo bell",
    zoneId: "hq",
    roomId: "dojoInterior",
    x: 0,
    y: 0,
    color: 0xd9e36f,
    symbol: "B",
    inspectText: "The bell is polished from use. Someone trained here minutes before the alert.",
  },
  {
    id: "gate_report",
    label: "Gate report",
    zoneId: "alley",
    roomId: "alleyInterior",
    x: 0,
    y: 0,
    color: 0xc58cff,
    symbol: "R",
    inspectText: "The report confirms Sonic left the challenge mark deliberately, not by accident.",
  },
  {
    id: "ramen_crate",
    label: "Ramen crate",
    zoneId: "market",
    x: 1510,
    y: 705,
    color: 0xf0a35e,
    symbol: "N",
    inspectText: "A warm crate from the ramen stand. It points toward the market hall.",
    requires: ["couponReturned"],
  },
  {
    id: "dojo_sign",
    label: "Dojo sign",
    zoneId: "hq",
    x: 660,
    y: 1365,
    color: 0xd9e36f,
    symbol: "D",
    inspectText: "The sign points to a training room that can be entered from the south plaza.",
  },
];

export function initialSnapshot(): StorySnapshot {
  return {
    activeZone: "hq",
    inventory: [],
    flags: {
      couponFound: false,
      couponReturned: false,
      alertRaised: false,
      monsterAlleyUnlocked: false,
      sonicChallenged: false,
    },
    objective: "Find Saitama's grocery coupon.",
  };
}

export function zoneUnlocked(zone: WorldZone, flags: Record<StoryFlag, boolean>): boolean {
  return !zone.unlockFlag || flags[zone.unlockFlag];
}

export function propVisible(prop: WorldProp, flags: Record<StoryFlag, boolean>): boolean {
  if (prop.hiddenWhen && flags[prop.hiddenWhen]) return false;
  return (prop.requires ?? []).every((flag) => flags[flag]);
}

export function nextObjective(flags: Record<StoryFlag, boolean>): string {
  if (!flags.couponFound) return "Find Saitama's grocery coupon.";
  if (!flags.couponReturned) return "Bring the grocery coupon to Saitama.";
  if (!flags.alertRaised) return "Inspect the Hero Association alert board.";
  if (!flags.sonicChallenged) return "Enter Monster Alley and inspect Sonic's challenge mark.";
  return "Confront Sonic or keep talking to the cast.";
}
