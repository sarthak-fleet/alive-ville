import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { applyAction, coinsOf, getItem } from '../src/simulation.ts';
import type { World } from '../src/types.ts';

const fixture = (): World =>
  JSON.parse(readFileSync(new URL('../worlds/village.json', import.meta.url), 'utf8')) as World;

describe('currency', () => {
  test('coinsOf defaults to 0 when unset', () => {
    const world = fixture();
    expect(coinsOf(world, 'player')).toBe(0);
    expect(coinsOf(world, 'mira')).toBe(0);
  });

  test('completing a quest by gift rewards the player coins', () => {
    const world = fixture();
    expect(
      applyAction(world, { type: 'accept_quest', actorId: 'player', questId: 'return_shears' })
        .applied
    ).toBe(true);
    expect(
      applyAction(world, { type: 'move', actorId: 'player', locationId: 'forge' }).applied
    ).toBe(true);
    expect(
      applyAction(world, { type: 'pickup', actorId: 'player', itemId: 'shears' }).applied
    ).toBe(true);
    expect(
      applyAction(world, { type: 'move', actorId: 'player', locationId: 'square' }).applied
    ).toBe(true);
    expect(
      applyAction(world, { type: 'move', actorId: 'player', locationId: 'garden' }).applied
    ).toBe(true);

    const before = coinsOf(world, 'player');
    expect(
      applyAction(world, { type: 'give', actorId: 'player', itemId: 'shears', targetId: 'mira' })
        .applied
    ).toBe(true);
    expect(coinsOf(world, 'player')).toBe(before + 25);
  });

  test('buy transfers the item and moves coins both ways', () => {
    const world = fixture();
    const shears = getItem(world, 'shears')!;
    shears.holderId = 'mira';
    shears.price = 10;
    world.player.coins = 30;

    const result = applyAction(world, {
      type: 'buy',
      actorId: 'player',
      itemId: 'shears',
      fromId: 'mira',
    });
    expect(result.applied).toBe(true);
    expect(getItem(world, 'shears')!.holderId).toBe('player');
    expect(coinsOf(world, 'player')).toBe(20);
    expect(coinsOf(world, 'mira')).toBe(10);
  });

  test("buy is rejected and nothing moves when the player can't afford it", () => {
    const world = fixture();
    const shears = getItem(world, 'shears')!;
    shears.holderId = 'mira';
    shears.price = 10;
    world.player.coins = 5;

    const result = applyAction(world, {
      type: 'buy',
      actorId: 'player',
      itemId: 'shears',
      fromId: 'mira',
    });
    expect(result.applied).toBe(false);
    expect(getItem(world, 'shears')!.holderId).toBe('mira');
    expect(coinsOf(world, 'player')).toBe(5);
  });

  test('sell moves the item to the buyer and pays the seller', () => {
    const world = fixture();
    const shears = getItem(world, 'shears')!;
    shears.holderId = 'player';
    shears.price = 15;
    world.player.coins = 0;
    const mira = world.npcs.find((n) => n.id === 'mira')!;
    mira.coins = 50;

    const result = applyAction(world, {
      type: 'sell',
      actorId: 'player',
      itemId: 'shears',
      toId: 'mira',
    });
    expect(result.applied).toBe(true);
    expect(getItem(world, 'shears')!.holderId).toBe('mira');
    expect(coinsOf(world, 'player')).toBe(15);
    expect(coinsOf(world, 'mira')).toBe(35);
  });

  test('being defeated costs the player a 25% cut to the victor', () => {
    const world = fixture();
    world.player.coins = 40;
    world.player.combat = { hp: 1, maxHp: 120, posture: 1, defeated: false };
    const tomas = world.npcs.find((n) => n.id === 'tomas')!;
    tomas.locationId = world.player.locationId;

    const result = applyAction(world, { type: 'fight', actorId: 'tomas', targetId: 'player' });
    expect(result.applied).toBe(true);
    expect(world.player.combat?.defeated).toBe(true);
    expect(coinsOf(world, 'player')).toBe(30);
    expect(coinsOf(world, 'tomas')).toBe(10);
  });
});
