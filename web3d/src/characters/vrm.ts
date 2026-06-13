/**
 * VRM character registry — anime-style 3D avatars in the standard VRM format
 * (VRoid Studio's export format, de-facto standard for stylized humanoid
 * avatars in WebGL). Loaded via `@pixiv/three-vrm`.
 *
 * These replace the Quaternius archetype path. The picker mirrors
 * `pickArchetype` from `archetypes.ts` — returns a VRM key or `null` to fall
 * through to the procedural UAL mannequin (`RiggedCharacter.tsx`) when no
 * VRM matches.
 *
 * License summary (full per-file details in `docs/third-party-assets.md`):
 *   - `villager-a/b/c.vrm` — VRoid Project AvatarSample_A/B/C, license URL
 *     embedded in file metadata: redistribution=allow, modification=allow,
 *     corporate_commercial_use=allow, credit=unnecessary.
 *   - `hero.vrm` — Seed-san by VirtualCast, Inc.; VRM Public License 1.0;
 *     creditNotation=required (must credit VirtualCast in our about screen).
 *   - `acolyte.vrm` — VRM1_Constraint_Twist_Sample by pixiv Inc.; VRM Public
 *     License 1.0; creditNotation=unnecessary.
 */

const BASE = `${import.meta.env.BASE_URL}assets/characters/vrm`;

export const VRMS = {
  villagerA: `${BASE}/villager-a.vrm`,
  villagerB: `${BASE}/villager-b.vrm`,
  villagerC: `${BASE}/villager-c.vrm`,
  hero: `${BASE}/hero.vrm`,
  acolyte: `${BASE}/acolyte.vrm`,
} as const;

export type VrmKey = keyof typeof VRMS;

/**
 * Stable hash for deterministic VRM rotation within a category. We don't want
 * every "villager" persona to render the same avatar — the keyword pool of
 * villagers spans 3 VRMs and we pick one based on the persona's seed string.
 */
function hashRotate<T>(seed: string, pool: readonly T[]): T {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return pool[Math.abs(hash) % pool.length]!;
}

/**
 * Pick a VRM key from persona text / role / visual tags. Returns `null` when
 * we have no good match so the procedural UAL fallback keeps driving variety
 * for unknown personas.
 *
 * Pool composition (all anime-styled VRoid bodies — much closer to the
 * project's "anime-style 3D characters" target than the Quaternius low-poly
 * archetypes):
 *   - `villagerA/B/C` — three VRoid villager-coded avatars (mixed gender).
 *   - `hero` — Seed-san; tall, stylized, hero silhouette.
 *   - `acolyte` — robed/spell-coded silhouette.
 */
export function pickVrm(
  personaText: string,
  role: string,
  visualTags: string[]
): VrmKey | null {
  const text = `${personaText} ${role} ${visualTags.join(" ")}`.toLowerCase();
  const seed = `${role}:${personaText.slice(0, 32)}`;

  // hero / protagonist coded — knight, captain, champion, sword-bearing
  if (
    /\b(hero|knight|champion|captain|warrior|paladin|guardian|protector|swordsman|swordswoman|king|queen|monarch|emperor|empress|highness|royal)\b/.test(
      text
    )
  ) {
    return "hero";
  }

  // mage / mystical / robed coded — anything spell, witch, monk, sage, priest
  if (
    /\b(mage|wizard|witch|sorcer\w*|priest\w*|monk|cleric|acolyte|shaman|druid|sage|alchemist|spell\w*|hex|cauldron|magic)\b/.test(
      text
    )
  ) {
    return "acolyte";
  }

  // generic civilian / villager pool — any "person in the world" persona maps
  // onto the three VRoid villagers. Hash-rotate so the same persona always
  // gets the same VRM but the three are spread evenly across the population.
  if (
    /\b(villager|townsfolk|civilian|farmer|merchant|trader|shopkeeper|vendor|innkeeper|child|kid|elder|student|patron|guest|traveler|wanderer|adventurer|hunter|scout|guard|patrol|watch|officer|soldier)\b/.test(
      text
    )
  ) {
    return hashRotate(seed, ["villagerA", "villagerB", "villagerC"] as const);
  }

  return null;
}
