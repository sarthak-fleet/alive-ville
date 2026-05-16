import type { Action, Quest, World } from "./types.ts";

export interface QuestHint {
  id: string;
  text: string;
  source: "task" | "dialogue" | "item" | "memory" | "director" | "location";
}

export function questHintsFor(world: World, quest: Quest): QuestHint[] {
  const facts = learnedFacts(world);
  const hints: QuestHint[] = [];

  if (quest.status === "done") {
    return [{ id: `${quest.id}:done`, source: "task", text: "Resolved. The village will remember how this ended." }];
  }
  if (quest.status === "failed") {
    return [{ id: `${quest.id}:failed`, source: "task", text: "Failed. The relationship damage is now part of the village state." }];
  }
  if (quest.status !== "active") return hints;

  if (quest.id === "return_shears") {
    hints.push({ id: "return_shears:lead", source: "dialogue", text: "Mira's missing tool trail starts with Tomas and the forge." });
    if (facts.visited.has("forge") || facts.heard.has("forge")) {
      hints.push({ id: "return_shears:forge", source: "location", text: "The Old Forge is a confirmed place to search." });
    }
    if (facts.held.has("shears")) {
      hints.push({ id: "return_shears:return", source: "item", text: "You have the pruning shears. Bring them back to Mira in the Herb Garden." });
    }
  }

  if (quest.id === "rekindle_forge") {
    hints.push({ id: "rekindle_forge:need", source: "dialogue", text: "Tomas needs dry bellows leather before the forge flame can restart." });
    if (facts.visited.has("wood") || facts.heard.has("wood")) {
      hints.push({ id: "rekindle_forge:wood", source: "location", text: "Hollow Wood is connected to the dry leather lead." });
    }
    if (facts.held.has("bellows_leather")) {
      hints.push({ id: "rekindle_forge:return", source: "item", text: "You have the dry bellows leather. Take it to Tomas at the forge." });
    }
  }

  if (quest.id === "bridge_whisper") {
    hints.push({ id: "bridge_whisper:proof", source: "dialogue", text: "Lena needs proof before she can act against the bridge danger." });
    if (facts.visited.has("bridge") || facts.heard.has("bridge")) {
      hints.push({ id: "bridge_whisper:bridge", source: "location", text: "The Old Bridge is now a confirmed clue site." });
    }
    if (facts.held.has("rumor_note") || facts.held.has("blue_ember")) {
      hints.push({ id: "bridge_whisper:return", source: "item", text: "You found proof. Bring it to Lena at the Lantern Inn." });
    }
    if (facts.directorReveals.some((text) => /metal|blue|bridge/i.test(text))) {
      hints.push({ id: "bridge_whisper:director", source: "director", text: "A recent clue links the bridge whisper to missing metal." });
    }
  }

  return dedupeHints(hints);
}

function learnedFacts(world: World) {
  const visited = new Set<string>([world.player.locationId]);
  const held = new Set(world.items.filter((item) => item.holderId === "player").map((item) => item.id));
  const heard = new Set<string>();
  const directorReveals: string[] = [];

  for (const entry of world.eventLog) {
    for (const item of entry.actions) {
      collectFromAction(item.action, visited, held, heard);
      collectTerms(item.text, heard);
      if (item.fromDirector || item.text.includes("Director clue:")) directorReveals.push(item.text);
    }
  }

  for (const item of world.items) {
    if (item.holderId === "player") collectTerms(`${item.name} ${item.description ?? ""}`, heard);
  }

  return { visited, held, heard, directorReveals };
}

function collectFromAction(action: Action, visited: Set<string>, held: Set<string>, heard: Set<string>): void {
  if (action.actorId !== "player") {
    if ("text" in action) collectTerms(action.text, heard);
    return;
  }
  if (action.type === "move") visited.add(action.locationId);
  if (action.type === "pickup") held.add(action.itemId);
  if ("text" in action) collectTerms(action.text, heard);
}

function collectTerms(text: string, heard: Set<string>): void {
  const lower = text.toLowerCase();
  for (const term of ["bridge", "forge", "garden", "inn", "wood", "shears", "leather", "ember", "metal"]) {
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
