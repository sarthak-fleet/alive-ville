import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { proposeNpcActions } from "../src/simulation.ts";
import type { World } from "../src/types.ts";

function loadWorld(): World {
  return JSON.parse(readFileSync(new URL("../worlds/one-punch-man.json", import.meta.url), "utf8")) as World;
}

/** Make `pax` attack the player this tick by injecting a hostile fight action into the
 *  existing-actions list that followerCombatActions inspects. proposeNpcActions calls
 *  hostileCombatActions first, so pax's fight action is in `existingActions` when
 *  followerCombatActions runs — but only if pax actually has combat enabled.
 *  We simulate this by giving pax a combat state with damaged HP so hostileCombatActions
 *  picks it up, then running proposeNpcActions. */
function armPax(world: World): void {
  const pax = world.npcs.find((n) => n.id === "pax")!;
  pax.locationId = world.player.locationId;
  // damaged HP triggers hostileCombatActions (it checks hp < maxHp || posture < 100)
  pax.combat = { hp: 60, maxHp: 100, posture: 80 };
  // tick 0 fires a scripted pax confront which marks pax busy and prevents fight emission
  world.tick = 5;
}

function makeFollower(world: World, npcId: string): void {
  const npc = world.npcs.find((n) => n.id === npcId)!;
  npc.locationId = world.player.locationId;
  npc.followingPlayer = true;
}

describe("follower combat — joins the fight", () => {
  it("following NPC emits fight action targeting the hostile attacking the player", () => {
    const world = loadWorld();
    armPax(world);
    makeFollower(world, "lena");

    const actions = proposeNpcActions(world);
    const followerFight = actions.find(
      (a) => a.type === "fight" && a.actorId === "lena" && (a as { targetId?: string }).targetId === "pax"
    );

    expect(followerFight).toBeDefined();
  });

  it("follower in a different location does not fight", () => {
    const world = loadWorld();
    armPax(world);
    // lena stays at inn, not player's square
    const lena = world.npcs.find((n) => n.id === "lena")!;
    lena.locationId = "inn";
    lena.followingPlayer = true;

    const actions = proposeNpcActions(world);
    const followerFight = actions.find(
      (a) => a.type === "fight" && a.actorId === "lena"
    );

    expect(followerFight).toBeUndefined();
  });

  it("locked-in-dialogue follower does not fight", () => {
    const world = loadWorld();
    armPax(world);
    makeFollower(world, "lena");
    const lena = world.npcs.find((n) => n.id === "lena")!;
    lena.talkingToPlayerUntilTick = world.tick + 5;

    const actions = proposeNpcActions(world);
    const followerFight = actions.find(
      (a) => a.type === "fight" && a.actorId === "lena"
    );

    expect(followerFight).toBeUndefined();
  });

  it("two followers both engage a single hostile", () => {
    const world = loadWorld();
    armPax(world);
    makeFollower(world, "lena");
    makeFollower(world, "fubuki");

    const actions = proposeNpcActions(world);
    const fightCount = actions.filter(
      (a) => a.type === "fight" && ["lena", "fubuki"].includes(a.actorId) && (a as { targetId?: string }).targetId === "pax"
    ).length;

    // limit = 1 per call but two followers can each produce one fight
    expect(fightCount).toBeGreaterThanOrEqual(1);
  });

  it("player already defeated — follower does not fight", () => {
    const world = loadWorld();
    armPax(world);
    makeFollower(world, "lena");
    world.player.combat = { hp: 0, maxHp: 120, posture: 0, defeated: true };

    const actions = proposeNpcActions(world);
    const followerFight = actions.find(
      (a) => a.type === "fight" && a.actorId === "lena"
    );

    expect(followerFight).toBeUndefined();
  });

  it("no hostile attacker present — follower does not spontaneously fight", () => {
    const world = loadWorld();
    world.tick = 5;
    // pax not armed, no hostile fight action generated
    const pax = world.npcs.find((n) => n.id === "pax")!;
    pax.locationId = world.player.locationId;
    // full HP and posture — hostileCombatActions will not fire
    pax.combat = { hp: 100, maxHp: 100, posture: 100 };
    makeFollower(world, "lena");

    const actions = proposeNpcActions(world);
    const followerFight = actions.find(
      (a) => a.type === "fight" && a.actorId === "lena"
    );

    expect(followerFight).toBeUndefined();
  });
});
