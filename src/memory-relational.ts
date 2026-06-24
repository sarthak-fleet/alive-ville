/**
 * memory-relational.ts — lightweight, browser-safe relational recall.
 *
 * The complement to topic/relevance ranking (`memory-score.ts`): NPC behavior is
 * driven by *relationships*, so this gives the entity-centric view — "what do I
 * remember about <this person>" — independent of keyword overlap with the current
 * utterance. Pure (no graph DB, no server, no embeddings): an in-memory filter
 * over the structured `subject` tag + name match, which is plenty at game scale.
 */

import type { Memory } from './types.ts';

export interface NamedEntity {
  id: string;
  name: string;
}

/** Memories an NPC holds about a specific entity, most important/recent first. */
export function memoriesAbout(
  memories: Memory[],
  entityId: string,
  entityName: string | undefined,
  limit = 3
): Memory[] {
  const name = entityName?.toLowerCase();
  return memories
    .filter(
      (memory) =>
        memory.meta?.subject === entityId ||
        (name ? memory.text.toLowerCase().includes(name) : false)
    )
    .sort((a, b) => (b.meta?.importance ?? 1) - (a.meta?.importance ?? 1) || b.tick - a.tick)
    .slice(0, limit);
}

/** Known entities referenced (by name) in a piece of text. */
export function entitiesInText(text: string, entities: NamedEntity[]): NamedEntity[] {
  const lower = text.toLowerCase();
  return entities.filter(
    (entity) => entity.name.length > 0 && lower.includes(entity.name.toLowerCase())
  );
}

/**
 * A compact "what you remember about X" block for the player plus any entities
 * named in `query` (capped). Returns "" when there's nothing relational to add.
 */
export function relationalContext(
  memories: Memory[],
  query: string,
  player: NamedEntity,
  others: NamedEntity[],
  perEntity = 3
): string {
  const targets = [player, ...entitiesInText(query, others).slice(0, 2)];
  const seen = new Set<string>();
  const blocks: string[] = [];
  for (const entity of targets) {
    if (seen.has(entity.id)) continue;
    seen.add(entity.id);
    const mems = memoriesAbout(memories, entity.id, entity.name, perEntity);
    if (mems.length > 0)
      blocks.push(
        `What you remember about ${entity.name}:\n${mems.map((memory) => `- ${memory.text}`).join('\n')}`
      );
  }
  return blocks.join('\n');
}
