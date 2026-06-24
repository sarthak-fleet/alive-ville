import { readFileSync } from 'node:fs';

import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearDialogueHistories,
  type DialogueCompleter,
  generateDialogueReply,
} from '../src/dialogue.ts';
import type { World } from '../src/types.ts';

function loadWorld(): World {
  return JSON.parse(
    readFileSync(new URL('../worlds/one-punch-man.json', import.meta.url), 'utf8')
  ) as World;
}

function completerReturning(text: string): {
  calls: Array<{ system: string; user: string }>;
  complete: DialogueCompleter;
} {
  const calls: Array<{ system: string; user: string }> = [];
  return {
    calls,
    complete: (req) => {
      calls.push({ system: req.system, user: req.user });
      return Promise.resolve({
        text,
        raw: text,
        meta: { tier: req.tier, model: 'test', latencyMs: 1, error: null, jsonOk: false },
      });
    },
  };
}

function npcWithPlayer(world: World) {
  return world.npcs.find((entry) => entry.locationId === world.player.locationId)!;
}

beforeEach(() => clearDialogueHistories());

describe('LLM dialogue', () => {
  it('returns an in-character reply and records both turns as memories', async () => {
    const world = loadWorld();
    const npc = npcWithPlayer(world);
    const before = npc.memories.length;
    const { complete } = completerReturning(
      '{"reply":"Stay sharp out there.","action":null,"disposition":0}'
    );

    const result = await generateDialogueReply(world, npc.id, 'Anything dangerous nearby?', {
      complete: complete,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.reply).toBe('Stay sharp out there.');
    expect(npc.memories.length).toBe(before + 2);
    expect(npc.memories.at(-2)!.text).toContain('Anything dangerous nearby?');
  });

  it('accepts plain-text replies when the model ignores the JSON format', async () => {
    const world = loadWorld();
    const npc = npcWithPlayer(world);
    const { complete } = completerReturning(`${npc.name}: "Keep your voice down."`);
    const result = await generateDialogueReply(world, npc.id, 'Psst', { complete: complete });
    expect(result.ok && result.reply).toBe('Keep your voice down.');
  });

  it('threads conversation history into subsequent prompts', async () => {
    const world = loadWorld();
    const npc = npcWithPlayer(world);
    const { calls, complete } = completerReturning(
      '{"reply":"As I said, the plaza is safe.","action":null,"disposition":0}'
    );

    await generateDialogueReply(world, npc.id, 'Is the plaza safe?', { complete: complete });
    await generateDialogueReply(world, npc.id, 'Are you sure?', { complete: complete });

    expect(calls[1]!.user).toContain('Is the plaza safe?');
    expect(calls[1]!.user).toContain('Conversation so far:');
  });

  it('develops the relationship from disposition', async () => {
    const world = loadWorld();
    const npc = npcWithPlayer(world);
    const start = npc.relationships?.['player'] ?? 0;
    const { complete } = completerReturning(
      '{"reply":"You honor me.","action":null,"disposition":2}'
    );
    const result = await generateDialogueReply(world, npc.id, 'Your courage saved the plaza.', {
      complete: complete,
    });
    expect(result.ok).toBe(true);
    expect(npc.relationships?.['player']).toBe(start + 2);
    if (result.ok) expect(result.relationship.score).toBe(start + 2);
  });

  it('applies an engine-validated action the NPC decided on (give item)', async () => {
    const world = loadWorld();
    const npc = npcWithPlayer(world);
    const held = world.items.find((item) => item.holderId === npc.id);
    if (!held) {
      // give this npc something to hand over
      world.items[0]!.holderId = npc.id;
      world.items[0]!.locationId = undefined;
    }
    const item = world.items.find((entry) => entry.holderId === npc.id)!;
    const { complete } = completerReturning(
      `{"reply":"Take this.","action":{"type":"give","itemId":"${item.id}"},"disposition":1}`
    );
    const result = await generateDialogueReply(world, npc.id, 'Can you help me?', {
      complete: complete,
    });
    expect(result.ok && result.action?.type).toBe('give');
    expect(item.holderId).toBe('player');
  });

  it('creates dynamic quests from conversation', async () => {
    const world = loadWorld();
    const npc = npcWithPlayer(world);
    const before = (world.quests ?? []).length;
    const { complete } = completerReturning(
      '{"reply":"There is something you could do…","action":{"type":"create_quest","title":"Scout the overpass","description":"Check the humming."},"disposition":1}'
    );
    const result = await generateDialogueReply(world, npc.id, 'Need any help?', {
      complete: complete,
    });
    expect(result.ok && result.action?.type).toBe('create_quest');
    const quests = world.quests ?? [];
    expect(quests.length).toBe(before + 1);
    const created = quests.at(-1)!;
    expect(created.title).toBe('Scout the overpass');
    expect(created.status).toBe('active');
    expect(created.acceptedBy).toBe('player');
    expect(created.giverId).toBe(npc.id);
  });

  it('reports follow decisions without touching the engine', async () => {
    const world = loadWorld();
    const npc = npcWithPlayer(world);
    const { complete } = completerReturning(
      '{"reply":"Very well, lead the way.","action":{"type":"follow"},"disposition":1}'
    );
    const result = await generateDialogueReply(world, npc.id, 'Come with me.', {
      complete: complete,
    });
    expect(result.ok && result.action?.type).toBe('follow');
    expect(result.ok && result.action?.text).toContain('starts following');
  });

  it('ignores invalid actions but keeps the reply', async () => {
    const world = loadWorld();
    const npc = npcWithPlayer(world);
    const { complete } = completerReturning(
      '{"reply":"I shall go.","action":{"type":"move","locationId":"nowhere_real"},"disposition":0}'
    );
    const result = await generateDialogueReply(world, npc.id, 'Leave!', { complete: complete });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reply).toBe('I shall go.');
      expect(result.action).toBeUndefined();
    }
  });

  it('lists capabilities (exits, items, quests) in the prompt', async () => {
    const world = loadWorld();
    const npc = npcWithPlayer(world);
    const { calls, complete } = completerReturning('{"reply":"Hm.","action":null,"disposition":0}');
    await generateDialogueReply(world, npc.id, 'Hello', { complete: complete });
    expect(calls[0]!.user).toContain('CAPABILITIES');
    expect(calls[0]!.user).toContain('Places you can walk to:');
    expect(calls[0]!.system).toContain('"type":"create_quest"');
    expect(calls[0]!.system).not.toContain('Ashment');
  });

  it('parses the streaming format (reply text + @@ control tail) and streams only the reply', async () => {
    const world = loadWorld();
    const npc = npcWithPlayer(world);
    const full = 'Hold the line, friend.\n@@{"action":null,"disposition":1}';
    const streamed: string[] = [];
    const complete: DialogueCompleter = async (req) => {
      // emit in awkward chunks crossing the @@ boundary
      for (const chunk of [
        'Hold the li',
        'ne, friend.',
        '\n@',
        '@{"action":null,',
        '"disposition":1}',
      ]) {
        req.onToken?.(chunk);
      }
      return {
        text: full,
        raw: full,
        meta: { tier: req.tier, model: 'test', latencyMs: 1, error: null, jsonOk: false },
      };
    };
    const result = await generateDialogueReply(world, npc.id, 'Ready?', {
      complete,
      onToken: (delta) => streamed.push(delta),
    });
    expect(result.ok && result.reply).toBe('Hold the line, friend.');
    const visible = streamed.join('');
    expect(visible).toContain('Hold the line, friend.');
    expect(visible).not.toContain('@@');
    expect(visible).not.toContain('disposition');
  });

  it('refuses when the NPC is far away (non-adjacent) or defeated', async () => {
    const world = loadWorld();
    // hub-and-spoke map: stand at one leaf so an NPC at another leaf is non-adjacent
    const adjacentTo = (id: string) =>
      new Set(
        world.exits.flatMap((exit) =>
          exit.from === id ? [exit.to] : exit.to === id ? [exit.from] : []
        )
      );
    const leaf = world.locations.find((location) =>
      world.npcs.some(
        (npc) => npc.locationId !== location.id && !adjacentTo(location.id).has(npc.locationId)
      )
    )!;
    world.player.locationId = leaf.id;
    const elsewhere = world.npcs.find(
      (npc) => npc.locationId !== leaf.id && !adjacentTo(leaf.id).has(npc.locationId)
    )!;
    const { complete } = completerReturning('Should not be called');
    expect(
      await generateDialogueReply(world, elsewhere.id, 'Hello?', { complete: complete })
    ).toEqual({ ok: false, reason: 'npc_not_here' });

    world.player.locationId = loadWorld().player.locationId;
    const here = npcWithPlayer(world);
    here.combat = { hp: 0, maxHp: 100, posture: 0, defeated: true };
    expect(await generateDialogueReply(world, here.id, 'Hello?', { complete: complete })).toEqual({
      ok: false,
      reason: 'npc_defeated',
    });
  });

  it('propagates completer errors as failures without writing memories', async () => {
    const world = loadWorld();
    const npc = npcWithPlayer(world);
    const before = npc.memories.length;
    const failing: DialogueCompleter = () =>
      Promise.resolve({
        error: 'timeout',
        meta: { tier: 'normal', model: 'test', latencyMs: 1, error: 'timeout', jsonOk: false },
      });
    expect(await generateDialogueReply(world, npc.id, 'Hello', { complete: failing })).toEqual({
      ok: false,
      reason: 'timeout',
    });
    expect(npc.memories.length).toBe(before);
  });
  it('lead: the NPC walks off toward the asked location and the event guides the player', async () => {
    const world = loadWorld();
    const npc = npcWithPlayer(world);
    const exit =
      (world.exits ?? []).find((entry) => entry.from === npc.locationId) ?? (world.exits ?? [])[0]!;
    const target = exit.from === npc.locationId ? exit.to : exit.from;
    const { complete } = completerReturning(
      `Right this way.\n@@{"action":{"type":"lead","locationId":"${target}"},"disposition":0}`
    );
    const result = await generateDialogueReply(world, npc.id, 'can you take me there?', {
      complete,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.action?.type).toBe('lead');
      expect(result.action?.text).toContain('follow them');
    }
    expect(npc.locationId).toBe(target);
  });
});
