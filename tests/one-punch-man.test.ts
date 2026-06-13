import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { combatMovesFor } from "../src/combat.ts";
import { activeObjectives } from "../src/objectives.ts";
import { applyAction, createEngine } from "../src/simulation.ts";
import { storyPackageFromWorld, validateStoryPackage } from "../src/story-package.ts";
import { syncStoryProgress } from "../src/story-progress.ts";
import type { World } from "../src/types.ts";

const fixture = (): World => JSON.parse(readFileSync(new URL("../worlds/one-punch-man.json", import.meta.url), "utf8")) as World;

describe("One Punch Man local test world", () => {
  test("loads through the shared engine and story package shape", () => {
    const world = fixture();
    const engine = createEngine(world, { propose: async () => [] });

    expect(engine.state.id).toBe("opm_z_city");
    expect(engine.state.name).toBe("Z-City Patrol");
    expect(activeObjectives(engine.state)[0]?.questTitle).toBe("Recover Saitama's grocery coupon");
    expect(engine.state.npcs.map((npc) => npc.appearance?.portrait).filter(Boolean)).toHaveLength(5);
    expect(validateStoryPackage(storyPackageFromWorld(engine.state))).toEqual([]);
  });

  test("keeps a compact six-move base combat kit for the local OPM slice", () => {
    const moves = combatMovesFor("opm_z_city");

    expect(moves.map((move) => move.label)).toEqual([
      "Normal Punch",
      "Consecutive Normal Punches",
      "Serious Side Step",
      "Guard Break",
      "Justice Crash",
      "Clean Finisher",
    ]);
    expect(moves.every((move) => move.damage > 0 && move.postureDamage > 0)).toBe(true);
  });

  test("starts the OPM route as Tatsumaki with psychic combat without changing balance", () => {
    const world = fixture();

    expect(world.player).toMatchObject({ characterId: "orrin", name: "Tatsumaki", locationId: "square" });
    const moves = combatMovesFor(world);

    expect(moves.map((move) => move.label)).toEqual([
      "Psychic Jab",
      "Telekinetic Barrage",
      "Vector Shift",
      "Gravity Crush",
      "Psychic Maelstrom",
      "Psychic Seal",
    ]);
    expect(moves.map((move) => [move.id, move.damage, move.postureDamage])).toEqual([
      ["normal_punch", 30, 18],
      ["consecutive_normal_punches", 42, 24],
      ["serious_side_step", 18, 32],
      ["guard_break", 34, 34],
      ["justice_crash", 36, 26],
      ["clean_finisher", 120, 100],
    ]);
  });

  test("lets the player choose an existing character avatar", () => {
    const world = fixture();
    const result = applyAction(world, { type: "choose_character", actorId: "player", targetId: "tomas" });

    expect(result.applied).toBe(true);
    expect(world.player.characterId).toBe("tomas");
    expect(world.player.name).toBe("Genos");
    expect(world.player.locationId).toBe("square");
    expect(world.player.appearance?.sourceLook).toContain("Genos");
    expect(world.npcs.find((npc) => npc.id === "tomas")?.locationId).toBe("square");
  });

  test("lets the player return to the Wanderer from a selected avatar", () => {
    const world = fixture();
    applyAction(world, { type: "choose_character", actorId: "player", targetId: "tomas" });

    const result = applyAction(world, { type: "choose_character", actorId: "player" });
    expect(result.applied).toBe(true);
    expect(world.player.characterId).toBeUndefined();
    expect(world.player.name).toBe("Wanderer");
    expect(world.player.appearance).toBeUndefined();
  });

  test("keeps selected avatar location synchronized with player movement", () => {
    const world = fixture();
    applyAction(world, { type: "choose_character", actorId: "player", targetId: "orrin" });

    const firstMove = applyAction(world, { type: "move", actorId: "player", locationId: "inn" });
    expect(firstMove.applied).toBe(true);
    expect(world.player.locationId).toBe("inn");
    expect(world.npcs.find((npc) => npc.id === "orrin")?.locationId).toBe("inn");

    const avatarMove = applyAction(world, { type: "move", actorId: "orrin", locationId: "square" });
    expect(avatarMove.applied).toBe(true);
    expect(world.player.locationId).toBe("square");
    expect(world.npcs.find((npc) => npc.id === "orrin")?.locationId).toBe("square");
  });

  test("uses OPM-specific nightfall objective labels after starter quests", () => {
    const world = fixture();
    for (const quest of world.quests ?? []) quest.status = "done";

    syncStoryProgress(world);

    const objective = activeObjectives(world)[0];
    expect(world.storyProgress?.phase).toBe("nightfall_warning");
    expect(objective?.questTitle).toBe("Report to Hero Association before the next monster alert");
    expect(objective?.text).toContain("Hero Association kiosk");
  });

  test("tracks Sonic combat state before resolving the OPM confrontation", () => {
    const world = fixture();
    const engine = createEngine(world, { propose: async () => [] });
    expect(engine.npc("pax")?.combat).toMatchObject({ hp: 100, maxHp: 100, defeated: false });

    for (const quest of world.quests ?? []) quest.status = "done";
    syncStoryProgress(world);
    applyAction(world, { type: "move", actorId: "player", locationId: "inn" });
    applyAction(world, { type: "move", actorId: "player", locationId: "square" });

    const confrontation = activeObjectives(world)[0];
    expect(confrontation?.questTitle).toBe("Confront the Overpass Challenger");
    expect(confrontation?.storyTargetId).toBe("pax");
    expect(confrontation?.storyAction).toBe("fight_challenger");
    expect(confrontation?.locationId).toBe("square");

    const sonic = world.npcs.find((npc) => npc.id === "pax");
    if (sonic) sonic.locationId = "wood";
    expect(activeObjectives(world)[0]).toMatchObject({
      questTitle: "Confront the Overpass Challenger",
      locationId: "wood",
      storyTargetId: "pax",
    });
    if (sonic) sonic.locationId = "square";

    const result = applyAction(world, {
      type: "fight",
      actorId: "player",
      targetId: "pax",
      moveId: "consecutive_normal_punches",
      text: confrontation!.text,
    });

    expect(result.applied).toBe(true);
    if (result.applied) expect(result.text).toContain("telekinetic barrage");
    expect(world.npcs.find((npc) => npc.id === "pax")?.combat).toMatchObject({ hp: 58, defeated: false });
    expect(world.player.combat).toMatchObject({ hp: 108, maxHp: 120, defeated: false });
    if (result.applied) expect(result.text).toContain("counters for 12");
    expect(world.storyProgress?.phase).toBe("shadow_confrontation");

    const finisher = applyAction(world, {
      type: "fight",
      actorId: "player",
      targetId: "pax",
      moveId: "clean_finisher",
      text: confrontation!.text,
    });

    expect(finisher.applied).toBe(true);
    expect(world.player.combat).toMatchObject({ hp: 108, defeated: false });
    if (finisher.applied) expect(finisher.text).not.toContain("counters for");
    expect(world.storyProgress?.phase).toBe("dawn_after_tasks");
    expect(world.tensions?.every((tension) => tension.status === "resolved")).toBe(true);
    expect(world.villainPlans?.[0]).toMatchObject({
      hidden: false,
      pressure: 8,
      nextTrigger: "Route cleared; future loops need a stronger antagonist escalation.",
    });
    expect(world.npcs.find((npc) => npc.id === "pax")?.ambitions?.every((ambition) => ambition.status === "abandoned")).toBe(true);
    expect(world.npcs.find((npc) => npc.id === "lena")?.memories.at(-1)?.text).toContain("cleared the immediate threat");
    expect(activeObjectives(world)[0]?.questTitle).toBe("Z-City alert cleared");
  });

  test("turns combat into an exchange with player recovery on wait", async () => {
    const engine = createEngine(fixture(), { propose: async () => [] });

    const fight = await engine.tick({
      type: "fight",
      targetId: "pax",
      moveId: "normal_punch",
      text: "Brace and test the challenger.",
    });

    expect(fight.actions[0]?.text).toContain("counters for 13");
    expect(engine.state.player.combat).toMatchObject({ hp: 107, posture: 78, defeated: false });

    await engine.tick();
    expect(engine.state.player.combat).toMatchObject({ hp: 115, posture: 92, defeated: false });
    await engine.tick();
    expect(engine.state.player.combat).toMatchObject({ hp: 120, posture: 100, defeated: false });
  });

  test("keeps a downed player in a defeated state until a recovery tick", async () => {
    const engine = createEngine(fixture(), { propose: async () => [] });
    engine.state.player.combat = { hp: 4, maxHp: 120, posture: 10, defeated: false };

    const downed = await engine.tick({
      type: "fight",
      targetId: "pax",
      moveId: "normal_punch",
      text: "Desperate opening hit.",
    });

    expect(downed.actions[0]?.text).toContain("dropping Tatsumaki to 0 HP");
    expect(engine.state.player.combat).toMatchObject({ hp: 0, posture: 0, defeated: true });

    await engine.tick();
    expect(engine.state.player.combat).toMatchObject({ hp: 50, posture: 45, defeated: false });
  });

  test("hostile agents wait for the player to start combat before auto-engaging", async () => {
    const engine = createEngine(fixture());

    const opening = await engine.tick();
    expect(opening.actions.some((entry) => entry.action.type === "fight")).toBe(false);

    const earlyTick = await engine.tick();
    expect(earlyTick.actions.some((entry) => entry.action.type === "fight")).toBe(false);
    expect(engine.state.player.combat?.hp ?? 120).toBe(120);

    for (const quest of engine.state.quests ?? []) quest.status = "done";
    syncStoryProgress(engine.state);
    applyAction(engine.state, { type: "move", actorId: "player", locationId: "inn" });
    applyAction(engine.state, { type: "move", actorId: "player", locationId: "square" });

    const standoff = await engine.tick();
    expect(standoff.actions.some((entry) => entry.action.type === "fight")).toBe(false);
    expect(engine.state.player.combat?.hp ?? 120).toBe(120);

    const response = await engine.tick({
      type: "fight",
      targetId: "pax",
      moveId: "normal_punch",
      text: "Answer the challenge.",
    });
    expect(response.actions.filter((entry) => entry.action.type === "fight" && entry.action.targetId === "player")).toHaveLength(0);

    const counterPressure = await engine.tick();
    const hostileFight = counterPressure.actions.find((entry) => entry.action.type === "fight");
    expect(hostileFight?.action).toMatchObject({
      type: "fight",
      actorId: "pax",
      targetId: "player",
      moveId: "serious_side_step",
    });
    expect(hostileFight?.text).toContain("Speed-o'-Sound Sonic");
    expect(hostileFight?.text).toContain("Tatsumaki has");
    expect(engine.state.player.combat?.hp).toBeLessThan(120);
    expect(engine.state.player.combat?.posture).toBeLessThan(100);
  });

  test("lets Mumen Rider assist as a witness during the Sonic fight", async () => {
    const engine = createEngine(fixture(), { propose: async () => [] });
    for (const quest of engine.state.quests ?? []) quest.status = "done";
    syncStoryProgress(engine.state);
    applyAction(engine.state, { type: "move", actorId: "player", locationId: "inn" });
    applyAction(engine.state, { type: "move", actorId: "player", locationId: "square" });

    const firstExchange = await engine.tick({
      type: "fight",
      targetId: "pax",
      moveId: "consecutive_normal_punches",
      text: "Open the overpass duel.",
    });

    const assist = firstExchange.actions.find((entry) => entry.action.type === "confront" && entry.action.actorId === "lena");
    expect(assist?.action).toMatchObject({ type: "confront", actorId: "lena", targetId: "pax" });
    expect(assist?.text).toContain("Mumen Rider");
    expect(engine.state.npcs.find((npc) => npc.id === "lena")?.memories.at(-1)?.text).toContain("Witness assist");

    const secondExchange = await engine.tick({
      type: "fight",
      targetId: "pax",
      moveId: "normal_punch",
      text: "Keep pressure on Sonic.",
    });
    expect(secondExchange.actions.filter((entry) => entry.action.type === "confront" && entry.action.actorId === "lena")).toHaveLength(0);
    expect(secondExchange.actions[0]?.text).toContain("counters for 6");
  });

  test("keeps the active fight target in place during a player attack tick", async () => {
    const engine = createEngine(fixture(), {
      propose: async () => [
        { type: "move", actorId: "pax", locationId: "wood" },
        { type: "move", actorId: "tomas", locationId: "square" },
      ],
    });

    const response = await engine.tick({
      type: "fight",
      targetId: "pax",
      moveId: "normal_punch",
      text: "Keep the challenger engaged.",
    });

    expect(response.actions.some((entry) => entry.action.type === "move" && entry.action.actorId === "pax")).toBe(false);
    expect(engine.state.npcs.find((npc) => npc.id === "pax")?.locationId).toBe("square");
    expect(response.actions.some((entry) => entry.action.type === "move" && entry.action.actorId === "tomas")).toBe(true);
  });

  test("does not let selected avatar movement pull the player out of combat", async () => {
    const engine = createEngine(fixture(), {
      propose: async () => [
        { type: "move", actorId: "orrin", locationId: "garden" },
      ],
    });
    applyAction(engine.state, { type: "choose_character", actorId: "player", targetId: "orrin" });

    const response = await engine.tick({
      type: "fight",
      targetId: "pax",
      moveId: "consecutive_normal_punches",
      text: "Hold the overpass duel.",
    });

    expect(response.actions.some((entry) => entry.action.type === "move" && entry.action.actorId === "orrin")).toBe(false);
    expect(engine.state.player.locationId).toBe("square");
    expect(engine.state.npcs.find((npc) => npc.id === "orrin")?.locationId).toBe("square");
    expect(engine.state.npcs.find((npc) => npc.id === "pax")?.locationId).toBe("square");
  });

  test("pins the fight target to the player location after combat scheduling", async () => {
    const engine = createEngine(fixture(), {
      propose: async () => [
        { type: "move", actorId: "player", locationId: "garden" },
      ],
    });

    await engine.tick({
      type: "fight",
      targetId: "pax",
      moveId: "normal_punch",
      text: "Do not let the duel split across map rooms.",
    });

    expect(engine.state.player.locationId).toBe("garden");
    expect(engine.state.npcs.find((npc) => npc.id === "pax")?.locationId).toBe("garden");
  });
});
