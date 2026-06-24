import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { buildDialogueSystem } from '../src/dialogue.ts';
import { divergenceNudges, rightNowFor, voiceFingerprint } from '../src/npc-voice.ts';
import type { Npc, World } from '../src/types.ts';

function loadWorld(): World {
  return JSON.parse(
    readFileSync(new URL('../worlds/one-punch-man.json', import.meta.url), 'utf8')
  ) as World;
}

function makeNpc(overrides: Partial<Npc> = {}): Npc {
  return {
    id: 'test_npc',
    name: 'Test',
    locationId: 'square',
    relationships: {},
    memories: [],
    ...overrides,
  };
}

// ── voiceFingerprint ──────────────────────────────────────────────────────────

describe('voiceFingerprint', () => {
  it('produces non-overlapping diction strings for two distinct trait sets', () => {
    const stoic = makeNpc({
      id: 'stoic_warrior',
      traits: {
        personality: ['deadpan', 'stoic'],
        values: ['duty'],
        flaws: ['underreacts to danger'],
      },
    });
    const scholar = makeNpc({
      id: 'anxious_scholar',
      traits: { personality: ['analytical', 'serious'], values: ['knowledge'], flaws: ['anxious'] },
    });

    const stoicFp = voiceFingerprint(stoic);
    const scholarFp = voiceFingerprint(scholar);

    // They must differ
    expect(stoicFp).not.toBe(scholarFp);

    // Stoic: should reference clipping/brevity
    expect(stoicFp).toMatch(/clip|one will do|briefl/i);

    // Scholar: should reference precision or formality or worry
    expect(scholarFp).toMatch(/precise|contraction|trails|worr/i);
  });

  it('includes a two-line example exchange (Q/A)', () => {
    const npc = makeNpc({
      id: 'npc_alpha',
      traits: { personality: ['stoic'], values: ['strength'], flaws: [] },
    });
    const fp = voiceFingerprint(npc);
    expect(fp).toContain('Q: "');
    expect(fp).toContain('A: "');
  });

  it('is deterministic — same NPC id always produces the same fingerprint', () => {
    const npc = makeNpc({
      id: 'deterministic_test',
      traits: { personality: ['blunt', 'direct'], values: ['honesty'], flaws: ['harsh'] },
    });
    expect(voiceFingerprint(npc)).toBe(voiceFingerprint(npc));
  });

  it('returns a fingerprint even with no traits', () => {
    const npc = makeNpc({ id: 'bare_npc' });
    const fp = voiceFingerprint(npc);
    expect(fp.length).toBeGreaterThan(10);
    expect(fp).toContain('Q: "');
  });
});

// ── rightNowFor ───────────────────────────────────────────────────────────────

describe('rightNowFor', () => {
  it('reflects time of day in the output', () => {
    const world = loadWorld();
    // OPM world clock.hour is 8 → timeOfDay returns "dawn" → "first light"
    const npc = world.npcs[0]!;
    const line = rightNowFor(world, npc);
    expect(line).toMatch(/first light|midday|dusk|deep night/i);
  });

  it('surfaces the current goal / intent kind as physical activity', () => {
    const world = loadWorld();
    const npc = makeNpc({
      id: 'guard_1',
      locationId: 'square',
      role: 'guard',
      plan: {
        currentIntent: {
          kind: 'investigate',
          targetId: 'square',
          reason: 'anomaly',
          updatedTick: 1,
        },
      },
    });
    const line = rightNowFor(world, npc);
    expect(line).toContain('picking through details');
  });

  it('falls back to role-based activity when no intent is set', () => {
    const world = loadWorld();
    const npc = makeNpc({ id: 'smith_1', locationId: 'square', role: 'blacksmith' });
    const line = rightNowFor(world, npc);
    expect(line).toContain('sharpening a blade');
  });

  it('references a recent confrontation when one exists in the chronicle', () => {
    const world = loadWorld();
    world.chronicle = [
      {
        id: 'ch_5_0',
        tick: world.tick,
        day: world.clock.day,
        hour: Math.floor(world.clock.hour),
        kind: 'confrontation',
        text: 'A shouting match erupted.',
        actorId: 'npc_fighter',
        targetId: 'npc_fighter',
        causeIds: [],
        playerCaused: false,
      },
    ];
    const npc = makeNpc({ id: 'npc_fighter', locationId: 'square' });
    const line = rightNowFor(world, npc);
    expect(line).toContain('shouting match');
  });

  it('shows relationship vector when no confrontation or negative reflection exists', () => {
    const world = loadWorld();
    // Use a fresh NPC with a warm relationship and no confrontations
    const npc = makeNpc({ id: 'rel_test', locationId: 'square', relationships: { player: 4 } });
    const line = rightNowFor(world, npc);
    expect(line).toContain('warm to you');
  });

  it('starts with RIGHT NOW:', () => {
    const world = loadWorld();
    const npc = world.npcs[0]!;
    expect(rightNowFor(world, npc)).toMatch(/^RIGHT NOW:/);
  });
});

// ── divergenceNudges ──────────────────────────────────────────────────────────

describe('divergenceNudges', () => {
  it('returns 0 nudges for an NPC with no strong traits', () => {
    const npc = makeNpc({ traits: {} });
    expect(divergenceNudges(npc)).toHaveLength(0);
  });

  it('returns 0 nudges for an NPC with no traits at all', () => {
    const npc = makeNpc();
    expect(divergenceNudges(npc)).toHaveLength(0);
  });

  it('returns 1–2 nudges for an NPC with clear traits', () => {
    const npc = makeNpc({
      traits: { personality: ['blunt', 'analytical'], flaws: ['dismissive'] },
    });
    const nudges = divergenceNudges(npc);
    expect(nudges.length).toBeGreaterThanOrEqual(1);
    expect(nudges.length).toBeLessThanOrEqual(2);
  });

  it('never returns duplicate verbatim nudges for the same NPC', () => {
    // blunt + impatient + dismissive all map to the same "DO NOT pad" nudge
    const npc = makeNpc({
      traits: {
        personality: ['blunt', 'impatient'],
        flaws: ['dismissive', 'harsh'],
      },
    });
    const nudges = divergenceNudges(npc);
    const unique = new Set(nudges);
    expect(unique.size).toBe(nudges.length);
  });

  it('caps at 2 nudges even with many trait signals', () => {
    const npc = makeNpc({
      traits: {
        personality: ['blunt', 'analytical', 'young', 'casual', 'paranoid', 'proud'],
        flaws: ['harsh', 'arrogant'],
      },
    });
    expect(divergenceNudges(npc)).toHaveLength(2);
  });
});

// ── integration: buildDialogueSystem ─────────────────────────────────────────

describe('buildDialogueSystem integration', () => {
  it('contains VOICE:, RIGHT NOW:, and existing STANDING BELIEFS block', () => {
    const world = loadWorld();
    const npc = world.npcs.find((n) => n.locationId === world.player.locationId)!;
    const system = buildDialogueSystem(world, npc);

    expect(system).toContain('VOICE:');
    expect(system).toContain('RIGHT NOW:');
    expect(system).toContain('STANDING BELIEFS');
    // RUMORS ABOUT YOU is only injected when the NPC holds player-subject memories;
    // this NPC starts with none, so the block is legitimately absent.
    expect(system).not.toContain('RUMORS ABOUT YOU');
  });

  it('contains optional DIVERGE: block for an NPC with strong traits', () => {
    const world = loadWorld();
    // Saitama has "deadpan", "casual", "direct" — should trigger nudges
    const saitama = world.npcs.find((n) => n.id === 'mira')!;
    const system = buildDialogueSystem(world, saitama);
    expect(system).toContain('DIVERGE:');
  });

  it('includes RUMORS ABOUT YOU when the NPC has player-subject memories', () => {
    const world = loadWorld();
    const npc = world.npcs.find((n) => n.locationId === world.player.locationId)!;
    npc.memories.push({
      tick: 1,
      text: 'The visitor defeated a monster at the plaza.',
      meta: { importance: 6, visibility: 'shared', subject: 'player' },
    });
    const system = buildDialogueSystem(world, npc);
    expect(system).toContain('RUMORS ABOUT YOU');
    // clean up
    npc.memories.pop();
  });

  it('omits DIVERGE: block when NPC has no strong trait signal', () => {
    const world = loadWorld();
    const npc = makeNpc({ id: 'bare_test', locationId: world.player.locationId });
    // Inject into world so buildDialogueSystem can use world context
    world.npcs.push(npc);
    const system = buildDialogueSystem(world, npc);
    expect(system).not.toContain('DIVERGE:');
    world.npcs.pop();
  });
});
