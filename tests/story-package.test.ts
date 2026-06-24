import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import type { CutsceneManifestEntry } from '../src/story-package.ts';
import {
  storyPackageFromWorld,
  validateStoryPackage,
  worldFromStoryPackage,
} from '../src/story-package.ts';
import type { World } from '../src/types.ts';

const fixture = (): World =>
  JSON.parse(readFileSync(new URL('../worlds/village.json', import.meta.url), 'utf8')) as World;

describe('story package shape', () => {
  test('wraps the current world and scoped cutscenes into an importable package', () => {
    const world = fixture();
    const manifest: CutsceneManifestEntry[] = [
      {
        id: 'ashment_intro_square',
        worldId: 'ashment',
        storyId: 'ember_beneath_ashment',
        arcId: 'arrival',
        order: 10,
        title: 'Ashment Arrival',
        moment: 'Opening',
        src: '/assets/cutscenes/ashment_intro_square.mp4',
        poster: '/assets/cutscenes/ashment_intro_square.jpg',
        triggers: [{ kind: 'session_start' }],
      },
      {
        id: 'other_intro',
        worldId: 'other',
        storyId: 'other_story',
        arcId: 'arrival',
        order: 10,
        title: 'Other',
        moment: 'Opening',
        src: '/other.mp4',
        poster: '/other.jpg',
        triggers: [],
      },
    ];

    const pkg = storyPackageFromWorld(world, manifest);

    expect(pkg.packageVersion).toBe(1);
    expect(pkg.worldId).toBe('ashment');
    expect(pkg.world.npcs.length).toBeGreaterThan(0);
    expect(pkg.world.factions.length).toBeGreaterThan(0);
    expect(pkg.world.tensions.length).toBeGreaterThan(0);
    expect(pkg.world.villainPlans.length).toBeGreaterThan(0);
    expect(pkg.world.interactables.map((prop) => prop.id)).toContain('bridge_scars');
    expect(pkg.assets.cutscenes.map((cutscene) => cutscene.id)).toEqual(['ashment_intro_square']);
    expect(validateStoryPackage(pkg)).toEqual([]);
  });

  test('validation catches broken world references before import work starts', () => {
    const pkg = storyPackageFromWorld(fixture());
    pkg.world.npcs[0]!.locationId = 'missing_place';

    expect(validateStoryPackage(pkg)).toEqual([
      {
        path: `world.npcs.${pkg.world.npcs[0]!.id}.locationId`,
        message: 'NPC location must exist in the package world.',
      },
    ]);
  });

  test('imports a validated story package into a playable world state', () => {
    const pkg = storyPackageFromWorld(fixture());
    const world = worldFromStoryPackage(pkg);

    expect(world.id).toBe('ashment');
    expect(world.tick).toBe(0);
    expect(world.player.locationId).toBe('square');
    expect(world.eventLog).toEqual([]);
    expect(world.npcs.length).toBe(pkg.world.npcs.length);
    expect(world.interactables?.length).toBe(pkg.world.interactables.length);
    expect(world.storyProgress?.phase).toBe('starter');
  });

  test('validation catches broken interactable locations', () => {
    const pkg = storyPackageFromWorld(fixture());
    pkg.world.interactables[0]!.locationId = 'missing_place';

    expect(validateStoryPackage(pkg)).toEqual([
      {
        path: `world.interactables.${pkg.world.interactables[0]!.id}.locationId`,
        message: 'Interactable location must exist in the package world.',
      },
    ]);
  });

  test('validation catches importer-scale reference issues', () => {
    const pkg = storyPackageFromWorld(fixture());
    pkg.world.locations.push({ ...pkg.world.locations[0]!, name: 'Duplicate Square' });
    pkg.world.exits.push({ from: 'square', to: 'missing_exit', bidirectional: true });
    pkg.world.items[0]!.holderId = 'missing_actor';
    pkg.world.interactables[0]!.relatedQuestId = 'missing_quest';
    pkg.world.tensions[0]!.involvedIds = ['missing_reference'];
    pkg.world.villainPlans[0]!.actorId = 'missing_actor';

    expect(validateStoryPackage(pkg)).toEqual(
      expect.arrayContaining([
        {
          path: `world.locations.${pkg.world.locations[0]!.id}`,
          message: `Duplicate id "${pkg.world.locations[0]!.id}" is not allowed.`,
        },
        {
          path: 'world.exits.square->missing_exit.to',
          message: 'Exit target location must exist in the package world.',
        },
        {
          path: `world.items.${pkg.world.items[0]!.id}.holderId`,
          message: 'Item holder must be player or an NPC in the package world.',
        },
        {
          path: `world.interactables.${pkg.world.interactables[0]!.id}.relatedQuestId`,
          message: 'Interactable related quest must exist in the package quest list.',
        },
        {
          path: `world.tensions.${pkg.world.tensions[0]!.id}.involvedIds`,
          message: `Tension involved id "missing_reference" must reference a known NPC, item, location, or player.`,
        },
        {
          path: `world.villainPlans.${pkg.world.villainPlans[0]!.id}.actorId`,
          message: 'Villain plan actor must exist in the package NPC list.',
        },
      ])
    );
  });
});
