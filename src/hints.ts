import type { Action, Quest, World } from './types.ts';

export interface QuestHint {
  id: string;
  text: string;
  source: 'task' | 'dialogue' | 'item' | 'memory' | 'director' | 'location';
}

export function questHintsFor(world: World, quest: Quest): QuestHint[] {
  const facts = learnedFacts(world);
  const hints: QuestHint[] = [];

  if (quest.status === 'done') {
    return [
      {
        id: `${quest.id}:done`,
        source: 'task',
        text:
          world.id === 'opm_z_city'
            ? 'Resolved. Z-City will remember how this patrol beat ended.'
            : 'Resolved. The village will remember how this ended.',
      },
    ];
  }
  if (quest.status === 'failed') {
    return [
      {
        id: `${quest.id}:failed`,
        source: 'task',
        text:
          world.id === 'opm_z_city'
            ? 'Failed. The alert damage is now part of the Z-City state.'
            : 'Failed. The relationship damage is now part of the village state.',
      },
    ];
  }
  if (quest.status !== 'active') return hints;

  if (world.id === 'opm_z_city') return opmQuestHints(quest, facts);

  if (quest.id === 'return_shears') {
    hints.push({
      id: 'return_shears:lead',
      source: 'dialogue',
      text: "Mira's missing tool trail starts with Tomas and the forge.",
    });
    if (facts.visited.has('forge') || facts.heard.has('forge')) {
      hints.push({
        id: 'return_shears:forge',
        source: 'location',
        text: 'The Old Forge is a confirmed place to search.',
      });
    }
    if (facts.held.has('shears')) {
      hints.push({
        id: 'return_shears:return',
        source: 'item',
        text: 'You have the pruning shears. Bring them back to Mira in the Herb Garden.',
      });
    }
  }

  if (quest.id === 'rekindle_forge') {
    hints.push({
      id: 'rekindle_forge:need',
      source: 'dialogue',
      text: 'Tomas needs dry bellows leather before the forge flame can restart.',
    });
    if (facts.visited.has('wood') || facts.heard.has('wood')) {
      hints.push({
        id: 'rekindle_forge:wood',
        source: 'location',
        text: 'Hollow Wood is connected to the dry leather lead.',
      });
    }
    if (facts.held.has('bellows_leather')) {
      hints.push({
        id: 'rekindle_forge:return',
        source: 'item',
        text: 'You have the dry bellows leather. Take it to Tomas at the forge.',
      });
    }
  }

  if (quest.id === 'bridge_whisper') {
    hints.push({
      id: 'bridge_whisper:proof',
      source: 'dialogue',
      text: 'Lena needs proof before she can act against the bridge danger.',
    });
    if (facts.visited.has('bridge') || facts.heard.has('bridge')) {
      hints.push({
        id: 'bridge_whisper:bridge',
        source: 'location',
        text: 'The Old Bridge is now a confirmed clue site.',
      });
    }
    if (facts.held.has('rumor_note') || facts.held.has('blue_ember')) {
      hints.push({
        id: 'bridge_whisper:return',
        source: 'item',
        text: 'You found proof. Bring it to Lena at the Lantern Inn.',
      });
    }
    if (facts.directorReveals.some((text) => /metal|blue|bridge/i.test(text))) {
      hints.push({
        id: 'bridge_whisper:director',
        source: 'director',
        text: 'A recent clue links the bridge whisper to missing metal.',
      });
    }
  }

  return dedupeHints(hints);
}

function opmQuestHints(quest: Quest, facts: ReturnType<typeof learnedFacts>): QuestHint[] {
  const hints: QuestHint[] = [];

  if (quest.id === 'return_shears') {
    hints.push({
      id: 'return_shears:opm-lead',
      source: 'dialogue',
      text: 'Start at the Training Lot. Saitama lost the grocery coupon there after morning exercise.',
    });
    if (facts.visited.has('forge') || facts.heard.has('training')) {
      hints.push({
        id: 'return_shears:opm-training',
        source: 'location',
        text: 'You reached the Training Lot. Look for the Grocery coupon marker near the exercise area.',
      });
    }
    if (facts.held.has('shears')) {
      hints.push({
        id: 'return_shears:opm-return',
        source: 'item',
        text: 'You have the Grocery coupon. Bring it back to Saitama at the Apartment Block.',
      });
    }
  }

  if (quest.id === 'rekindle_forge') {
    hints.push({
      id: 'rekindle_forge:opm-need',
      source: 'dialogue',
      text: 'Genos needs the Spare cyborg core from Monster Alley before the next patrol fight.',
    });
    if (facts.visited.has('wood') || facts.heard.has('monster')) {
      hints.push({
        id: 'rekindle_forge:opm-alley',
        source: 'location',
        text: 'Monster Alley is the recovery site. Search the alley interior for the Spare cyborg core marker.',
      });
    }
    if (facts.held.has('bellows_leather')) {
      hints.push({
        id: 'rekindle_forge:opm-return',
        source: 'item',
        text: 'You have the Spare cyborg core. Return it to Genos at the Training Lot.',
      });
    }
  }

  if (quest.id === 'bridge_whisper') {
    hints.push({
      id: 'bridge_whisper:opm-proof',
      source: 'dialogue',
      text: 'Mumen Rider needs proof before filing the overpass alert. Go to the Ruined Overpass.',
    });
    if (facts.visited.has('bridge') || facts.heard.has('overpass')) {
      hints.push({
        id: 'bridge_whisper:opm-overpass',
        source: 'location',
        text: 'Search the Ruined Overpass for a Monster scale or Challenge note.',
      });
    }
    if (facts.held.has('rumor_note') || facts.held.has('blue_ember')) {
      hints.push({
        id: 'bridge_whisper:opm-return',
        source: 'item',
        text: 'You found proof. Bring it to Mumen Rider at the Hero Association Kiosk.',
      });
    }
    if (facts.directorReveals.some((text) => /sonic|challenge|overpass|monster/i.test(text))) {
      hints.push({
        id: 'bridge_whisper:opm-director',
        source: 'director',
        text: "The alert is tied to Sonic's challenge marks near the overpass.",
      });
    }
  }

  return dedupeHints(hints);
}

function learnedFacts(world: World) {
  const visited = new Set<string>([world.player.locationId]);
  const held = new Set(
    world.items.filter((item) => item.holderId === 'player').map((item) => item.id)
  );
  const heard = new Set<string>();
  const directorReveals: string[] = [];

  for (const entry of world.eventLog) {
    for (const item of entry.actions) {
      collectFromAction(item.action, visited, held, heard);
      collectTerms(item.text, heard);
      if (item.fromDirector || item.text.includes('Director clue:'))
        directorReveals.push(item.text);
    }
  }

  for (const item of world.items) {
    if (item.holderId === 'player') collectTerms(`${item.name} ${item.description ?? ''}`, heard);
  }

  return { visited, held, heard, directorReveals };
}

function collectFromAction(
  action: Action,
  visited: Set<string>,
  held: Set<string>,
  heard: Set<string>
): void {
  if (action.actorId !== 'player') {
    if ('text' in action && typeof action.text === 'string') collectTerms(action.text, heard);
    return;
  }
  if (action.type === 'move') visited.add(action.locationId);
  if (action.type === 'pickup') held.add(action.itemId);
  if ('text' in action && typeof action.text === 'string') collectTerms(action.text, heard);
}

function collectTerms(text: string, heard: Set<string>): void {
  const lower = text.toLowerCase();
  for (const term of [
    'bridge',
    'forge',
    'garden',
    'inn',
    'wood',
    'shears',
    'leather',
    'ember',
    'metal',
    'training',
    'coupon',
    'monster',
    'alley',
    'overpass',
    'scale',
    'core',
    'kiosk',
    'sonic',
    'challenge',
  ]) {
    if (lower.includes(term)) heard.add(term);
  }
}

function dedupeHints(hints: QuestHint[]): QuestHint[] {
  const seen = new Set<string>();
  return hints.filter((hint) => {
    if (seen.has(hint.id)) return false;
    seen.add(hint.id);
    return true;
  });
}
