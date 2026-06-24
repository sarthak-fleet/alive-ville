import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
} from '../src/portraits.ts';

// ---------------------------------------------------------------------------
// vi.mock hoisted by vitest. We mock the filesystem so generatePortrait can
// run without touching disk, and replace global.fetch per test.

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn(async () => undefined),
}));

vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...(original as object),
    mkdirSync: vi.fn(),
    existsSync: vi.fn(() => false),
  };
});

const fetchMock = vi.fn<typeof fetch>();

// ---------------------------------------------------------------------------
// Helpers

function makeSubject(overrides: Partial<PortraitSubject> = {}): PortraitSubject {
  return {
    name: 'Mira',
    role: 'herbalist',
    appearance: {
      hair: 'braided auburn hair',
      outfit: 'green apron',
      visualTags: ['apron', 'herbs'],
    },
    traits: { personality: ['warm', 'curious'] },
    ...overrides,
  };
}

function pngResponse(): Response {
  // 1×1 transparent PNG — enough for tests that only check ok-path
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64'
  );
  return new Response(png, { status: 200, headers: { 'content-type': 'image/png' } });
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('PORTRAIT_URL', 'https://example-modal-test.modal.run/generate');
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// portraitPrompt

describe('portraitPrompt', () => {
  it('includes the style-lock prefix', () => {
    const prompt = portraitPrompt(makeSubject());
    expect(prompt).toContain('anime character portrait');
    expect(prompt).toContain('bust shot');
    expect(prompt).toContain('cel shading');
  });

  it('includes character-specific appearance fields', () => {
    const prompt = portraitPrompt(makeSubject());
    expect(prompt).toContain('Mira');
    expect(prompt).toContain('braided auburn hair');
    expect(prompt).toContain('green apron');
    expect(prompt).toContain('apron');
  });

  it('includes personality for expression flavour', () => {
    const prompt = portraitPrompt(makeSubject());
    expect(prompt).toContain('warm');
  });

  it('stays under 80 words', () => {
    const prompt = portraitPrompt(makeSubject());
    const wordCount = prompt.split(/\s+/).length;
    expect(wordCount).toBeLessThanOrEqual(80);
  });

  it('includes sourceLook when present', () => {
    const prompt = portraitPrompt(makeSubject({ appearance: { sourceLook: 'Naruto Uzumaki' } }));
    expect(prompt).toContain('Naruto Uzumaki');
  });

  it('works for the default hero subject', () => {
    const prompt = portraitPrompt(heroSubject());
    expect(prompt).toContain('anime character portrait');
    expect(prompt).toContain('Wanderer');
    expect(prompt).toContain('traveler');
    expect(prompt.split(/\s+/).length).toBeLessThanOrEqual(80);
  });
});

// ---------------------------------------------------------------------------
// portraitSeed / portraitFileName

describe('portraitSeed', () => {
  it('returns a non-negative integer', () => {
    expect(portraitSeed('npc_mira', 'ashment')).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(portraitSeed('npc_mira', 'ashment'))).toBe(true);
  });

  it('is deterministic — same inputs always return the same value', () => {
    expect(portraitSeed('npc_mira', 'ashment')).toBe(portraitSeed('npc_mira', 'ashment'));
  });

  it('differs for distinct inputs', () => {
    expect(portraitSeed('npc_mira', 'ashment')).not.toBe(portraitSeed('npc_tomas', 'ashment'));
  });
});

describe('portraitFileName', () => {
  it('returns a filesystem-safe .png filename', () => {
    const name = portraitFileName('npc_mira', 'ashment');
    expect(name).toMatch(/^[a-z0-9-]+-[a-z0-9-]+\.png$/);
  });

  it('is deterministic', () => {
    expect(portraitFileName('npc_mira', 'ashment')).toBe(portraitFileName('npc_mira', 'ashment'));
  });

  it('changes when npcId changes', () => {
    expect(portraitFileName('npc_mira', 'ashment')).not.toBe(
      portraitFileName('npc_tomas', 'ashment')
    );
  });
});

// ---------------------------------------------------------------------------
// generatePortrait

describe('generatePortrait', () => {
  it('returns ok:false reason:generator_unavailable when PORTRAIT_URL is unset', async () => {
    vi.stubEnv('PORTRAIT_URL', '');
    const result = await generatePortrait('npc_mira', 'ashment', makeSubject());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('generator_unavailable');
  });

  it('returns ok:false with http_<status> reason on non-2xx response', async () => {
    fetchMock.mockResolvedValueOnce(new Response('oops', { status: 500 }));
    const result = await generatePortrait('npc_mira', 'ashment', makeSubject());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('http_500');
  });

  it('returns ok:true with the file path on 200', async () => {
    fetchMock.mockResolvedValueOnce(pngResponse());
    const result = await generatePortrait('npc_mira', 'ashment', makeSubject());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.file).toContain('ashment-npc-mira.png');
  });

  it('posts the prompt, seed, and dimensions in the JSON body', async () => {
    fetchMock.mockResolvedValueOnce(pngResponse());
    await generatePortrait('npc_mira', 'ashment', makeSubject());
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String(init?.body));
    expect(body.prompt).toContain('anime character portrait');
    expect(body.seed).toBe(portraitSeed('npc_mira', 'ashment'));
    expect(body.width).toBe(512);
    expect(body.height).toBe(512);
  });

  it('never throws even if fetch rejects', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(generatePortrait('npc_mira', 'ashment', makeSubject())).resolves.toMatchObject({
      ok: false,
    });
  });
});

// ---------------------------------------------------------------------------
// queue

describe('portrait queue', () => {
  afterEach(async () => {
    await flushPortraitQueue();
  });

  it('serialises: max 1 generatePortrait call at a time', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    fetchMock.mockImplementation(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 5));
      concurrent--;
      return pngResponse();
    });

    const p1 = queuePortrait('npc_a', 'world1', makeSubject({ name: 'A' }));
    const p2 = queuePortrait('npc_b', 'world1', makeSubject({ name: 'B' }));
    const p3 = queuePortrait('npc_c', 'world1', makeSubject({ name: 'C' }));

    await Promise.all([p1, p2, p3]);
    expect(maxConcurrent).toBe(1);
  });

  it('deduplicates: same npc queued twice runs generation once', async () => {
    fetchMock.mockResolvedValue(pngResponse());

    const p1 = queuePortrait('npc_mira', 'ashment', makeSubject());
    const p2 = queuePortrait('npc_mira', 'ashment', makeSubject());
    await flushPortraitQueue();
    await Promise.all([p1, p2]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('portraitQueueDepth returns 0 when idle', async () => {
    await flushPortraitQueue();
    expect(portraitQueueDepth()).toBe(0);
  });
});
