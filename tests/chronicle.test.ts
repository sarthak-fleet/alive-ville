import { readFileSync } from 'node:fs';

import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearDialogueHistories,
  type DialogueCompleter,
  generateDialogueReply,
} from '../src/dialogue.ts';
import { runTick, trimWorldGrowth } from '../src/simulation.ts';
import type { ChronicleEvent, World } from '../src/types.ts';

function loadVillage(): World {
  return JSON.parse(
    readFileSync(new URL('../worlds/village.json', import.meta.url), 'utf8')
  ) as World;
}

function loadOpm(): World {
  return JSON.parse(
    readFileSync(new URL('../worlds/one-punch-man.json', import.meta.url), 'utf8')
  ) as World;
}

function completerReturning(text: string): DialogueCompleter {
  return (req) =>
    Promise.resolve({
      text,
      raw: text,
      meta: { tier: req.tier, model: 'test', latencyMs: 1, error: null, jsonOk: false },
    });
}

const scripted = { propose: () => [] };

beforeEach(() => clearDialogueHistories());

describe('chronicle: causal trace of legible beats', () => {
  it('records a player_word chronicle when a juicy line becomes shared memory', async () => {
    const world = loadOpm();
    const npc = world.npcs.find((entry) => entry.locationId === world.player.locationId)!;
    const before = (world.chronicle ?? []).length;
    // "secret" matches memoryMetaFromText keyword regex → importance 7 → visibility=shared
    const playerText = 'I know your secret about the bridge.';
    const result = await generateDialogueReply(world, npc.id, playerText, {
      complete: completerReturning('{"reply":"Hush.","action":null,"disposition":0}'),
    });
    expect(result.ok).toBe(true);

    const playerWords = (world.chronicle ?? []).filter((event) => event.kind === 'player_word');
    expect(playerWords.length).toBe(1);
    expect(playerWords[0]!.playerCaused).toBe(true);
    expect(playerWords[0]!.text).toContain(npc.name);
    expect((world.chronicle ?? []).length).toBe(before + 1);

    // the seed memory carries the chronicle id so downstream gossip can chain
    const seed = npc.memories.find((memory) => memory.text.includes(playerText))!;
    expect(seed.meta?.chronicleId).toBe(playerWords[0]!.id);
    expect(seed.meta?.visibility).toBe('shared');
  });

  it('gossip diffusion extends the chronicle chain hop by hop', async () => {
    const world = loadVillage();
    // pair two NPCs alone at a location so the listener round-robin is deterministic
    const mira = world.npcs.find((entry) => entry.id === 'mira')!;
    const tomas = world.npcs.find((entry) => entry.id === 'tomas')!;
    mira.locationId = 'bridge';
    tomas.locationId = 'bridge';

    // seed the chronicle root manually and stamp it on mira's freshest shareable memory
    world.chronicle = [
      {
        id: 'ch_seed_0',
        tick: world.tick,
        day: world.clock.day,
        hour: Math.floor(world.clock.hour),
        kind: 'player_word',
        text: 'Seed cause.',
        actorId: 'player',
        targetId: mira.id,
        causeIds: [],
        playerCaused: true,
      },
    ];
    // newest + juiciest + shareable on mira so diffuseGossip picks it
    mira.memories.push({
      tick: world.tick,
      text: 'Someone hid the moonmint shipment under the garden shed.',
      meta: { importance: 8, visibility: 'shared', chronicleId: 'ch_seed_0' },
    });

    await runTick(world, undefined, scripted);

    const gossip = (world.chronicle ?? []).filter((event) => event.kind === 'gossip');
    expect(gossip.length).toBeGreaterThan(0);
    expect(gossip[0]!.causeIds).toContain('ch_seed_0');
    // playerCaused must inherit through the chain
    expect(gossip[0]!.playerCaused).toBe(true);

    // tomas's copy of the rumor is stamped with the new chronicle id
    const copy = tomas.memories.find((memory) => memory.text.includes('moonmint shipment'))!;
    expect(copy.meta?.chronicleId).toBe(gossip[0]!.id);
  });

  it('full causal chain: player_word → gossip → secret_revealed → turned_against → confrontation, all playerCaused', async () => {
    // wire a scenario where the secret's words travel from the player's line
    // through gossip to a principled judge, who recognizes and confronts the holder
    const world = loadVillage();
    const holder = world.npcs.find((entry) => entry.id === 'mira')!;
    const carrier = world.npcs.find((entry) => entry.id === 'tomas')!;
    const judge = world.npcs.find((entry) => entry.id === 'lena')!;

    holder.locationId = 'garden';
    carrier.locationId = 'square';
    judge.locationId = 'square';
    judge.traits = { ...(judge.traits ?? {}), values: ['justice', 'order'] };
    // the player is co-located with the carrier so dialogue is allowed
    world.player.locationId = 'square';

    // the secret's significant words must overlap with what travels — both
    // mention "moonmint shipment garden shed"
    holder.secrets = [
      {
        id: 's1',
        text: 'Mira hides the stolen moonmint shipment under the garden shed',
        risk: 80,
        knownBy: [],
      },
    ];

    // STEP 1: player tells the carrier the secret (juicy → shared → chronicle root)
    const playerText = 'I heard Mira hides the stolen moonmint shipment under her garden shed.';
    const result = await generateDialogueReply(world, carrier.id, playerText, {
      complete: completerReturning('{"reply":"Hm.","action":null,"disposition":0}'),
    });
    expect(result.ok).toBe(true);

    // co-locate judge with carrier so gossip diffuses
    judge.locationId = 'square';

    // run ticks: gossip should spread to lena, she recognizes the secret, turns
    // against mira, walks to the garden, and confronts her
    let confronted = false;
    for (let index = 0; index < 12 && !confronted; index += 1) {
      const summary = await runTick(world, undefined, scripted);
      confronted = summary.actions.some(
        (entry) => entry.action.type === 'confront' && entry.text.includes('confronts')
      );
    }
    expect(confronted).toBe(true);

    const chronicle = world.chronicle ?? [];
    const byId = new Map(chronicle.map((event) => [event.id, event]));
    // walk back from the confrontation: every link in the chain must exist
    const confrontation = chronicle.find((event) => event.kind === 'confrontation');
    expect(confrontation).toBeDefined();
    const turned = confrontation!.causeIds
      .map((id) => byId.get(id))
      .find((event) => event?.kind === 'turned_against');
    expect(turned).toBeDefined();
    const secret = turned!.causeIds
      .map((id) => byId.get(id))
      .find((event) => event?.kind === 'secret_revealed');
    expect(secret).toBeDefined();
    // the secret was triggered by a gossip memory whose chronicle root is the player_word
    const gossipOrPlayer = secret!.causeIds
      .map((id) => byId.get(id))
      .find((event) => event !== undefined);
    expect(gossipOrPlayer).toBeDefined();
    // there must be at least one player_word and at least one gossip on the path
    expect(chronicle.some((event) => event.kind === 'player_word')).toBe(true);
    expect(chronicle.some((event) => event.kind === 'gossip')).toBe(true);

    // and the final beat inherits playerCaused all the way through
    expect(confrontation!.playerCaused).toBe(true);
    expect(turned!.playerCaused).toBe(true);
    expect(secret!.playerCaused).toBe(true);
  });

  it('trimWorldGrowth caps the chronicle at 100 entries', () => {
    const world = loadVillage();
    world.chronicle = Array.from({ length: 300 }, (_, index) => ({
      id: `ch_seed_${index}`,
      tick: index,
      day: 1,
      hour: 0,
      kind: 'authored',
      text: `event ${index}`,
      causeIds: [],
      playerCaused: false,
    })) satisfies ChronicleEvent[];

    trimWorldGrowth(world);
    expect(world.chronicle.length).toBe(100);
    // the most recent survive (oldest dropped)
    expect(world.chronicle.at(-1)!.id).toBe('ch_seed_299');
    expect(world.chronicle[0]!.id).toBe('ch_seed_200');
  });
});
