import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { authorBeat, shouldAuthorBeat } from '../src/author.ts';
import { catchUpWorld } from '../src/catch-up.ts';
import type { World } from '../src/types.ts';

function loadWorld(): World {
  return JSON.parse(
    readFileSync(new URL('../worlds/village.json', import.meta.url), 'utf8')
  ) as World;
}

const fake = (text: string) => () =>
  Promise.resolve({
    text,
    raw: text,
    meta: { tier: 'quest' as const, model: 'test', latencyMs: 1, error: null, jsonOk: false },
  });

describe('living world', () => {
  it('catch-up replays missed time and produces a recap', async () => {
    const world = loadWorld();
    const startTick = world.tick;
    const recap = await catchUpWorld(world, 2 * 60 * 60_000); // away 2 hours
    expect(recap).not.toBeNull();
    expect(recap!.ticks).toBe(24);
    expect(world.tick).toBe(startTick + 24);
    expect(world.recap).toBe(recap);
    expect(Array.isArray(recap!.lines)).toBe(true);
  });

  it('short absences do not trigger catch-up', async () => {
    const world = loadWorld();
    expect(await catchUpWorld(world, 5 * 60_000)).toBeNull();
  });

  it('authored quest beats create a real open quest with a shareable memory', async () => {
    const world = loadWorld();
    const beat = await authorBeat(
      world,
      fake(
        '{"kind":"quest","quest":{"title":"Find the missing lantern oil","description":"The inn lamps are running dry before nightfall.","giverName":"Mira"}}'
      )
    );
    expect(beat).not.toBeNull();
    const quest = (world.quests ?? []).find(
      (entry) => entry.title === 'Find the missing lantern oil'
    )!;
    expect(quest.status).toBe('open');
    expect(quest.giverId).toBe('mira');
    const mira = world.npcs.find((npc) => npc.id === 'mira')!;
    expect(mira.memories.at(-1)?.meta?.visibility).toBe('shared');
  });

  it('authored arrivals add a living NPC to the world', async () => {
    const world = loadWorld();
    const beat = await authorBeat(
      world,
      fake(
        '{"kind":"arrival","arrival":{"name":"Sera Voss","role":"wandering tinker","description":"A tinker with a cart of strange tools. She asks too many questions about the forge.","locationName":"Village Square","hair":"copper braid","outfit":"patched leather apron","palette":["#8a5a3c","#3c5a78","#e8c95a"],"visualTags":["tinker","cart","she"]}}'
      )
    );
    expect(beat).not.toBeNull();
    const sera = world.npcs.find((npc) => npc.id === 'sera_voss')!;
    expect(sera.name).toBe('Sera Voss');
    expect(sera.memories[0]?.meta?.visibility).toBe('shared');
  });

  it('authored incidents seed witnesses who will gossip', async () => {
    const world = loadWorld();
    const beat = await authorBeat(
      world,
      fake(
        '{"kind":"incident","incident":{"text":"Someone pried open the forge shutters in the night and left scorch marks.","locationName":"Old Forge","pressureDelta":6}}'
      )
    );
    expect(beat).not.toBeNull();
    expect(
      world.npcs.some((npc) =>
        npc.memories.some(
          (memory) => memory.text.includes('scorch marks') && memory.meta?.visibility === 'shared'
        )
      )
    ).toBe(true);
  });

  it('authoring is throttled by tick distance', () => {
    const world = loadWorld();
    world.tick = 100;
    world.directorState = { pressure: 0, quietTicks: 0, lastAuthoredTick: 90 };
    expect(shouldAuthorBeat(world)).toBe(false);
    world.directorState.lastAuthoredTick = 10;
    expect(shouldAuthorBeat(world)).toBe(true);
  });
});
