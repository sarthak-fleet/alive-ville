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
    expect(world.storyProgress?.phase).toBe("shadow_confrontation");

    const finisher = applyAction(world, {
      type: "fight",
      actorId: "player",
      targetId: "pax",
      moveId: "clean_finisher",
      text: confrontation!.text,
    });

    expect(finisher.applied).toBe(true);
    expect(world.storyProgress?.phase).toBe("dawn_after_tasks");
    expect(activeObjectives(world)[0]?.questTitle).toBe("Z-City alert cleared");
  });
});
