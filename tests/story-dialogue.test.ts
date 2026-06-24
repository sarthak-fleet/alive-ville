import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { storyDialogueOptions, storyDialogueRespond } from '../src/story-dialogue.ts';
import type { World } from '../src/types.ts';

function loadWorld(): World {
  return JSON.parse(
    readFileSync(new URL('../worlds/village.json', import.meta.url), 'utf8')
  ) as World;
}

describe('story mode dialogue', () => {
  it('offers news, trouble, quest accept and goodbye', () => {
    const world = loadWorld();
    const options = storyDialogueOptions(world, 'mira')!;
    const ids = options.map((option) => option.id);
    expect(ids).toContain('news');
    expect(ids).toContain('trouble');
    expect(ids.some((id) => id.startsWith('accept:'))).toBe(true);
    expect(ids).toContain('bye');
  });

  it("news surfaces the NPC's freshest rumor — the living sim feeds the script", () => {
    const world = loadWorld();
    const mira = world.npcs.find((npc) => npc.id === 'mira')!;
    mira.memories.push({
      tick: world.tick,
      text: 'Tomas told me: someone pried open the forge shutters in the night.',
      meta: { importance: 5, visibility: 'shared' },
    });
    const reply = storyDialogueRespond(world, 'mira', 'news')!;
    expect(reply.reply).toContain('forge shutters');
  });

  it('accepting and completing quests goes through the real engine', () => {
    const world = loadWorld();
    const accepted = storyDialogueRespond(world, 'mira', 'accept:return_shears')!;
    expect(accepted.action?.type).toBe('accept_quest');
    expect(world.quests!.find((quest) => quest.id === 'return_shears')!.status).toBe('active');
    // not done yet: completion is objective-gated, so the option is absent
    const optionIds = storyDialogueOptions(world, 'mira')!.map((option) => option.id);
    expect(optionIds).not.toContain('complete:return_shears');
    // deliver the shears, option appears, completion works
    world.items.find((item) => item.id === 'shears')!.holderId = 'player';
    expect(storyDialogueOptions(world, 'mira')!.map((option) => option.id)).toContain(
      'complete:return_shears'
    );
    const completed = storyDialogueRespond(world, 'mira', 'complete:return_shears')!;
    expect(completed.action?.type).toBe('complete_quest');
    expect(world.quests!.find((quest) => quest.id === 'return_shears')!.status).toBe('done');
  });

  it('follow choice sets followingPlayer on the NPC', () => {
    const world = loadWorld();
    const mira = world.npcs.find((npc) => npc.id === 'mira')!;
    // follow option only appears when relationship score >= 2
    mira.relationships = { ...mira.relationships, player: 2 };
    const options = storyDialogueOptions(world, 'mira')!;
    expect(options.some((option) => option.id === 'follow')).toBe(true);
    const reply = storyDialogueRespond(world, 'mira', 'follow')!;
    expect(reply.action?.type).toBe('follow');
    expect(mira.followingPlayer).toBe(true);
  });

  it('lead options move the NPC for real', () => {
    const world = loadWorld();
    const options = storyDialogueOptions(world, 'mira')!;
    const lead = options.find((option) => option.id.startsWith('lead:'))!;
    const target = lead.id.slice('lead:'.length);
    const reply = storyDialogueRespond(world, 'mira', lead.id)!;
    expect(reply.action?.type).toBe('lead');
    expect(world.npcs.find((npc) => npc.id === 'mira')!.locationId).toBe(target);
  });
});
