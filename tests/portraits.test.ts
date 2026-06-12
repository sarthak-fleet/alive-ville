import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  flushPortraitQueue,
  generatePortrait,
  heroSubject,
  portraitFileName,
  portraitPrompt,
  portraitQueueDepth,
  portraitSeed,
  type PortraitSubject,
  queuePortrait,
} from "../src/portraits.ts";

// ---------------------------------------------------------------------------
// Hoist vi.mock so child_process.spawn and fs.existsSync are stubs.
// vitest hoists vi.mock() calls automatically regardless of placement.

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...(original as object),
    mkdirSync: vi.fn(),
    existsSync: vi.fn(() => false),
  };
});

// ---------------------------------------------------------------------------
// Shared mock proc used by default spawn implementation.

function makeMockProc(closeCode: number | null, errorCode?: string, delayMs = 0) {
  return {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (event === "error" && errorCode) {
        const err = Object.assign(new Error(`mock error: ${errorCode}`), { code: errorCode });
        if (delayMs > 0) setTimeout(() => handler(err), delayMs);
        else setImmediate(() => handler(err));
      } else if (event === "close" && errorCode === undefined) {
        if (delayMs > 0) setTimeout(() => handler(closeCode), delayMs);
        else setImmediate(() => handler(closeCode));
      }
    }),
    kill: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Helpers

function makeSubject(overrides: Partial<PortraitSubject> = {}): PortraitSubject {
  return {
    name: "Mira",
    role: "herbalist",
    appearance: {
      hair: "braided auburn hair",
      outfit: "green apron",
      visualTags: ["apron", "herbs"],
    },
    traits: { personality: ["warm", "curious"] },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// portraitPrompt

describe("portraitPrompt", () => {
  it("includes the style-lock prefix", () => {
    const prompt = portraitPrompt(makeSubject());
    expect(prompt).toContain("anime character portrait");
    expect(prompt).toContain("bust shot");
    expect(prompt).toContain("cel shading");
  });

  it("includes character-specific appearance fields", () => {
    const prompt = portraitPrompt(makeSubject());
    expect(prompt).toContain("Mira");
    expect(prompt).toContain("braided auburn hair");
    expect(prompt).toContain("green apron");
    expect(prompt).toContain("apron");
  });

  it("includes personality for expression flavour", () => {
    const prompt = portraitPrompt(makeSubject());
    expect(prompt).toContain("warm");
  });

  it("stays under 80 words", () => {
    const prompt = portraitPrompt(makeSubject());
    const wordCount = prompt.split(/\s+/).length;
    expect(wordCount).toBeLessThanOrEqual(80);
  });

  it("includes sourceLook when present", () => {
    const prompt = portraitPrompt(makeSubject({ appearance: { sourceLook: "Naruto Uzumaki" } }));
    expect(prompt).toContain("Naruto Uzumaki");
  });

  it("works for the default hero subject", () => {
    const prompt = portraitPrompt(heroSubject());
    expect(prompt).toContain("anime character portrait");
    expect(prompt).toContain("Wanderer");
    expect(prompt).toContain("traveler");
    expect(prompt.split(/\s+/).length).toBeLessThanOrEqual(80);
  });
});

// ---------------------------------------------------------------------------
// portraitSeed / portraitFileName

describe("portraitSeed", () => {
  it("returns a non-negative integer", () => {
    expect(portraitSeed("npc_mira", "ashment")).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(portraitSeed("npc_mira", "ashment"))).toBe(true);
  });

  it("is deterministic — same inputs always return the same value", () => {
    expect(portraitSeed("npc_mira", "ashment")).toBe(portraitSeed("npc_mira", "ashment"));
  });

  it("differs for distinct inputs", () => {
    expect(portraitSeed("npc_mira", "ashment")).not.toBe(portraitSeed("npc_tomas", "ashment"));
  });
});

describe("portraitFileName", () => {
  it("returns a filesystem-safe .png filename", () => {
    const name = portraitFileName("npc_mira", "ashment");
    expect(name).toMatch(/^[a-z0-9-]+-[a-z0-9-]+\.png$/);
  });

  it("is deterministic", () => {
    expect(portraitFileName("npc_mira", "ashment")).toBe(portraitFileName("npc_mira", "ashment"));
  });

  it("changes when npcId changes", () => {
    expect(portraitFileName("npc_mira", "ashment")).not.toBe(portraitFileName("npc_tomas", "ashment"));
  });
});

// ---------------------------------------------------------------------------
// generatePortrait

describe("generatePortrait", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });

  it("returns ok:false reason:generator_unavailable when binary is missing (ENOENT)", async () => {
    (spawn as ReturnType<typeof vi.fn>).mockReturnValueOnce(makeMockProc(null, "ENOENT"));
    const result = await generatePortrait("npc_mira", "ashment", makeSubject());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("generator_unavailable");
  });

  it("returns ok:false with exit code reason on non-zero exit", async () => {
    (spawn as ReturnType<typeof vi.fn>).mockReturnValueOnce(makeMockProc(1));
    const result = await generatePortrait("npc_mira", "ashment", makeSubject());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/exit/);
  });

  it("returns ok:true with the file path on exit 0", async () => {
    (spawn as ReturnType<typeof vi.fn>).mockReturnValueOnce(makeMockProc(0));
    const result = await generatePortrait("npc_mira", "ashment", makeSubject());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.file).toContain("ashment-npc-mira.png");
  });

  it("never throws even if spawn throws synchronously", async () => {
    (spawn as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("spawn exploded");
    });
    await expect(generatePortrait("npc_mira", "ashment", makeSubject())).resolves.toMatchObject({
      ok: false,
    });
  });
});

// ---------------------------------------------------------------------------
// queue

describe("portrait queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });

  afterEach(async () => {
    await flushPortraitQueue();
  });

  it("serialises: max 1 generatePortrait call at a time", async () => {
    let concurrentCount = 0;
    let maxConcurrent = 0;

    (spawn as ReturnType<typeof vi.fn>).mockImplementation(() => {
      concurrentCount++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCount);
      const proc = {
        on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
          if (event === "close") {
            setTimeout(() => {
              concurrentCount--;
              handler(0);
            }, 5);
          }
        }),
        kill: vi.fn(),
      };
      return proc;
    });

    const p1 = queuePortrait("npc_a", "world1", makeSubject({ name: "A" }));
    const p2 = queuePortrait("npc_b", "world1", makeSubject({ name: "B" }));
    const p3 = queuePortrait("npc_c", "world1", makeSubject({ name: "C" }));

    await Promise.all([p1, p2, p3]);
    expect(maxConcurrent).toBe(1);
  });

  it("deduplicates: same npc queued twice does not run generation twice", async () => {
    let spawnCount = 0;
    (spawn as ReturnType<typeof vi.fn>).mockImplementation(() => {
      spawnCount++;
      const proc = {
        on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
          if (event === "close") setTimeout(() => handler(0), 5);
        }),
        kill: vi.fn(),
      };
      return proc;
    });

    const p1 = queuePortrait("npc_mira", "ashment", makeSubject());
    const p2 = queuePortrait("npc_mira", "ashment", makeSubject());
    await flushPortraitQueue();
    await Promise.all([p1, p2]);

    expect(spawnCount).toBe(1);
  });

  it("portraitQueueDepth returns 0 when idle", async () => {
    await flushPortraitQueue();
    expect(portraitQueueDepth()).toBe(0);
  });
});
