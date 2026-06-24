import { describe, expect, test } from 'vitest';

import {
  buildResearchPrompt,
  extractReadableText,
  extractTitle,
  fetchResearchSource,
  summarizeUrl,
} from '../src/research.ts';

describe('research utilities', () => {
  test('extractReadableText removes non-content tags and normalizes text', () => {
    const html = `
      <html>
        <head><title>Ashment &amp; Forge</title><style>.x{display:none}</style></head>
        <body>
          <h1>Village Square</h1>
          <script>window.nope = true</script>
          <p>Mira hears a rumor&nbsp;near the well.</p>
        </body>
      </html>
    `;

    expect(extractTitle(html)).toBe('Ashment & Forge');
    expect(extractReadableText(html)).toBe('Village Square\nMira hears a rumor near the well.');
  });

  test('fetchResearchSource rejects non-http urls', async () => {
    await expect(fetchResearchSource('file:///tmp/story.html')).rejects.toThrow(/http or https/);
  });

  test('fetchResearchSource extracts title and text through injected fetch', async () => {
    const source = await fetchResearchSource('https://example.test/page', {
      fetcher: async () =>
        new Response('<title>Demo</title><p>One useful fact.</p>', {
          headers: { 'content-type': 'text/html' },
        }),
    });

    expect(source.title).toBe('Demo');
    expect(source.text).toBe('One useful fact.');
  });

  test('buildResearchPrompt asks for facts and labels inferences', () => {
    const prompt = buildResearchPrompt(
      {
        url: 'https://example.test',
        title: 'Example',
        text: 'The forge is closed at dusk.',
        fetchedAt: '2026-05-16T00:00:00.000Z',
      },
      'What can become a quest?'
    );

    expect(prompt).toContain('Question: What can become a quest?');
    expect(prompt).toContain('Game-design inferences clearly labeled as inferences.');
    expect(prompt).toContain('The forge is closed at dusk.');
  });

  test('summarizeUrl uses fetched page text and injected model completion', async () => {
    const summary = await summarizeUrl('https://example.test/story', {
      fetcher: async () =>
        new Response('<title>Story</title><p>Lena guards a secret gate.</p>', {
          headers: { 'content-type': 'text/html' },
        }),
      complete: async ({ user }) => ({
        text: user.includes('Lena guards a secret gate.')
          ? 'Key fact: Lena guards a secret gate.'
          : 'missing',
        raw: 'Key fact: Lena guards a secret gate.',
        meta: { tier: 'quest', model: 'mock', latencyMs: 1, error: null, jsonOk: false },
      }),
    });

    expect(summary.source.title).toBe('Story');
    expect(summary.summary).toBe('Key fact: Lena guards a secret gate.');
    expect(summary.meta.model).toBe('mock');
  });
});
