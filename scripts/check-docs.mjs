#!/usr/bin/env node
/**
 * scripts/check-docs.mjs — documentation validator for the ai-game repo.
 *
 * Markdown under docs/ is the source of truth. This script enforces:
 *   1. docs/index.md exists.
 *   2. Every docs markdown file (except archive/) has a `title` in frontmatter.
 *   3. Every relative Markdown link resolves to a file that exists.
 *   4. No empty docs/ subdirectories.
 *
 * Run:  node scripts/check-docs.mjs
 * CI:   .github/workflows/docs.yml
 *
 * Exits non-zero on any error. Pure stdlib — no dependencies.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve, sep, posix } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');
const ARCHIVE = join(DOCS, 'archive');

const errors = [];

function isArchive(absPath) {
  return absPath.startsWith(ARCHIVE + sep);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

function readFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const body = m[1];
  const titleMatch = body.match(/^title:\s*(.+)$/m);
  return {
    title: titleMatch ? titleMatch[1].replace(/^["']|["']$/g, '').trim() : null,
  };
}

function toRepoPosix(absPath) {
  return relative(ROOT, absPath).split(sep).join(posix.sep);
}

// --- 1. index.md exists -----------------------------------------------------
if (!existsSync(join(DOCS, 'index.md'))) {
  errors.push('docs/index.md is missing (the docs navigation hub).');
}

// --- 2. gather all docs files + frontmatter --------------------------------
const docsFiles = walk(DOCS);
const docsPosix = new Set(docsFiles.map(toRepoPosix));

// --- 3. title frontmatter + link checking ----------------------------------
const linkRe = /\[[^\]]+\]\(([^)]+)\)/g;

for (const file of docsFiles) {
  const rel = toRepoPosix(file);
  const text = readFileSync(file, 'utf8');
  // Archived docs are preserved for git history, not rendered as canonical
  // Blume pages. Skip frontmatter + link checks for them (their links are
  // expected to be stale relative to their original locations).
  if (isArchive(file)) continue;
  const fm = readFrontmatter(text);
  if (!fm?.title) {
    errors.push(`${rel}: missing frontmatter \`title\` (Blume renders it as the page heading).`);
  }

  for (const m of text.matchAll(linkRe)) {
    const target = m[1];
    // Skip external, anchors-only, mailto, and absolute URLs.
    if (/^(https?:|mailto:|tel:|#|\/)/.test(target)) continue;
    // Strip anchor.
    const [pathPart] = target.split('#');
    if (!pathPart) continue;
    // Resolve relative to the file's directory.
    const resolved = resolve(dirname(file), pathPart);
    const relResolved = toRepoPosix(resolved);
    if (!docsPosix.has(relResolved)) {
      // Allow links to non-docs files (e.g. ../../wrangler.jsonc, scripts/...)
      // if they exist on disk.
      if (!existsSync(resolved)) {
        errors.push(`${rel}: broken link \`${target}\` → ${relResolved} (not found).`);
      }
    }
  }
}

// --- 4. empty docs subdirectories ------------------------------------------
function findEmptyDirs(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = join(dir, entry.name);
    const children = readdirSync(full, { withFileTypes: true });
    if (children.length === 0) {
      errors.push(`${toRepoPosix(full)}/: empty directory (no placeholder docs allowed).`);
    } else {
      findEmptyDirs(full);
    }
  }
}
findEmptyDirs(DOCS);

// --- report -----------------------------------------------------------------
for (const e of errors) console.error(`error: ${e}`);

if (errors.length) {
  console.error(`\n${errors.length} doc error(s).`);
  process.exit(1);
}
console.log(`docs OK — ${docsFiles.length} markdown files checked.`);
