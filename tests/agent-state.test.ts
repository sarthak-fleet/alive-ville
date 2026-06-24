import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { planAgentIntent, retrieveRelevantMemories, scheduledBlockFor } from '../src/agents.ts';
import { applyAction, createEngine } from '../src/simulation.ts';
import type { World } from '../src/types.ts';

const fixture = (): World =>
  JSON.parse(readFileSync(new URL('../worlds/village.json', import.meta.url), 'utf8')) as World;

describe('Agent State v1', () => {
  test('engine initializes mood, needs, memory metadata, relationship axes, and current intent', () => {
    const engine = createEngine(fixture(), { propose: async () => [] });
    const mira = engine.npc('mira')!;

    expect(mira.mood?.emotion).toBe('worried');
    expect(mira.needs?.duty).toBeGreaterThan(70);
    expect(mira.relationshipAxes?.['tomas']?.suspicion).toBeGreaterThan(0);
    expect(mira.plan?.currentIntent?.kind).toBe('help');
    expect(mira.memories[0]?.meta?.importance).toBeGreaterThan(0);
  });

  test('memory retrieval uses tags, importance, emotion, and recency', () => {
    const engine = createEngine(fixture(), { propose: async () => [] });
    const memories = retrieveRelevantMemories(
      engine.state,
      'pax',
      'bridge whisper secret bright pieces',
      2
    );

    expect(memories[0]?.text).toMatch(/bright pieces/);
    expect(memories[0]?.score).toBeGreaterThan(memories[1]?.score ?? 0);
  });

  test('villain plan creates an escalation intent without making the villain omniscient', () => {
    const world = fixture();
    const pax = world.npcs.find((npc) => npc.id === 'pax')!;
    const intent = planAgentIntent(world, pax);

    expect(intent.kind).toBe('escalate');
    expect(intent.reason).toMatch(/hidden plan/i);
    expect(intent.targetId).toBe('bridge_whisper_plan');
  });

  test('new memories written by actions get metadata and become retrievable', () => {
    const world = fixture();
    const result = applyAction(world, {
      type: 'talk',
      actorId: 'player',
      targetId: 'lena',
      text: 'The bridge is unsafe after sundown.',
    });

    expect(result.applied).toBe(true);
    const latest = world.npcs.find((npc) => npc.id === 'lena')?.memories.at(-1);
    expect(latest?.meta?.tags).toContain('bridge');
    expect(retrieveRelevantMemories(world, 'lena', 'bridge unsafe', 1)[0]?.text).toMatch(
      /bridge is unsafe/
    );
  });

  test('agents expose deterministic schedules and next action hints', () => {
    const engine = createEngine(fixture(), { propose: async () => [] });
    const lena = engine.npc('lena')!;

    expect(lena.plan?.schedule?.length).toBeGreaterThan(1);
    expect(scheduledBlockFor(engine.state, lena)?.intent).toMatch(/witness|rumors|lantern/i);
    expect(lena.plan?.nextActionHint).toMatch(/Collect|Compare|Trim|routine|clue|support/i);
  });

  test('default simulation moves NPCs along their schedules', async () => {
    const world = fixture();
    world.tick = 3;
    world.clock.hour = 18;
    const engine = createEngine(world);

    const event = await engine.tick();
    const orrinMove = event.actions.find(
      (entry) => entry.action.type === 'move' && entry.action.actorId === 'orrin'
    );

    expect(orrinMove?.text).toMatch(/Orrin moved to Lantern Inn/);
    expect(engine.npc('orrin')?.locationId).toBe('inn');
    expect(engine.npc('orrin')?.plan?.currentIntent?.updatedTick).toBe(engine.state.tick);
  });

  test('refreshMoods updates NPC emotion and stress based on time and pressure', async () => {
    const engine = createEngine(fixture(), { propose: async () => [] });
    const mira = engine.npc('mira')!;
    mira.mood = { emotion: 'calm', stress: 10, confidence: 50, suspicion: 10 };

    // Tick forward to night
    engine.state.clock.hour = 22;
    await engine.tick(); // refreshMoods is called in tick

    expect(mira.mood.stress).toBeLessThan(10);
    expect(mira.mood.suspicion).toBeGreaterThan(10);

    // Tick with high director pressure during the day
    engine.state.clock.hour = 12;
    engine.state.directorState!.pressure = 80;
    await engine.tick();

    expect(mira.mood.emotion).toBe('anxious');
    expect(mira.mood.stress).toBeGreaterThan(8);
  });
});
