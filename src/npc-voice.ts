import type { Npc, World } from './types.ts';
import { timeOfDay } from './types.ts';

/** Stable hash of a string → non-negative integer (FNV-1a, 32-bit). */
function fnv32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Voice archetype examples: `[player_question, npc_answer]`. */
const ARCHETYPE_EXAMPLES: Record<string, [string, string][]> = {
  stoic: [
    ["Lovely day, isn't it?", 'Storm comes by dusk. Bring rope.'],
    ['How are you holding up?', 'Still standing.'],
    ['Do you ever worry?', 'Worry costs seconds. Costs lives.'],
  ],
  scholar: [
    [
      'Free for a chat?',
      "Briefly. The librarian's spirit notes — they need stamping. Can it wait until Thursday? Friday's worse.",
    ],
    [
      'What do you think of all this?',
      'Seventeen precedents. None resolved cleanly. I would not want your position.',
    ],
    [
      'Do you know anything about the threat?',
      'Three hypotheses. The second one worries me most. Where did you last see it?',
    ],
  ],
  blunt: [
    ['Do you have a moment?', 'No. Ask anyway.'],
    ["What's going on around here?", "Trouble. You're standing in it."],
    ['Can you help me?', 'Depends. What did you break?'],
  ],
  anxious: [
    [
      'Everything alright?',
      "Yes — no. Maybe. The east gate was unlocked this morning and nobody's explaining it.",
    ],
    [
      'Can I ask you something?',
      "Of course, just — keep your voice down? Someone was listening earlier, I'm almost certain.",
    ],
    [
      'Are you the right person to talk to?',
      'Probably not, but everyone else walked away. So. Yes. Ask me.',
    ],
  ],
  warm: [
    [
      'Good to see you.',
      'And you! Sit, I was just about to make tea. Terrible timing for a crisis, but here we are.',
    ],
    ['Could use some advice.', 'You came to the right place. Tell me everything, from the start.'],
    ['How are things?', 'Complicated. But you asked, so — come closer.'],
  ],
  direct: [
    ['What should I do?', 'What you already know you should do.'],
    ['Is this dangerous?', "Yes. Don't pretend otherwise."],
    ['Can we work something out?', "Name your terms. I'll tell you if they're acceptable."],
  ],
  impatient: [
    ['Got a second?', 'Half of one.'],
    ['Let me explain—', 'Thirty words. Go.'],
    ['What do you want from me?', 'Results. Quickly.'],
  ],
};

/** Map trait keywords to archetype keys. */
function archetypeFromTraits(personality: string[], flaws: string[]): string {
  const all = [...personality.map((s) => s.toLowerCase()), ...flaws.map((s) => s.toLowerCase())];
  if (
    all.some(
      (t) =>
        t.includes('stoic') ||
        t.includes('quiet') ||
        t.includes('reserved') ||
        t.includes('deadpan') ||
        t.includes('flat')
    )
  )
    return 'stoic';
  if (
    all.some(
      (t) =>
        t.includes('scholar') ||
        t.includes('analytic') ||
        t.includes('intellectual') ||
        t.includes('studious') ||
        t.includes('serious')
    )
  )
    return 'scholar';
  if (
    all.some(
      (t) =>
        t.includes('blunt') ||
        t.includes('harsh') ||
        t.includes('rude') ||
        t.includes('dismissive') ||
        t.includes('impatient') ||
        t.includes('sharp')
    )
  )
    return 'blunt';
  if (
    all.some(
      (t) =>
        t.includes('anxious') ||
        t.includes('nervous') ||
        t.includes('worr') ||
        t.includes('paranoid') ||
        t.includes('fearful')
    )
  )
    return 'anxious';
  if (
    all.some(
      (t) =>
        t.includes('warm') ||
        t.includes('kind') ||
        t.includes('empathetic') ||
        t.includes('nurturing') ||
        t.includes('earnest') ||
        t.includes('brave') ||
        t.includes('protective')
    )
  )
    return 'warm';
  if (
    all.some(
      (t) =>
        t.includes('direct') ||
        t.includes('honest') ||
        t.includes('pragmatic') ||
        t.includes('loyal') ||
        t.includes('casual')
    )
  )
    return 'direct';
  return 'impatient';
}

/**
 * 2–3 concrete diction rules + one seeded example exchange.
 * Same NPC always gets the same anchor (fnv32 of npc.id for selection).
 */
export function voiceFingerprint(npc: Npc): string {
  const personality = npc.traits?.personality ?? [];
  const values = npc.traits?.values ?? [];
  const flaws = npc.traits?.flaws ?? [];
  const all = [...personality, ...values, ...flaws].map((s) => s.toLowerCase());

  const cadenceTics: string[] = [];

  // Cadence rules derived from traits
  if (
    all.some(
      (t) =>
        t.includes('deadpan') || t.includes('flat') || t.includes('stoic') || t.includes('quiet')
    )
  )
    cadenceTics.push('clips sentences — never two words when one will do');
  if (all.some((t) => t.includes('serious') || t.includes('formal') || t.includes('analytic')))
    cadenceTics.push('no contractions; uses precise nouns over vague generalities');
  if (all.some((t) => t.includes('anxious') || t.includes('nervous') || t.includes('paranoid')))
    cadenceTics.push('trails off mid-thought with em-dashes; circles back to what worries them');
  if (
    all.some(
      (t) =>
        t.includes('blunt') || t.includes('harsh') || t.includes('rude') || t.includes('dismissive')
    )
  )
    cadenceTics.push('skips pleasantries entirely; answers what was asked, not what was meant');
  if (
    all.some(
      (t) =>
        t.includes('warm') ||
        t.includes('kind') ||
        t.includes('empathetic') ||
        t.includes('earnest')
    )
  )
    cadenceTics.push('names you in replies; asks a follow-up question before giving an opinion');
  if (all.some((t) => t.includes('impatient') || t.includes('sharp')))
    cadenceTics.push('interrupts long wind-ups with a shorter reframe');
  if (all.some((t) => t.includes('casual') || t.includes('direct') || t.includes('simple')))
    cadenceTics.push('plain vocabulary; no abstraction unless forced');
  if (all.some((t) => t.includes('loyal') || t.includes('duty') || t.includes('protective')))
    cadenceTics.push('references obligation before preference');

  // Pick at most 2 unique tics; if nothing matched, use a fallback
  const tics = [...new Set(cadenceTics)].slice(0, 2);
  if (tics.length === 0) tics.push('measured pace; neither rushes nor over-explains');

  const archetype = archetypeFromTraits(personality, flaws);
  const pool = ARCHETYPE_EXAMPLES[archetype] ?? ARCHETYPE_EXAMPLES['direct']!;
  const idx = fnv32(npc.id) % pool.length;
  const [q, a] = pool[idx]!;

  return [`Diction: ${tics.join('; ')}.`, `Example:`, `  Q: "${q}"`, `  A: "${a}"`].join('\n');
}

const TIME_PHRASES: Record<ReturnType<typeof timeOfDay>, string> = {
  dawn: 'first light, the streets still cold',
  day: 'midday, the world at full pace',
  dusk: 'dusk, the work day winding down',
  night: 'deep night, only patrols and drunks awake',
};

/** Infer what the NPC is physically doing right now from their role + intent. */
function currentActivity(npc: Npc): string {
  const intent = npc.plan?.currentIntent;
  if (intent) {
    switch (intent.kind) {
      case 'confront':
        return 'jaw set, looking for someone to confront';
      case 'investigate':
        return 'picking through details, distracted';
      case 'hide':
        return 'keeping close to the wall, scanning exits';
      case 'gossip':
        return 'leaning in, already mid-conversation';
      case 'move':
        return 'clearly about to leave';
      case 'trade':
        return 'weighing something in their hands';
      case 'help':
        return 'ready to act, watching for a signal';
      case 'avoid':
        return 'positioning themselves away from the crowd';
      case 'escalate':
        return 'coiled, voice lower than usual';
      default:
        break;
    }
  }
  // Fall back to role
  const role = (npc.role ?? '').toLowerCase();
  if (role.includes('merchant') || role.includes('vendor')) return 'arranging wares';
  if (role.includes('guard') || role.includes('soldier') || role.includes('warrior'))
    return 'watching the entrance';
  if (role.includes('innkeeper') || role.includes('bartender')) return 'wiping down the counter';
  if (role.includes('scholar') || role.includes('scribe') || role.includes('librarian'))
    return 'hunched over a ledger';
  if (role.includes('blacksmith') || role.includes('smith')) return 'sharpening a blade';
  if (role.includes('healer') || role.includes('doctor') || role.includes('physician'))
    return 'sorting supplies';
  if (role.includes('hero') || role.includes('adventurer') || role.includes('hunter'))
    return 'keeping alert';
  if (role.includes('patrol') || role.includes('officer')) return 'pacing the perimeter';
  return 'standing here';
}

/** One-line atmospheric summary of current world/NPC state. */
export function rightNowFor(world: World, npc: Npc): string {
  const parts: string[] = [];

  // Time of day
  parts.push(TIME_PHRASES[timeOfDay(world.clock)]);

  // Physical activity
  parts.push(currentActivity(npc));

  // Recent confrontation in last 10 ticks
  const recentConfrontation = (world.chronicle ?? []).find(
    (ev) =>
      ev.kind === 'confrontation' &&
      (ev.actorId === npc.id || ev.targetId === npc.id) &&
      ev.tick >= world.tick - 10
  );
  if (recentConfrontation) {
    parts.push('still breathing hard from the shouting match');
  } else {
    // Emotional weight: negative reflection memory or relationship vector
    const negativeReflection = npc.memories
      .filter((m) => m.meta?.tags?.includes('reflection') && (m.meta.emotionalWeight ?? 0) < 0)
      .sort((a, b) => (a.meta?.emotionalWeight ?? 0) - (b.meta?.emotionalWeight ?? 0))
      .at(0);
    if (negativeReflection) {
      // Trim to ≤60 chars for prompt brevity
      const snippet = negativeReflection.text.slice(0, 60).replace(/\n/g, ' ');
      parts.push(`carrying: "${snippet}"`);
    } else {
      const rel = npc.relationships?.['player'] ?? 0;
      const relLabel =
        rel <= -6
          ? 'freshly betrayed by you'
          : rel <= -3
            ? 'wary of you'
            : rel < 2
              ? 'reading you still'
              : rel < 5
                ? 'warm to you'
                : 'trusts you';
      parts.push(relLabel);
    }
  }

  return `RIGHT NOW: ${parts.join('; ')}.`;
}

/** Divergence nudges — at most 2, none if traits give no clear signal. */
export function divergenceNudges(npc: Npc): string[] {
  const personality = npc.traits?.personality ?? [];
  const flaws = npc.traits?.flaws ?? [];
  const all = [...personality, ...flaws].map((s) => s.toLowerCase());

  const nudges: string[] = [];

  // Map trait signals to nudge lines; use a set to dedup identical lines
  const seen = new Set<string>();
  const add = (line: string) => {
    if (!seen.has(line)) {
      seen.add(line);
      nudges.push(line);
    }
  };

  if (
    all.some(
      (t) =>
        t.includes('blunt') ||
        t.includes('direct') ||
        t.includes('harsh') ||
        t.includes('flat') ||
        t.includes('deadpan')
    )
  )
    add('DO NOT pad with apologies or hedge.');
  if (all.some((t) => t.includes('impatient') || t.includes('dismissive') || t.includes('sharp')))
    add('DO NOT pad with apologies or hedge.');
  if (
    all.some(
      (t) =>
        t.includes('scholar') ||
        t.includes('analytic') ||
        t.includes('serious') ||
        t.includes('formal') ||
        t.includes('intellectual')
    )
  )
    add('DO NOT speak in slogans or platitudes.');
  if (all.some((t) => t.includes('young') || t.includes('naive') || t.includes('inexperienced')))
    add('DO NOT lecture; ask first.');
  if (all.some((t) => t.includes('casual') || t.includes('simple') || t.includes('pragmatic')))
    add('DO NOT over-explain; make your point and stop.');
  if (all.some((t) => t.includes('paranoid') || t.includes('anxious') || t.includes('suspicious')))
    add('DO NOT reassure; your worry is earned.');
  if (all.some((t) => t.includes('proud') || t.includes('arrogant') || t.includes('confident')))
    add('DO NOT soften hard truths with false modesty.');

  return [...new Set(nudges)].slice(0, 2);
}
