// Superseded by VrmCharacter / vrm.ts; kept for reference / rollback.
/**
 * Archetype rig registry — visually distinct CC0 character GLBs pulled from
 * the Quaternius "Ultimate Modular Characters" packs (men + women).
 *
 * NOTE on rig compatibility: these GLBs do NOT share the UAL skeleton. They
 * carry their OWN embedded animations (24 clips: Idle, Walk, Run, Punch_Left,
 * Sword_Slash, Roll, HitRecieve, Death, Interact, Wave, ...). The companion
 * `ArchetypeCharacter.tsx` loader plays those embedded clips. The original
 * UAL-rigged path remains the default for any persona that does not match an
 * archetype keyword.
 *
 * License: CC0 1.0 Universal (public domain) — Quaternius, hosted on poly.pizza.
 */

const BASE = `${import.meta.env.BASE_URL}assets/characters/archetypes`;

export const ARCHETYPES = {
  king: `${BASE}/king.glb`,
  adventurer: `${BASE}/adventurer.glb`,
  farmer: `${BASE}/farmer.glb`,
  worker: `${BASE}/worker.glb`,
  punk: `${BASE}/punk.glb`,
  swat: `${BASE}/swat.glb`,
  astronaut: `${BASE}/astronaut.glb`,
  businessman: `${BASE}/businessman.glb`,
  witch: `${BASE}/witch.glb`,
  woman: `${BASE}/woman.glb`,
  soldier: `${BASE}/soldier.glb`,
  scifi: `${BASE}/scifi.glb`,
} as const;

export type ArchetypeKey = keyof typeof ARCHETYPES;

/**
 * Pick an archetype from persona text + role + visual tags. Returns `null` to
 * mean "use the default UAL mannequin" so the existing procedural identity
 * system keeps driving anything we have no archetype for.
 *
 * Order matters: more specific keywords come first so "noble king" picks
 * `king` and not `businessman`. Female-coded keywords steer toward the
 * women-pack archetypes so silhouettes read correctly.
 */
export function pickArchetype(
  personaText: string,
  role: string,
  visualTags: string[]
): ArchetypeKey | null {
  const text = `${personaText} ${role} ${visualTags.join(' ')}`.toLowerCase();

  // explicit female steer first — keeps the women-pack rigs out from under
  // male keyword nets like "soldier"
  const female =
    /\bshe\b|\bher\b|\bwoman\b|\bgirl\b|\blady\b|\bmiss\b|\bmistress\b|female|feminine|witch|sorceress|priestess/.test(
      text
    );

  if (female) {
    if (/witch|sorceress|mage|wizard|hex|cauldron|spell/.test(text)) return 'witch';
    if (/soldier|guard|warrior|knight|trooper|fighter/.test(text)) return 'soldier';
    if (/sci.?fi|space|astronaut|cyborg|android|robot|cyber/.test(text)) return 'scifi';
    return 'woman';
  }

  if (/king|queen|monarch|royal|crown|highness|emperor|empress/.test(text)) return 'king';
  if (/astronaut|spaceman|cosmonaut|space.?suit/.test(text)) return 'astronaut';
  if (/swat|tactical|spec.?ops|riot|trooper/.test(text)) return 'swat';
  if (/soldier|guard|warrior|knight|slayer|patrol|watch|officer/.test(text)) return 'soldier';
  if (/sci.?fi|cyber|android|robot|drone|cyborg|hacker|net/.test(text)) return 'scifi';
  if (/punk|delinquent|rebel|thug|gang|street|biker/.test(text)) return 'punk';
  if (
    /farmer|peasant|villager|miller|herder|shepherd|fisher|gardener|garden|grower|botanist|cook|baker/.test(
      text
    )
  )
    return 'farmer';
  if (
    /worker|builder|laborer|construction|miner|engineer|smith|forge|mechanic|tinker|craft/.test(
      text
    )
  )
    return 'worker';
  if (
    /business|suit|executive|banker|noble|gentleman|merchant|trader|baron|aristocrat|innkeep|inn\b|host|bartend|barkeep|tavern|keeper|broker|vendor|shopkeep|clerk|elder/.test(
      text
    )
  )
    return 'businessman';
  if (
    /adventurer|hero|explorer|wanderer|ranger|hunter|scout|traveler|child|kid|young|student|analyst|witness|bystander/.test(
      text
    )
  )
    return 'adventurer';

  return null;
}

const CIVILIAN_POOL: ArchetypeKey[] = ['adventurer', 'farmer', 'worker', 'woman', 'businessman'];

function hashRotate(seed: string): ArchetypeKey {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return CIVILIAN_POOL[Math.abs(hash) % CIVILIAN_POOL.length]!;
}

/**
 * Like `pickArchetype` but never null — unmatched personas get a deterministic
 * civilian archetype (hash-rotated by seed) so EVERY character renders as a real
 * model instead of the cheap procedural mannequin.
 */
export function archetypeFor(
  personaText: string,
  role: string,
  visualTags: string[],
  seedId: string
): ArchetypeKey {
  return pickArchetype(personaText, role, visualTags) ?? hashRotate(seedId);
}

/** Animation clip names baked into the Quaternius modular characters. */
export const ARCHETYPE_CLIPS = {
  idle: 'CharacterArmature|Idle',
  idleNeutral: 'CharacterArmature|Idle_Neutral',
  idleSword: 'CharacterArmature|Idle_Sword',
  walk: 'CharacterArmature|Walk',
  run: 'CharacterArmature|Run',
  punchLeft: 'CharacterArmature|Punch_Left',
  punchRight: 'CharacterArmature|Punch_Right',
  swordSlash: 'CharacterArmature|Sword_Slash',
  kickLeft: 'CharacterArmature|Kick_Left',
  roll: 'CharacterArmature|Roll',
  hit: 'CharacterArmature|HitRecieve',
  death: 'CharacterArmature|Death',
  interact: 'CharacterArmature|Interact',
  wave: 'CharacterArmature|Wave',
} as const;
