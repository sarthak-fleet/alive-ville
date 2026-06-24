import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { applyAction, createEngine, retrieveMemories, validateAction } from '../src/simulation.ts';
import type { World } from '../src/types.ts';

const fixture = (): World =>
  JSON.parse(readFileSync(new URL('../worlds/village.json', import.meta.url), 'utf8')) as World;

describe('simulation', () => {
  test('validates and rejects malformed proposed actions', () => {
    const world = fixture();
    expect(validateAction(world, { type: 'dance', actorId: 'mira' }).ok).toBe(false);

    const result = applyAction(world, {
      type: 'gossip',
      actorId: 'mira',
      targetId: 'lena',
      aboutId: 'ghost',
      text: 'boo',
    });
    expect(result.applied).toBe(false);
    if (!result.applied) expect(result.reason).toBe('Unknown gossip subject.');
  });

  test('player actions create memories retrievable by later dialogue context', async () => {
    const engine = createEngine(fixture());
    await engine.tick({
      type: 'talk',
      targetId: 'lena',
      text: 'The bridge is unsafe after sundown.',
    });

    const memories = retrieveMemories(engine.state, 'lena', 'bridge unsafe');
    expect(memories.some((memory) => /bridge is unsafe/.test(memory.text))).toBe(true);
  });

  test('npc confrontation changes relationship state', async () => {
    const engine = createEngine(fixture());
    await engine.tick();
    expect(engine.npc('mira')!.relationships['tomas']).toBe(-2);
    expect(engine.npc('tomas')!.relationships['mira']).toBe(-1);
  });

  test('gossip emerges from initial world state and changes third-party trust', async () => {
    const engine = createEngine(fixture());
    const event = await engine.tick();

    expect(
      event.actions.some(
        (entry) =>
          entry.action.type === 'gossip' &&
          entry.action.type === 'gossip' &&
          entry.action.aboutId === 'pax'
      )
    ).toBe(true);
    expect(engine.npc('lena')!.relationships['pax']).toBe(-1);
    expect(engine.npc('orrin')!.relationships['pax']).toBe(-2);
  });

  test('tick summaries include rejected invalid LLM-like output and stable checksums', async () => {
    const engine = createEngine(fixture());
    const event = await engine.tick({ type: 'move', actorId: 'mira' as never, locationId: 'moon' });

    expect(event.rejected.length).toBe(1);
    expect(event.rejected[0]!.reason).toBe('Unknown location.');
    expect(event.checksum).toMatch(/^[0-9a-f]{8}$/);
  });

  test('custom propose function fully replaces scripted proposals', async () => {
    const calls: number[] = [];
    const propose = async (world: World) => {
      calls.push(world.tick);
      return [{ type: 'remember' as const, actorId: 'mira', text: 'custom plan' }];
    };
    const engine = createEngine(fixture(), { propose });
    const event = await engine.tick();

    expect(calls).toEqual([0]);
    expect(event.actions.length).toBe(1);
    expect(event.actions[0]!.action.type).toBe('remember');
  });

  test('setState restores a snapshot, including tick + clock + memories', async () => {
    const engine = createEngine(fixture());
    await engine.tick({ type: 'talk', targetId: 'lena', text: 'save-checkpoint' });
    const advancedTick = engine.state.tick;
    expect(advancedTick).toBeGreaterThan(0);

    const snapshot = JSON.parse(JSON.stringify(engine.state)) as World;

    // Mutate forward — then restore — then verify we're back where we were.
    await engine.tick();
    await engine.tick();
    expect(engine.state.tick).toBeGreaterThan(advancedTick);

    engine.setState(snapshot);
    expect(engine.state.tick).toBe(advancedTick);

    const memories = retrieveMemories(engine.state, 'lena', 'save-checkpoint');
    expect(memories.some((m) => /save-checkpoint/.test(m.text))).toBe(true);
  });
});
