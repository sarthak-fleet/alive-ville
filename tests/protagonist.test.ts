import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { type AnimeIngestSource,animeSourceToWorld } from "../src/anime-ingest.ts";
import { DEFAULT_HERO_APPEARANCE, DEFAULT_HERO_NAME, sanitizePlayerName } from "../src/player-defaults.ts";
import { applyAction, createEngine, validateAction } from "../src/simulation.ts";
import { storyPackageFromWorld, worldFromStoryPackage } from "../src/story-package.ts";
import type { World } from "../src/types.ts";

const fixture = (): World => JSON.parse(readFileSync(new URL("../worlds/village.json", import.meta.url), "utf8")) as World;

const animeSource = (): AnimeIngestSource =>
  JSON.parse(readFileSync(new URL("../fixtures/anime/opm-ingest-source.json", import.meta.url), "utf8")) as AnimeIngestSource;

describe("default hero appearance", () => {
  test("animeSourceToWorld gives the player a default appearance and name", () => {
    const world = animeSourceToWorld(animeSource());
    expect(world.player.appearance).toBeDefined();
    expect(world.player.appearance?.visualTags).toContain("scarf");
    expect(world.player.name).toBe(DEFAULT_HERO_NAME);
  });

  test("worldFromStoryPackage gives the player a default appearance and name", () => {
    const world = animeSourceToWorld(animeSource());
    const pkg = storyPackageFromWorld(world);
    const restored = worldFromStoryPackage(pkg);
    expect(restored.player.appearance).toBeDefined();
    expect(restored.player.appearance?.visualTags).toContain("scarf");
    expect(restored.player.name).toBe(DEFAULT_HERO_NAME);
  });

  test("DEFAULT_HERO_APPEARANCE has a crimson palette entry", () => {
    expect(DEFAULT_HERO_APPEARANCE.palette).toBeDefined();
    const hasCrimson = DEFAULT_HERO_APPEARANCE.palette!.some((c) => /^#c8382a$/i.test(c));
    expect(hasCrimson).toBe(true);
  });
});

describe("choose_character mirrors appearance and name", () => {
  test("choose_character copies npc appearance and name to player", async () => {
    const world = fixture();
    // give a fixture npc a known appearance
    const npc = world.npcs[0]!;
    npc.appearance = { hair: "red spiky hair", outfit: "hero suit", palette: ["#ff2200", "#ffffff", "#ff8800"], visualTags: ["hero"] };
    const engine = createEngine(world, { propose: async () => [] });

    await engine.tick({ type: "choose_character", targetId: npc.id });

    expect(engine.state.player.characterId).toBe(npc.id);
    expect(engine.state.player.name).toBe(npc.name);
    expect(engine.state.player.appearance).toMatchObject({ hair: "red spiky hair" });
  });

  test("choose_character with an npc that has no appearance leaves player appearance undefined", async () => {
    const world = fixture();
    const npc = world.npcs[0]!;
    delete npc.appearance;
    const engine = createEngine(world, { propose: async () => [] });

    await engine.tick({ type: "choose_character", targetId: npc.id });

    expect(engine.state.player.characterId).toBe(npc.id);
    expect(engine.state.player.appearance).toBeUndefined();
  });
});

describe("set_name action", () => {
  test("validates and rejects non-player set_name", () => {
    const world = fixture();
    const result = validateAction(world, { type: "set_name", actorId: "mira", name: "Hiro" });
    expect(result.ok).toBe(false);
  });

  test("validates and rejects empty name", () => {
    const world = fixture();
    const result = validateAction(world, { type: "set_name", actorId: "player", name: "   " });
    expect(result.ok).toBe(false);
  });

  test("accepts a name longer than 20 chars (sanitizer caps it)", () => {
    const world = fixture();
    // Names over 20 chars are accepted by validateAction — sanitizer caps them on apply
    const result = validateAction(world, { type: "set_name", actorId: "player", name: "A".repeat(21) });
    expect(result.ok).toBe(true);
  });

  test("validates and accepts a normal name", () => {
    const world = fixture();
    const result = validateAction(world, { type: "set_name", actorId: "player", name: "Kira" });
    expect(result.ok).toBe(true);
  });

  test("applyAction set_name updates player name after trim and control char strip", () => {
    const world = fixture();
    const result = applyAction(world, { type: "set_name", actorId: "player", name: "  Kira\x01  " });
    expect(result.applied).toBe(true);
    expect(world.player.name).toBe("Kira");
  });

  test("applyAction set_name caps to 20 characters", () => {
    const world = fixture();
    applyAction(world, { type: "set_name", actorId: "player", name: "A".repeat(25) });
    expect(world.player.name?.length).toBeLessThanOrEqual(20);
  });
});

describe("sanitizePlayerName", () => {
  test("strips control chars and trims", () => {
    expect(sanitizePlayerName("  Kira\x01  ")).toBe("Kira");
  });

  test("returns null for empty or whitespace-only input", () => {
    expect(sanitizePlayerName("")).toBeNull();
    expect(sanitizePlayerName("   ")).toBeNull();
  });

  test("caps at 20 characters", () => {
    const result = sanitizePlayerName("A".repeat(30));
    expect(result?.length).toBe(20);
  });

  test("preserves normal names", () => {
    expect(sanitizePlayerName("Wanderer")).toBe("Wanderer");
    expect(sanitizePlayerName("Kira Yamato")).toBe("Kira Yamato");
  });
});
