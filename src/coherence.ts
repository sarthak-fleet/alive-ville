import type { AgentGoalKind, Npc, World } from './types.ts';

export interface CoherenceContext {
  /** The player's message that prompted this candidate reply. */
  playerText: string;
}

export type CoherenceResult = { ok: true } | { ok: false; violations: string[]; hint: string };

/**
 * Lightweight pre-flight validator: compares what an NPC is about to say
 * against canonical world state.  All checks are deterministic string/keyword
 * matching — no LLM call.
 *
 * Checks:
 *   1. Location — don't explicitly claim to be somewhere they're not.
 *   2. Active goal — don't assert peace/friendship with a target they're
 *      walking to confront/harm.
 *   3. Presence — don't claim to be alone when others are here; don't name
 *      someone as present who isn't.
 *   4. Memory denial — don't deny a high-importance event they remember.
 *   5. Identity — don't contradict standing beliefs from reflections.
 */
export function checkCoherence(
  world: World,
  npc: Npc,
  candidate: string,
  _ctx: CoherenceContext
): CoherenceResult {
  const violations: string[] = [];
  const lower = candidate.toLowerCase();

  checkLocation(world, npc, lower, violations);
  checkGoal(world, npc, lower, violations);
  checkPresence(world, npc, lower, violations);
  checkMemoryDenial(npc, lower, violations);
  checkBeliefs(npc, lower, violations);
  checkFourthWall(lower, violations);

  if (violations.length === 0) return { ok: true };
  return {
    ok: false,
    violations,
    hint: `COHERENCE CORRECTION: the following facts must be respected:\n${violations.map((v) => `- ${v}`).join('\n')}`,
  };
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

// "4th wall" immersion boundary (Inworld pattern): an NPC must never reveal it
// is an AI/model/program or reference the real world — that instantly breaks the
// fiction for the player. A hit forces the coherence retry with a correction hint.
const FOURTH_WALL_PATTERNS: RegExp[] = [
  /\bas an ai\b/,
  /\b(?:language|ai) model\b/,
  /\bi(?:'m| am) (?:an ai|a bot|a chatbot|a program|an assistant|a virtual|an artificial)\b/,
  /\bmy (?:training data|programming|dataset|prompt)\b/,
  /\bi (?:was|am) (?:trained|programmed|designed) (?:to|on|by)\b/,
  /\bopenai\b|\bchatgpt\b|\blarge language model\b|\bllm\b/,
];

function checkFourthWall(lower: string, violations: string[]): void {
  if (FOURTH_WALL_PATTERNS.some((pattern) => pattern.test(lower))) {
    violations.push(
      'Never break character or admit to being an AI/model/program — you ARE this character, fully in-world.'
    );
  }
}

/** Patterns that explicitly assert the speaker's location. */
const SELF_LOCATION_PATTERNS = [
  /\bi(?:'m| am)\s+(?:here\s+)?(?:at|in)\s+([\w\s''-]+)/,
  /\bstanding\s+(?:here\s+)?(?:at|in)\s+([\w\s''-]+)/,
  /\bi\s+(?:live|work|stay)\s+(?:at|in)\s+([\w\s''-]+)/,
];

function checkLocation(world: World, npc: Npc, lower: string, violations: string[]): void {
  const actualLoc = world.locations.find((loc) => loc.id === npc.locationId);
  if (!actualLoc) return;
  const actualName = actualLoc.name.toLowerCase();

  for (const pattern of SELF_LOCATION_PATTERNS) {
    const match = lower.match(pattern);
    if (!match) continue;
    const claimed = match[1]!.trim();
    if (claimed === actualName) continue;
    // Only flag if another real location's name appears in the claimed text
    const claimedLoc = world.locations.find(
      (loc) => claimed.includes(loc.name.toLowerCase()) && loc.id !== npc.locationId
    );
    if (claimedLoc) {
      violations.push(`You are at "${actualLoc.name}", not "${claimedLoc.name}".`);
    }
  }
}

/** Goal-kind keywords whose opposites signal a contradiction. */
const HOSTILE_GOAL_KINDS: AgentGoalKind[] = ['harm'];
const PEACEFUL_PHRASES = [
  'at peace with',
  'we are friends',
  'i have forgiven',
  'everything is fine between us',
  'no problem with',
  'nothing against',
];

function checkGoal(world: World, npc: Npc, lower: string, violations: string[]): void {
  const hostileGoals = (npc.ambitions ?? []).filter(
    (goal) => HOSTILE_GOAL_KINDS.includes(goal.kind) && (goal.status ?? 'active') === 'active'
  );
  if (hostileGoals.length === 0) return;

  // Resolve target IDs to names so we match what the LLM actually says.
  const targets = hostileGoals
    .map((goal) => {
      const targetId = goal.targetId;
      if (!targetId) return null;
      const targetNpc = world.npcs.find((n) => n.id === targetId);
      return targetNpc ? { id: targetId, name: targetNpc.name.toLowerCase() } : null;
    })
    .filter((t): t is { id: string; name: string } => t !== null);

  if (targets.length === 0) return;

  for (const phrase of PEACEFUL_PHRASES) {
    if (!lower.includes(phrase)) continue;
    for (const target of targets) {
      if (lower.includes(target.name)) {
        violations.push(
          `You have an active "harm" goal targeting ${target.name} — don't claim peace with them.`
        );
      }
    }
  }
}

const ALONE_PHRASES = [
  'i am alone',
  "i'm alone",
  'there is no one',
  "there's no one",
  'nobody else is here',
  'no one else is here',
];

function checkPresence(world: World, npc: Npc, lower: string, violations: string[]): void {
  const presentNpcs = world.npcs.filter(
    (other) => other.id !== npc.id && other.locationId === npc.locationId
  );
  const presentNames = presentNpcs.map((other) => other.name.toLowerCase());

  // "Alone" claims only contradict when OTHER NPCs are present; talking to the
  // player face-to-face while saying "just us two" is coherent.
  if (presentNames.length > 0) {
    for (const phrase of ALONE_PHRASES) {
      if (lower.includes(phrase)) {
        violations.push(`You are not alone — also present: ${presentNames.join(', ')}.`);
        break;
      }
    }
  }

  // Don't reference a named NPC as present ("X is here with me") if they're not
  const absentNpcs = world.npcs.filter(
    (other) => other.id !== npc.id && other.locationId !== npc.locationId
  );
  for (const absent of absentNpcs) {
    const absentLower = absent.name.toLowerCase();
    // Only flag "X is here" / "X is with me" — not bare name mentions
    const presentClaim = new RegExp(
      `\\b${escapeRegex(absentLower)}\\s+is\\s+(?:here|with\\s+(?:me|us))`
    );
    if (presentClaim.test(lower)) {
      violations.push(
        `${absent.name} is not here (they are at "${locationNameById(world, absent.locationId)}").`
      );
    }
  }
}

/** High-importance memories the NPC can't plausibly deny. */
const DENIAL_PHRASES = [
  'that never happened',
  "i don't remember that",
  'i have no memory of',
  'nothing happened',
  'i never did that',
  "that didn't happen",
];
const HIGH_IMPORTANCE_THRESHOLD = 6;

function checkMemoryDenial(npc: Npc, lower: string, violations: string[]): void {
  const highImportance = npc.memories.filter(
    (mem) => (mem.meta?.importance ?? 0) >= HIGH_IMPORTANCE_THRESHOLD
  );
  if (highImportance.length === 0) return;

  for (const phrase of DENIAL_PHRASES) {
    if (!lower.includes(phrase)) continue;
    // Flag if any high-importance memory keywords overlap with nearby context
    for (const mem of highImportance) {
      const memKeywords = significantWords(mem.text);
      const candKeywords = significantWords(lower);
      const overlap = memKeywords.filter((word) => candKeywords.includes(word));
      if (overlap.length >= 2) {
        violations.push(`You have a memory of: "${mem.text.slice(0, 80)}" — don't deny it.`);
        break;
      }
    }
    break;
  }
}

/** Reflection-tagged memories represent crystallized beliefs — don't contradict them. */
const CONTRADICTION_PREFIXES = [
  'i never',
  "i don't",
  'i do not',
  "i haven't",
  'i have never',
  "that's not who i am",
];

function checkBeliefs(npc: Npc, lower: string, violations: string[]): void {
  const beliefs = npc.memories.filter((mem) => mem.meta?.tags?.includes('reflection'));
  if (beliefs.length === 0) return;

  for (const belief of beliefs) {
    const beliefWords = significantWords(belief.text.toLowerCase());
    if (beliefWords.length < 3) continue;

    for (const prefix of CONTRADICTION_PREFIXES) {
      if (!lower.includes(prefix)) continue;
      // The phrase after the contradiction prefix
      const afterIdx = lower.indexOf(prefix) + prefix.length;
      const fragment = lower.slice(afterIdx, afterIdx + 60);
      const fragWords = significantWords(fragment);
      const overlap = beliefWords.filter((w) => fragWords.includes(w));
      if (overlap.length >= 2) {
        violations.push(
          `You hold the belief: "${belief.text.slice(0, 80)}" — don't contradict it.`
        );
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'i',
  'me',
  'my',
  'we',
  'our',
  'you',
  'your',
  'it',
  'its',
  'is',
  'am',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'to',
  'of',
  'in',
  'at',
  'by',
  'for',
  'on',
  'with',
  'that',
  'this',
  'and',
  'or',
  'but',
  'not',
  'no',
  'so',
  'if',
  'as',
  'up',
  'out',
  'from',
  'into',
]);

function significantWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function locationNameById(world: World, locationId: string): string {
  return world.locations.find((loc) => loc.id === locationId)?.name ?? locationId;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
