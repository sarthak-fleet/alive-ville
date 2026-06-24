import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { advanceStoryPressure } from '../src/agents.ts';
import { createDirector, findHighestTension } from '../src/director.ts';
import { createEngine } from '../src/simulation.ts';
import type { Action, World } from '../src/types.ts';
import { type WorldIngestSource, worldSourceToWorld } from '../src/world-ingest.ts';

const fixture = (): World =>
  JSON.parse(readFileSync(new URL('../worlds/village.json', import.meta.url), 'utf8')) as World;
const opmFixture = (): World =>
  JSON.parse(
    readFileSync(new URL('../worlds/one-punch-man.json', import.meta.url), 'utf8')
  ) as World;
const source = (path: string): WorldIngestSource =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as WorldIngestSource;

describe('director', () => {
  test('findHighestTension picks the most negative pair', () => {
    const world = fixture();
    world.npcs.find((n) => n.id === 'tomas')!.relationships = { mira: -5 };
    const tension = findHighestTension(world);
    expect(tension).not.toBeNull();
    expect(tension!.fromId).toBe('tomas');
    expect(tension!.toId).toBe('mira');
    expect(tension!.score).toBe(-5);
  });

  test('injects gossip when nothing else happens', async () => {
    const world = fixture();
    world.npcs.find((n) => n.id === 'orrin')!.relationships['pax'] = -3;
    world.npcs.find((n) => n.id === 'lena')!.locationId = 'square';
    const director = createDirector();
    const engine = createEngine(world, { propose: async () => [], director });
    const event = await engine.tick();

    const directed = event.actions.find((entry) => entry.fromDirector);
    expect(directed).toBeDefined();
    expect(directed!.action.type).toBe('gossip');
    expect(directed!.action.actorId).toBe('orrin');
    if (directed!.action.type === 'gossip') expect(directed!.action.aboutId).toBe('pax');
  });

  test('silent when others act', async () => {
    const world = fixture();
    const director = createDirector();
    const propose = async (): Promise<Action[]> => [
      { type: 'remember', actorId: 'mira', text: 'calm day' },
    ];
    const engine = createEngine(world, { propose, director });
    const event = await engine.tick();
    expect(event.actions.some((entry) => entry.fromDirector)).toBe(false);
  });

  test('returns null on tension-free worlds', async () => {
    const world = fixture();
    for (const npc of world.npcs) npc.relationships = {};
    const director = createDirector();
    expect(await director(world)).toBeNull();
  });

  test('hidden plan pressure can create a grounded reveal after quiet time', async () => {
    const world = fixture();
    for (const npc of world.npcs) npc.relationships = {};
    world.clock.hour = 16;
    const director = createDirector();
    const engine = createEngine(world, { propose: async () => [], director });

    await engine.tick();
    await engine.tick();
    expect(engine.state.villainPlans?.[0]?.stage).toBeGreaterThanOrEqual(2);
    expect(engine.state.directorState?.pendingReveals?.length).toBeGreaterThan(0);

    const reveal = await engine.tick();
    expect(
      reveal.actions.some((entry) => entry.fromDirector && /Director clue/.test(entry.text))
    ).toBe(true);
  });

  test('nightfall wait state produces a readable story beat', async () => {
    const world = fixture();
    world.storyProgress = {
      phase: 'nightfall_warning',
      unlockedCutsceneIds: ['ashment_intro_square', 'villain_lantern_shadow'],
      playedCutsceneIds: [],
    };
    world.directorState = { pressure: 45, quietTicks: 1, pendingReveals: [] };
    for (const npc of world.npcs) npc.relationships = {};

    const director = createDirector();
    const engine = createEngine(world, { propose: async () => [], director });
    const event = await engine.tick();

    expect(
      event.actions.some((entry) => entry.fromDirector && /Lantern Inn/.test(entry.text))
    ).toBe(true);
  });

  test('generic imported worlds get source-derived director story beats', async () => {
    const world = worldSourceToWorld(source('../fixtures/worlds/skyfront-source.json'));
    world.storyProgress = {
      phase: 'nightfall_warning',
      unlockedCutsceneIds: [],
      playedCutsceneIds: [],
    };
    world.directorState = { pressure: 45, quietTicks: 1, pendingReveals: [] };
    for (const npc of world.npcs) npc.relationships = {};

    const director = createDirector();
    const engine = createEngine(world, { propose: async () => [], director });
    const event = await engine.tick();
    const directed = event.actions.find((entry) => entry.fromDirector);

    expect(directed?.action.actorId).toBe('nell');
    expect(directed?.text).toContain('Guild Counter');
    expect(directed?.text).toContain('false pirate alarm');
    expect(directed?.text).not.toMatch(/Lantern|Lena|Ashment|village/i);
  });

  test('OPM world gets Z-City director story beats', async () => {
    const world = opmFixture();
    world.storyProgress = {
      phase: 'nightfall_warning',
      unlockedCutsceneIds: [],
      playedCutsceneIds: [],
    };
    world.directorState = { pressure: 45, quietTicks: 1, pendingReveals: [] };
    for (const npc of world.npcs) npc.relationships = {};

    const director = createDirector();
    const engine = createEngine(world, { propose: async () => [], director });
    const event = await engine.tick();
    const directed = event.actions.find((entry) => entry.fromDirector);

    expect(directed?.action.actorId).toBe('lena');
    expect(directed?.text).toContain('Hero Association kiosk');
    expect(directed?.text).toContain('monster alert');
    expect(directed?.text).not.toMatch(/Lantern|Ashment|village/i);
  });

  test('generic imported worlds get source-derived pressure reveals', () => {
    const world = worldSourceToWorld(source('../fixtures/worlds/skyfront-source.json'));
    world.storyProgress = {
      phase: 'shadow_confrontation',
      unlockedCutsceneIds: [],
      playedCutsceneIds: [],
    };
    world.directorState = { pressure: 50, quietTicks: 1, pendingReveals: [] };
    world.villainPlans![0]!.pressure = 74;
    world.villainPlans![0]!.stage = 1;

    advanceStoryPressure(world, []);

    const reveals = world.directorState?.pendingReveals?.join('\n') ?? '';
    expect(reveals).toContain('Skyfront Couriers Playable Slice has gone quiet enough');
    expect(reveals).toContain('Vex is exposed while Nell watches');
    expect(reveals).toContain(
      'A false pirate alarm threatens the harbor route is close to breaking into the open'
    );
    expect(reveals).not.toMatch(/Lantern|Lena|Ashment|village|bridge whisper|blue pulse/i);
  });

  test('ignored world tensions escalate into visible status', async () => {
    const world = fixture();
    for (const npc of world.npcs) npc.relationships = {};
    world.tensions = [
      {
        id: 'test_pressure',
        title: 'A test pressure is being ignored',
        pressure: 73,
        status: 'active',
        involvedIds: ['bridge'],
      },
    ];

    const engine = createEngine(world, { propose: async () => [], director: createDirector() });
    await engine.tick();

    expect(engine.state.tensions?.[0]?.status).toBe('escalating');
    expect(
      engine.state.directorState?.pendingReveals?.some((reveal) => /Tension escalated/.test(reveal))
    ).toBe(true);
    expect(
      engine.state.directorState?.pendingReveals?.some((reveal) => /Counterplay:/.test(reveal))
    ).toBe(true);
  });
});
