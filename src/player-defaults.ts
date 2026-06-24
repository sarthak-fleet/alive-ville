import type { CharacterAppearance } from './types.ts';

export const DEFAULT_HERO_NAME = 'Wanderer';

/** Default appearance for the player when not possessing an NPC.
 *  Crimson accent distinguishes the protagonist from every ambient villager. */
export const DEFAULT_HERO_APPEARANCE: CharacterAppearance = {
  hair: 'windswept dark hair',
  outfit: "traveler's jacket with a red scarf",
  palette: ['#1c2540', '#e8c39e', '#c8382a'],
  silhouette: 'average',
  visualTags: ['scarf', 'jacket'],
};

// eslint-disable-next-line no-control-regex
const CTRL_RE = /[\x00-\x1f\x7f]/g;

/** Trims, strips control chars, and caps at 20 characters. Returns null if the
 *  result is empty after cleaning. */
export function sanitizePlayerName(raw: string): string | null {
  const clean = raw.replace(CTRL_RE, '').trim().slice(0, 20);
  return clean.length > 0 ? clean : null;
}
