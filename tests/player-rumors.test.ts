import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it } from "vitest";

import { authorBeat } from "../src/author.ts";
import { clearDialogueHistories, type DialogueCompleter, generateDialogueReply } from "../src/dialogue.ts";
import { recordPlayerWitnessed, tagBestedThePlayer } from "../src/player-rumors.ts";
import { propagateInformation } from "../src/rumors.ts";
import { applyAction } from "../src/simulation.ts";
import type { World } from "../src/types.ts";

function loadVillage(): World {
  return JSON.parse(readFileSync(new URL("../worlds/village.json", import.meta.url), "utf8")) as World;
}

function loadOpm(): World {
  return JSON.parse(readFileSync(new URL("../worlds/one-punch-man.json", import.meta.url), "utf8")) as World;
}

beforeEach(() => clearDialogueHistories());

describe("rumors about the player", () => {
  it("recordPlayerWitnessed stamps player-subject memories on co-located NPCs", () => {
    const world = loadVillage();
    const mira = world.npcs.find((npc) => npc.id === "mira")!;
    const tomas = world.npcs.find((npc) => npc.id === "tomas")!;

    // player is at square; place both NPCs there as witnesses
    world.player.locationId = "square";
    mira.locationId = "square";
    tomas.locationId = "square";

    const deed = "The visitor defeated the bandit in open combat.";
    const chronicleId = recordPlayerWitnessed(world, {
      deed,
      importance: 7,
      actorId: "player",
      targetId: "bandit_npc",
    });

    // both co-located NPCs should have the player-subject memory
    const miraMem = mira.memories.find((m) => m.text === deed);
    const tomasMem = tomas.memories.find((m) => m.text === deed);

    expect(miraMem).toBeDefined();
    expect(miraMem?.meta?.subject).toBe("player");
    expect(miraMem?.meta?.visibility).toBe("shared");
    expect(miraMem?.meta?.importance).toBe(7);
    expect(miraMem?.meta?.tags).toContain("rumor");
    expect(miraMem?.meta?.chronicleId).toBe(chronicleId);

    expect(tomasMem).toBeDefined();
    expect(tomasMem?.meta?.subject).toBe("player");

    // chronicle event was recorded as playerCaused
    const chronicle = world.chronicle ?? [];
    const event = chronicle.find((e) => e.id === chronicleId);
    expect(event).toBeDefined();
    expect(event?.kind).toBe("player_witnessed");
    expect(event?.playerCaused).toBe(true);
  });

  it("player-subject memories diffuse through the rumor pipeline", () => {
    const world = loadVillage();
    const mira = world.npcs.find((npc) => npc.id === "mira")!;
    const tomas = world.npcs.find((npc) => npc.id === "tomas")!;
    const lena = world.npcs.find((npc) => npc.id === "lena")!;

    // mira witnesses the player deed at bridge; tomas and lena are elsewhere
    world.player.locationId = "bridge";
    mira.locationId = "bridge";
    tomas.locationId = "square";
    lena.locationId = "square"; // co-located with tomas so gossip can spread to her

    // remove other NPCs from bridge to avoid noise
    for (const npc of world.npcs) {
      if (npc.id !== "mira") npc.locationId = "square";
    }

    recordPlayerWitnessed(world, {
      deed: "The visitor defeated the bandit in open combat.",
      importance: 7,
    });

    // move mira to square so she gossips with tomas
    mira.locationId = "square";

    const events = propagateInformation(world);
    expect(events.some((e) => e.kind === "gossip_spread")).toBe(true);

    // the gossip copy should also carry subject=player transitively (it won't have
    // subject set — that's on the original; but it should appear in tomas's memories)
    const tomasMem = tomas.memories.find((m) => m.text.includes("bandit in open combat"));
    expect(tomasMem).toBeDefined();
    expect(tomasMem?.meta?.visibility).toBe("shared");
  });

  it("dialogue RUMORS ABOUT YOU block appears when NPC has player-subject memories", async () => {
    const world = loadVillage();
    const tomas = world.npcs.find((npc) => npc.id === "tomas")!;
    world.player.locationId = tomas.locationId;

    // inject a player-subject memory onto tomas (simulating diffused rumor)
    tomas.memories.push({
      tick: world.tick,
      text: "I heard the outsider bested the road bandit single-handedly.",
      meta: { importance: 7, visibility: "shared", subject: "player", tags: ["rumor", "player"] },
    });

    // capture the system prompt via the completer
    let capturedSystem = "";
    const capturingCompleter: DialogueCompleter = (req) => {
      capturedSystem = req.system;
      return Promise.resolve({
        text: 'Hello there.\n@@{"action":null,"disposition":0}',
        raw: "",
        meta: { tier: req.tier, model: "test", latencyMs: 1, error: null, jsonOk: false },
      });
    };

    const result = await generateDialogueReply(world, tomas.id, "Hello.", { complete: capturingCompleter });
    expect(result.ok).toBe(true);
    expect(capturedSystem).toContain("RUMORS ABOUT YOU");
    expect(capturedSystem).toContain("bested the road bandit");
  });

  it("player defeat: victor gains bested_the_player memory and defeat_promotion chronicle", () => {
    const world = loadVillage();
    const mira = world.npcs.find((npc) => npc.id === "mira")!;
    world.player.locationId = mira.locationId;

    // give mira combat state
    mira.combat = { hp: 100, maxHp: 100, posture: 100, defeated: false };

    // simulate via tagBestedThePlayer directly (unit-level test)
    const seedChronicleId = "ch_test_combat_0";
    world.chronicle = [
      {
        id: seedChronicleId,
        tick: world.tick,
        day: world.clock.day,
        hour: Math.floor(world.clock.hour),
        kind: "player_witnessed",
        text: "Mira fought the player.",
        actorId: mira.id,
        targetId: "player",
        causeIds: [],
        playerCaused: true,
      },
    ];

    tagBestedThePlayer(world, mira.id, seedChronicleId);

    const bestedMem = mira.memories.find((m) => m.meta?.tags?.includes("bested_the_player"));
    expect(bestedMem).toBeDefined();
    expect(bestedMem?.meta?.subject).toBe("player");
    expect(bestedMem?.meta?.importance).toBe(10);
    expect(bestedMem?.meta?.visibility).toBe("shared");

    const chronicle = world.chronicle ?? [];
    const promotionEvent = chronicle.find((e) => e.kind === "defeat_promotion");
    expect(promotionEvent).toBeDefined();
    expect(promotionEvent?.playerCaused).toBe(true);
    expect(promotionEvent?.causeIds).toContain(seedChronicleId);
  });

  it("bested_the_player rumor diffuses to other NPCs", () => {
    const world = loadVillage();
    const mira = world.npcs.find((npc) => npc.id === "mira")!;
    const tomas = world.npcs.find((npc) => npc.id === "tomas")!;

    world.player.locationId = "bridge";
    mira.locationId = "bridge";
    tomas.locationId = "bridge";

    tagBestedThePlayer(world, mira.id);

    // tomas should be at bridge — run diffusion
    const events = propagateInformation(world);
    expect(events.some((e) => e.kind === "gossip_spread")).toBe(true);
    const tomasMem = tomas.memories.find((m) => m.text.toLowerCase().includes("bested"));
    expect(tomasMem).toBeDefined();
  });

  it("author director receives rising-figure hint when bested_the_player NPC exists", async () => {
    const world = loadVillage();
    const mira = world.npcs.find((npc) => npc.id === "mira")!;

    // give mira a bested_the_player memory
    mira.memories.push({
      tick: world.tick,
      text: "I bested the outsider in combat.",
      meta: { importance: 10, visibility: "shared", subject: "player", tags: ["bested_the_player", "rumor", "player"] },
    });

    let capturedUser = "";
    const capturing: typeof authorBeat extends (w: World, c: infer C) => unknown ? C : never = async (req) => {
      capturedUser = req.user;
      return { skipped: true as const, reason: "test" };
    };
    await authorBeat(world, capturing);
    expect(capturedUser).toContain("Rising figure");
    expect(capturedUser).toContain("Mira");
  });

  it("player victory: enemy defeat becomes player-subject rumor but no promotion", () => {
    const world = loadOpm();
    const challenger = world.npcs.find((npc) => npc.factionId === "challengers")!;
    if (!challenger) return; // skip if world structure changes

    world.player.locationId = challenger.locationId;
    // force challenger to defeated state
    challenger.combat = { hp: 0, maxHp: 100, posture: 0, defeated: true };

    // call resolveFightConsequences-equivalent via applyAction fight
    // We test at the simulation level: apply a fight action that defeats an NPC
    const targetNpc = world.npcs.find((npc) => !npc.combat?.defeated && npc.id !== world.player.characterId);
    if (!targetNpc) return;
    world.player.locationId = targetNpc.locationId;
    // set target low health
    targetNpc.combat = { hp: 1, maxHp: 100, posture: 100, defeated: false };

    applyAction(world, { type: "fight", actorId: "player", targetId: targetNpc.id, moveId: "clean_finisher" });

    // target should be defeated and a player_witnessed chronicle event should exist
    expect(targetNpc.combat?.defeated).toBe(true);
    const chronicle = world.chronicle ?? [];
    const witnessed = chronicle.filter((e) => e.kind === "player_witnessed");
    expect(witnessed.length).toBeGreaterThan(0);
    // no defeat_promotion should appear since the player WON
    const promotion = chronicle.find((e) => e.kind === "defeat_promotion");
    expect(promotion).toBeUndefined();
  });

  it("player defeat via fight action: victor tagged and defeat_promotion recorded", () => {
    const world = loadOpm();
    // find an NPC to fight
    const attacker = world.npcs.find((npc) => !npc.combat?.defeated)!;
    world.player.locationId = attacker.locationId;
    // set player to near-zero health
    world.player.combat = { hp: 1, maxHp: 120, posture: 100, defeated: false };

    applyAction(world, { type: "fight", actorId: attacker.id, targetId: "player", moveId: "clean_finisher" });

    expect(world.player.combat?.defeated).toBe(true);
    const chronicle = world.chronicle ?? [];
    const promotion = chronicle.find((e) => e.kind === "defeat_promotion");
    expect(promotion).toBeDefined();
    expect(promotion?.playerCaused).toBe(true);
    expect(promotion?.actorId).toBe(attacker.id);

    const bestedMem = attacker.memories.find((m) => m.meta?.tags?.includes("bested_the_player"));
    expect(bestedMem).toBeDefined();
    expect(bestedMem?.meta?.subject).toBe("player");
  });

  it("chronicle ancestry: player_witnessed → gossip all playerCaused", () => {
    const world = loadVillage();
    const mira = world.npcs.find((entry) => entry.id === "mira")!;
    const tomas = world.npcs.find((entry) => entry.id === "tomas")!;

    // isolate mira and tomas at bridge so diffusion is deterministic
    world.player.locationId = "bridge";
    for (const npc of world.npcs) npc.locationId = "other";
    mira.locationId = "bridge";
    tomas.locationId = "bridge";

    // record player deed with mira as the only witness (tomas excluded as co-located non-target)
    // Actually both mira and tomas are at bridge, so both witness it
    const witnessedId = recordPlayerWitnessed(world, {
      deed: "The outsider defeated the patrol chief in open combat.",
      importance: 7,
    });

    // player_witnessed event exists and is playerCaused
    const chronicle = world.chronicle ?? [];
    const witnessedEvent = chronicle.find((e) => e.id === witnessedId);
    expect(witnessedEvent).toBeDefined();
    expect(witnessedEvent?.playerCaused).toBe(true);
    expect(witnessedEvent?.kind).toBe("player_witnessed");

    // both witnesses have the player-subject memory
    expect(mira.memories.some((m) => m.text.includes("patrol chief") && m.meta?.subject === "player")).toBe(true);
    expect(tomas.memories.some((m) => m.text.includes("patrol chief") && m.meta?.subject === "player")).toBe(true);

    // run diffusion: move tomas elsewhere so mira gossips to someone else
    // reset: only mira at bridge has the memory (simulating first-witness)
    // clear tomas memory and move him away so mira can gossip to a third party
    tomas.locationId = "other";
    const orrin = world.npcs.find((e) => e.id === "orrin")!;
    orrin.locationId = "bridge";

    const gossipEvents = propagateInformation(world);
    expect(gossipEvents.some((e) => e.kind === "gossip_spread")).toBe(true);

    // a gossip chronicle event should exist that points back to witnessedId
    const freshChronicle = world.chronicle ?? [];
    const gossip = freshChronicle.filter((e) => e.kind === "gossip");
    const linkedGossip = gossip.find((e) => e.causeIds.includes(witnessedId));
    expect(linkedGossip).toBeDefined();
    expect(linkedGossip?.playerCaused).toBe(true);
  });
});
