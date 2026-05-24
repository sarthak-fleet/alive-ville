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

  test("exposes a compact six-move combat kit for the local OPM slice", () => {
    const moves = combatMovesFor(fixture());

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

  test("lets the player choose an existing character avatar", () => {
    const world = fixture();
    const result = applyAction(world, { type: "choose_character", actorId: "player", targetId: "tomas" });

    expect(result.applied).toBe(true);
    expect(world.player.characterId).toBe("tomas");
    expect(world.player.name).toBe("Genos");
    expect(world.player.locationId).toBe("forge");
    expect(world.player.appearance?.sourceLook).toContain("Genos");
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

    const result = applyAction(world, {
      type: "fight",
      actorId: "player",
      targetId: "pax",
      moveId: "consecutive_normal_punches",
      text: confrontation!.text,
    });

    expect(result.applied).toBe(true);
    if (result.applied) expect(result.text).toContain("consecutive normal punches");
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

    expect(downed.actions[0]?.text).toContain("dropping New Hero to 0 HP");
    expect(engine.state.player.combat).toMatchObject({ hp: 0, posture: 0, defeated: true });

    await engine.tick();
    expect(engine.state.player.combat).toMatchObject({ hp: 50, posture: 45, defeated: false });
  });

  test("hostile agents can auto-engage the player during world ticks", async () => {
    const engine = createEngine(fixture());

    const opening = await engine.tick();
    expect(opening.actions.some((entry) => entry.action.type === "fight")).toBe(false);

    const ambush = await engine.tick();
    const hostileFight = ambush.actions.find((entry) => entry.action.type === "fight");
    expect(hostileFight?.action).toMatchObject({
      type: "fight",
      actorId: "pax",
      targetId: "player",
      moveId: "serious_side_step",
    });
    expect(hostileFight?.text).toContain("Speed-o'-Sound Sonic");
    expect(hostileFight?.text).toContain("New Hero has");
    expect(engine.state.player.combat?.hp).toBeLessThan(120);
    expect(engine.state.player.combat?.posture).toBeLessThan(100);
  });
});
