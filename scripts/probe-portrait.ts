/**
 * Single-portrait probe to verify the Modal endpoint works end-to-end.
 * Generates one portrait under a throwaway worldId so it doesn't collide
 * with real assets. Deletes itself on success.
 *
 * Usage: tsx scripts/probe-portrait.ts
 */
import { existsSync, unlinkSync } from 'node:fs';

import { generatePortrait, portraitPath } from '../src/portraits.ts';

async function main() {
  const npcId = 'probe';
  const worldId = 'probe-world';
  const subject = {
    name: 'Mira',
    role: 'herbalist',
    appearance: {
      hair: 'braided auburn hair',
      outfit: 'green apron',
      visualTags: ['apron', 'herbs'],
    },
    traits: { personality: ['warm'] },
  };

  console.info('Probe → calling Modal endpoint…');
  const t0 = Date.now();
  const result = await generatePortrait(npcId, worldId, subject);
  const dt = ((Date.now() - t0) / 1000).toFixed(1);

  if (result.ok) {
    console.info(`OK in ${dt}s → ${result.file}`);
    if (existsSync(result.file)) unlinkSync(result.file);
    process.exit(0);
  } else {
    console.error(`FAIL in ${dt}s → ${result.reason}`);
    process.exit(1);
  }
}

void main();
