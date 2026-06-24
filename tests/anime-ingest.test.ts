import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import {
  type AnimeIngestSource,
  animeSourceToWorld,
  validateAnimeIngestSource,
} from '../src/anime-ingest.ts';
import { activeObjectives } from '../src/objectives.ts';
import { createEngine } from '../src/simulation.ts';
import {
  storyPackageFromWorld,
  validateStoryPackage,
  worldFromStoryPackage,
} from '../src/story-package.ts';

const source = (): AnimeIngestSource =>
  JSON.parse(
    readFileSync(new URL('../fixtures/anime/opm-ingest-source.json', import.meta.url), 'utf8')
  ) as AnimeIngestSource;

describe('anime ingest compiler', () => {
  test('turns a reviewed anime bible into a playable world', () => {
    const world = animeSourceToWorld(source());
    const engine = createEngine(world, { propose: async () => [] });

    expect(engine.state.id).toBe('opm_ingested_z_city');
    expect(engine.state.name).toBe('One Punch Man Playable Slice');
    expect(engine.state.locations.map((location) => location.id)).toEqual([
      'square',
      'forge',
      'garden',
      'inn',
      'bridge',
      'wood',
    ]);
    expect(engine.state.npcs.map((npc) => npc.name)).toEqual([
      'Saitama',
      'Genos',
      'Mumen Rider',
      'Tatsumaki',
      "Speed-o'-Sound Sonic",
    ]);
    expect(engine.state.npcs.find((npc) => npc.id === 'pax')?.secrets?.[0]?.text).toContain(
      'challenge marks'
    );
    expect(engine.state.items.find((item) => item.id === 'shears')?.name).toBe('Grocery coupon');
    expect(engine.state.npcs.find((npc) => npc.id === 'mira')?.appearance?.portrait).toBe(
      '/assets/characters/opm_test/saitama.svg'
    );
    expect(activeObjectives(engine.state)[0]?.questTitle).toBe(
      'Recover Grocery coupon for Saitama'
    );
  });

  test('produces a valid story package that can be imported back', () => {
    const world = animeSourceToWorld(source());
    const pkg = storyPackageFromWorld(world);

    expect(validateStoryPackage(pkg)).toEqual([]);
    expect(worldFromStoryPackage(pkg)).toMatchObject({
      id: 'opm_ingested_z_city',
      player: { locationId: 'square' },
      storyProgress: { phase: 'starter' },
    });
  });

  test('rejects under-specified anime source drafts', () => {
    const draft = source();
    draft.characters = draft.characters.slice(0, 2);
    draft.locations = draft.locations.slice(0, 2);

    expect(validateAnimeIngestSource(draft)).toEqual(
      expect.arrayContaining([
        {
          path: 'locations',
          message: 'At least three locations are required for a playable slice.',
        },
        {
          path: 'characters',
          message: 'At least three characters are required for starter quests.',
        },
      ])
    );
    expect(() => animeSourceToWorld(draft)).toThrow(/Invalid anime ingest source/);
  });
});
