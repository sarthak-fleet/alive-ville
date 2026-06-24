import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { propagateInformation } from '../src/rumors.ts';
import { runTick } from '../src/simulation.ts';
import type { World } from '../src/types.ts';

function loadWorld(): World {
  return JSON.parse(
    readFileSync(new URL('../worlds/village.json', import.meta.url), 'utf8')
  ) as World;
}

function colocate(world: World, ids: string[], locationId: string): void {
  for (const id of ids) {
    const npc = world.npcs.find((entry) => entry.id === id)!;
    npc.locationId = locationId;
  }
}

describe('information propagation', () => {
  it('shared memories diffuse to co-located NPCs', () => {
    const world = loadWorld();
    colocate(world, ['mira', 'tomas'], 'square');
    const mira = world.npcs.find((npc) => npc.id === 'mira')!;
    mira.memories.push({
      tick: world.tick,
      text: 'Someone stole the blue ember from the bridge.',
      meta: { importance: 6, visibility: 'shared' },
    });
    const events = propagateInformation(world);
    const tomas = world.npcs.find((npc) => npc.id === 'tomas')!;
    expect(events.some((event) => event.kind === 'gossip_spread')).toBe(true);
    expect(tomas.memories.some((memory) => memory.text.includes('stole the blue ember'))).toBe(
      true
    );
    // and the copy is itself shareable — rumors keep travelling
    const copy = tomas.memories.find((memory) => memory.text.includes('stole the blue ember'))!;
    expect(copy.meta?.visibility).toBe('shared');
  });

  it('private memories stay private', () => {
    const world = loadWorld();
    colocate(world, ['mira', 'tomas'], 'square');
    const mira = world.npcs.find((npc) => npc.id === 'mira')!;
    mira.memories.push({
      tick: world.tick,
      text: 'My deepest fear is the forge flame dying forever.',
      meta: { importance: 7, visibility: 'private' },
    });
    propagateInformation(world);
    const tomas = world.npcs.find((npc) => npc.id === 'tomas')!;
    expect(tomas.memories.some((memory) => memory.text.includes('deepest fear'))).toBe(false);
  });

  it('a leaked secret turns a principled NPC against the holder', () => {
    const world = loadWorld();
    const holder = world.npcs.find((npc) => npc.id === 'mira')!;
    holder.secrets = [
      {
        id: 's1',
        text: 'Mira hides the stolen moonmint shipment under the garden shed',
        risk: 80,
        knownBy: [],
      },
    ];
    const judge = world.npcs.find((npc) => npc.id === 'lena')!;
    judge.traits = { ...(judge.traits ?? {}), values: ['justice', 'order'] };
    // the secret's words reach Lena's ears as a rumor
    judge.memories.push({
      tick: world.tick,
      text: 'I heard Mira hides a stolen moonmint shipment under her garden shed.',
      meta: { importance: 6, visibility: 'shared' },
    });
    const events = propagateInformation(world);
    expect(
      events.some((event) => event.kind === 'secret_revealed' && event.actorId === 'lena')
    ).toBe(true);
    expect(events.some((event) => event.kind === 'turned_against')).toBe(true);
    expect(holder.secrets[0]!.knownBy).toContain('lena');
    expect(judge.relationships?.['mira']).toBeLessThanOrEqual(-4);
    expect((judge.ambitions ?? []).some((goal) => goal.title.includes('Confront Mira'))).toBe(true);
  });

  it('revelations surface in tick summaries', async () => {
    const world = loadWorld();
    const holder = world.npcs.find((npc) => npc.id === 'mira')!;
    holder.secrets = [
      {
        id: 's1',
        text: 'Mira hides the stolen moonmint shipment under the garden shed',
        risk: 80,
        knownBy: [],
      },
    ];
    const judge = world.npcs.find((npc) => npc.id === 'lena')!;
    judge.memories.push({
      tick: world.tick,
      text: 'I heard Mira hides a stolen moonmint shipment under her garden shed.',
      meta: { importance: 6, visibility: 'shared' },
    });
    const summary = await runTick(world, undefined, { propose: () => [] });
    expect(summary.actions.some((entry) => entry.text.includes('learned'))).toBe(true);
  });
});
