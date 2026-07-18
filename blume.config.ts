import { defineConfig } from 'blume';

/**
 * Blume configuration for the Aliveville docs site.
 *
 * The committed Markdown under docs/ is the source of truth. Blume is only
 * the presentation and search layer — generated output (docs-dist/, .blume/)
 * is gitignored and never committed.
 *
 * See docs/development/docs.md for the documentation rules.
 */
export default defineConfig({
  title: 'Aliveville docs',
  description:
    'Local-first knowledge system for Aliveville — the browser-playable AI world simulator. Product, architecture, decisions, development, operations, and learnings.',

  content: {
    root: 'docs',
    // Render committed Markdown as the docs site. Archive is excluded from
    // the rendered site (it is preserved for git history and reachable via
    // the repo, not as canonical pages). See docs/development/docs.md.
    include: ['**/*.md'],
    exclude: ['archive/**'],
  },

  github: {
    owner: 'sarthakagrawal927',
    repo: 'aliveville',
    branch: 'main',
    dir: 'docs',
  },

  theme: {
    accent: 'violet',
    radius: 'md',
    mode: 'system',
  },

  search: {
    provider: 'orama',
  },

  markdown: {
    imageZoom: true,
    code: {
      icons: true,
      wrap: false,
    },
    codeBlocks: {
      theme: {
        light: 'github-light',
        dark: 'github-dark',
      },
    },
  },

  ai: {
    llmsTxt: true,
    mcp: {
      enabled: false,
      route: '/mcp',
    },
  },

  seo: {
    og: { enabled: true },
    sitemap: true,
    robots: true,
    structuredData: true,
  },

  deployment: {
    output: 'static',
    // No canonical docs site URL yet — set this when the docs site is
    // published. Leaving it unset keeps sitemap/feeds off until a site is
    // chosen.
    // site: "https://docs.aliveville.com",
  },
});
