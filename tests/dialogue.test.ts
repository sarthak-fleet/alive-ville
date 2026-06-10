import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it } from "vitest";

import { clearDialogueHistories, type DialogueCompleter, generateDialogueReply } from "../src/dialogue.ts";
import type { World } from "../src/types.ts";

function loadWorld(): World {
  return JSON.parse(readFileSync(new URL("../worlds/one-punch-man.json", import.meta.url), "utf8")) as World;
}

function completerReturning(text: string): { calls: Array<{ system: string; user: string }>; complete: DialogueCompleter } {
  const calls: Array<{ system: string; user: string }> = [];
  return {
    calls,
    complete: (req) => {
      calls.push({ system: req.system, user: req.user });
      return Promise.resolve({ text, raw: text, meta: { tier: req.tier, model: "test", latencyMs: 1, error: null, jsonOk: false } });
    },
  };
}

beforeEach(() => clearDialogueHistories());

describe("LLM dialogue", () => {
  it("returns an in-character reply and records both turns as memories", async () => {
    const world = loadWorld();
    const npc = world.npcs.find((entry) => entry.locationId === world.player.locationId)!;
    const before = npc.memories.length;
    const { complete } = completerReturning("Stay sharp out there.");

    const result = await generateDialogueReply(world, npc.id, "Anything dangerous nearby?", complete);
    expect(result).toEqual({ ok: true, reply: "Stay sharp out there." });
    expect(npc.memories.length).toBe(before + 2);
    expect(npc.memories.at(-2)!.text).toContain("Anything dangerous nearby?");
    expect(npc.memories.at(-1)!.text).toContain("Stay sharp out there.");
  });

  it("threads conversation history into subsequent prompts", async () => {
    const world = loadWorld();
    const npc = world.npcs.find((entry) => entry.locationId === world.player.locationId)!;
    const { calls, complete } = completerReturning("As I said, the plaza is safe.");

    await generateDialogueReply(world, npc.id, "Is the plaza safe?", complete);
    await generateDialogueReply(world, npc.id, "Are you sure?", complete);

    expect(calls).toHaveLength(2);
    expect(calls[1]!.user).toContain("Is the plaza safe?");
    expect(calls[1]!.user).toContain("Conversation so far:");
  });

  it("grounds the prompt in the world, not a hardcoded setting", async () => {
    const world = loadWorld();
    const npc = world.npcs.find((entry) => entry.locationId === world.player.locationId)!;
    const { calls, complete } = completerReturning("Hello.");
    await generateDialogueReply(world, npc.id, "Hi", complete);
    expect(calls[0]!.system).toContain(world.story?.title ?? world.name);
    expect(calls[0]!.system).not.toContain("Ashment");
  });

  it("strips name prefixes and quotes from the model reply", async () => {
    const world = loadWorld();
    const npc = world.npcs.find((entry) => entry.locationId === world.player.locationId)!;
    const { complete } = completerReturning(`${npc.name}: "Keep your voice down."`);
    const result = await generateDialogueReply(world, npc.id, "Psst", complete);
    expect(result).toEqual({ ok: true, reply: "Keep your voice down." });
  });

  it("refuses when the NPC is elsewhere or defeated", async () => {
    const world = loadWorld();
    const elsewhere = world.npcs.find((entry) => entry.locationId !== world.player.locationId)!;
    const { complete } = completerReturning("Should not be called");
    expect(await generateDialogueReply(world, elsewhere.id, "Hello?", complete)).toEqual({ ok: false, reason: "npc_not_here" });

    const here = world.npcs.find((entry) => entry.locationId === world.player.locationId)!;
    here.combat = { hp: 0, maxHp: 100, posture: 0, defeated: true };
    expect(await generateDialogueReply(world, here.id, "Hello?", complete)).toEqual({ ok: false, reason: "npc_defeated" });
  });

  it("propagates completer errors as failures without writing memories", async () => {
    const world = loadWorld();
    const npc = world.npcs.find((entry) => entry.locationId === world.player.locationId)!;
    const before = npc.memories.length;
    const failing: DialogueCompleter = () =>
      Promise.resolve({ error: "timeout", meta: { tier: "normal", model: "test", latencyMs: 1, error: "timeout", jsonOk: false } });
    expect(await generateDialogueReply(world, npc.id, "Hello", failing)).toEqual({ ok: false, reason: "timeout" });
    expect(npc.memories.length).toBe(before);
  });
});
