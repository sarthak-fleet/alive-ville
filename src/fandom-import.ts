import { completeText, streamText } from './llm/router.ts';
import { validateWorldIngestSource, type WorldIngestSource } from './world-ingest.ts';

/**
 * Type a fandom name → playable world. Three steps:
 *  1. LLM plans the wiki subdomain + the cast/locations worth fetching
 *  2. MediaWiki TextExtracts pulls grounded intros for each entity
 *  3. LLM compiles the extracts into a WorldIngestSource (then coerced/validated)
 */

const LONG_CALL_MS = 90_000;
const RESEARCH_MODEL = (): string | undefined => process.env['LLM_MODEL_RESEARCH'] ?? undefined;
const EXTRACT_CHAR_CAP = 900;
// fandom's edge 502s non-browser user agents
const WIKI_UA = 'Mozilla/5.0 (compatible; AlivevilleWorldImport/1.0)';

interface FandomPlan {
  wikis: string[];
  title: string;
  synopsis: string;
  characters: string[];
  antagonist: string;
  locations: string[];
}

export interface FandomImportResult {
  source: WorldIngestSource;
  wiki: string | null;
  notes: string[];
}

const PLAN_SYSTEM = `You identify the Fandom wiki for a franchise and pick a playable slice.
Return ONLY a JSON object:
{"wikis":["<most likely fandom.com subdomain>","<alternate>","<alternate>"],
 "title":"<franchise title>",
 "synopsis":"<2-3 sentence setting summary for an early arc>",
 "characters":["<8-10 character names, protagonists first>"],
 "antagonist":"<one name from characters that opposes the others>",
 "locations":["<6 iconic places from the same arc>"]}
Subdomains are like "kimetsu-no-yaiba" for kimetsu-no-yaiba.fandom.com. No prose, JSON only.`;

const BUILD_SYSTEM = `You compile research notes into a world file for a 3D life-sim RPG.
Return ONLY a JSON object matching this schema (no markdown fences):
{
 "title": string, "worldId": string(snake_case), "synopsis": string, "themes": [3 strings],
 "locations": [6 of {"name","role","description"}] // roles: hub, home and healing house, training and repair site, garden sanctuary, threat site, report station and meeting point — in that order,
 "factions": [2 of {"name","goals":[3],"resources":[3],"reputation":int -5..5}],
 "characters": [6-10 of {
   "name","role"(short epithet),"faction","description"(2 sentences),
   "look": {"sourceLook","bodyType","hair","outfit","palette":[3 hex colors from their canonical outfit],"silhouette","visualTags":[3-5 words; include "she" for female characters]},
   "traits":[3],"values":[2-3],"flaws":[1-2],"fears":[1-2],
   "speechStyle": string, "goals":[2-3 concrete local goals], "secrets":[1-2], "memories":[1-2 first-person lines]
 }],
 "conflicts": [2 of {"title","pressure":int 30-60,"involved":[names],"antagonist":"<the villain's name>","objective","clue"}],
 "artifacts": [5 of {"name","description","location":"<one of the location names>"}]
}
Rules: ground everything in the notes; palette hex colors must match described outfits; the antagonist must appear in characters; locations/characters/artifacts must have unique names; keep it to ONE early arc of the story.`;

export async function fandomToWorldSource(query: string): Promise<FandomImportResult> {
  const notes: string[] = [];

  const planResult = await completeText({
    tier: 'quest',
    system: PLAN_SYSTEM,
    user: query.trim().slice(0, 120),
    timeoutMs: 30_000,
    model: RESEARCH_MODEL(),
  });
  if (!('text' in planResult) || !planResult.text) {
    throw new Error(
      `plan_failed: ${'error' in planResult && planResult.error ? planResult.error : 'reason' in planResult ? planResult.reason : 'empty'}`
    );
  }
  const plan = parseJsonObject<FandomPlan>(planResult.text);
  if (!plan?.title || !Array.isArray(plan.characters) || plan.characters.length === 0) {
    throw new Error('plan_failed: model returned no usable plan');
  }

  const wiki = await resolveWiki(plan.wikis ?? []);
  notes.push(
    wiki ? `wiki: ${wiki}.fandom.com` : 'wiki: none resolved — building from model knowledge'
  );

  const wanted = [
    ...new Set([...(plan.characters ?? []).slice(0, 8), ...(plan.locations ?? []).slice(0, 6)]),
  ].slice(0, 14);
  const extracts = wiki ? await fetchExtracts(wiki, wanted) : new Map<string, string>();
  notes.push(`extracts: ${extracts.size}/${wanted.length}`);

  const researchLines = wanted.map((name) => {
    const text = extracts.get(name.toLowerCase());
    return `## ${name}\n${text ? text.slice(0, EXTRACT_CHAR_CAP) : '(no wiki page found — use general knowledge, stay canonical)'}`;
  });
  const user = [
    `Franchise: ${plan.title}`,
    `Setting: ${plan.synopsis}`,
    `Antagonist: ${plan.antagonist}`,
    `Research notes:`,
    ...researchLines,
  ].join('\n\n');

  // streamed: the gateway times out non-streaming generations around 45s
  let buildResult = await streamText({
    tier: 'quest',
    system: BUILD_SYSTEM,
    user,
    timeoutMs: LONG_CALL_MS,
    model: RESEARCH_MODEL(),
  });
  if (!('text' in buildResult) || !buildResult.text) {
    // gateways choke on large prompts — retry once with tighter notes
    notes.push('build retry with condensed notes');
    const condensed = researchLines.map((line) => line.slice(0, 420)).join('\n\n');
    buildResult = await streamText({
      tier: 'quest',
      system: BUILD_SYSTEM,
      user: `Franchise: ${plan.title}\n\nSetting: ${plan.synopsis}\n\nAntagonist: ${plan.antagonist}\n\n${condensed}`,
      timeoutMs: LONG_CALL_MS,
      model: RESEARCH_MODEL(),
    });
  }
  if (!('text' in buildResult) || !buildResult.text) {
    throw new Error(
      `build_failed: ${'error' in buildResult && buildResult.error ? buildResult.error : 'empty'}`
    );
  }
  const raw = parseJsonObject<WorldIngestSource>(buildResult.text);
  if (!raw) throw new Error('build_failed: model returned invalid JSON');

  const source = coerceWorldSource(raw, plan);
  const issues = validateWorldIngestSource(source);
  if (issues.length > 0) {
    throw new Error(
      `build_failed: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`
    );
  }
  return { source, wiki, notes };
}

// ---------------------------------------------------------------------------

async function resolveWiki(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates.slice(0, 4)) {
    const sub = candidate
      .toLowerCase()
      .replace(/\.fandom\.com.*$/, '')
      .replace(/^https?:\/\//, '')
      .replace(/[^a-z0-9-]/g, '');
    if (!sub) continue;
    try {
      const res = await fetch(
        `https://${sub}.fandom.com/api.php?action=query&meta=siteinfo&format=json`,
        {
          signal: AbortSignal.timeout(6_000),
          headers: { 'user-agent': WIKI_UA },
        }
      );
      if (res.ok && (res.headers.get('content-type') ?? '').includes('json')) return sub;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/**
 * Many fandom wikis don't install TextExtracts, so this goes straight to the
 * core parse API: intro-section wikitext per title, then strips markup.
 */
async function fetchExtracts(wiki: string, titles: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    titles.map(async (title) => {
      const url =
        `https://${wiki}.fandom.com/api.php?action=parse&prop=wikitext&section=0&redirects=1&format=json` +
        `&page=${encodeURIComponent(title)}`;
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(10_000),
          headers: { 'user-agent': WIKI_UA },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { parse?: { wikitext?: { '*'?: string } } };
        const raw = data.parse?.wikitext?.['*'];
        if (!raw) return;
        const text = stripWikitext(raw);
        if (text.length > 80) out.set(title.toLowerCase(), text);
      } catch {
        // missing page; the model falls back to general knowledge
      }
    })
  );
  return out;
}

function stripWikitext(raw: string): string {
  let text = raw;
  // remove nested templates ({{infobox ...}}) by repeated inner-first stripping
  for (let pass = 0; pass < 6; pass += 1) {
    const next = text.replace(/\{\{[^{}]*\}\}/g, ' ');
    if (next === text) break;
    text = next;
  }
  return text
    .replace(/<ref[^>]*\/>/g, ' ')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/^=+.*=+$/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseJsonObject<T>(text: string): T | null {
  const trimmed = text.replace(/```(?:json)?/g, '').trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

const LOCATION_ROLES = [
  'hub',
  'home and healing house',
  'training and repair site',
  'garden sanctuary',
  'threat site',
  'report station and meeting point',
];

/** fill the gaps a model leaves so the validator passes on real output */
function coerceWorldSource(raw: WorldIngestSource, plan: FandomPlan): WorldIngestSource {
  const title = (raw.title ?? plan.title ?? 'Imported World').trim();
  const source: WorldIngestSource = {
    ...raw,
    title,
    worldId: (raw.worldId ?? title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, ''),
    synopsis: (raw.synopsis ?? plan.synopsis ?? title).trim(),
    themes: raw.themes?.length
      ? raw.themes
      : ['found family', 'courage against the dark', 'training and growth'],
    locations: dedupeByName(raw.locations ?? []).slice(0, 6),
    characters: dedupeByName(raw.characters ?? []).slice(0, 12),
    factions: raw.factions ?? [],
    conflicts: raw.conflicts ?? [],
    artifacts: dedupeByName(raw.artifacts ?? []).slice(0, 6),
  };
  // pad locations to 6 with generic spaces so every template slot exists
  const padNames = [
    'Quiet Quarter',
    'Old Workshop',
    'Hidden Garden',
    'Wayside Inn',
    'Broken Crossing',
    'Outer Grove',
  ];
  while (source.locations.length < 6) {
    const index = source.locations.length;
    source.locations.push({
      name: `${padNames[index]}`,
      role: LOCATION_ROLES[index]!,
      description: `A ${LOCATION_ROLES[index]} of ${title}.`,
    });
  }
  source.locations = source.locations.map((location, index) => ({
    ...location,
    role: location.role ?? LOCATION_ROLES[index],
  }));
  // artifacts power the starter quests — make sure five exist
  while ((source.artifacts ?? []).length < 5) {
    source.artifacts = [
      ...(source.artifacts ?? []),
      {
        name: `Keepsake ${source.artifacts!.length + 1} of ${title}`,
        description: 'A small object someone here misses.',
      },
    ];
  }
  return source;
}

function dedupeByName<T extends { name: string }>(entries: T[]): T[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = entry.name?.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
