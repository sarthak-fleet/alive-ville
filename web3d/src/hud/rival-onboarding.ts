export const RIVAL_WORLD_ID = 'rival_duel';
export const RIVAL_GUIDE_VERSION = 1;

export const RIVAL_GUIDE_ACTION_STEPS = ['move', 'talk', 'fight', 'consequence'] as const;
export type RivalGuideActionStep = (typeof RIVAL_GUIDE_ACTION_STEPS)[number];
export type RivalGuideStep = RivalGuideActionStep | 'complete' | 'dismissed';

export interface RivalGuideSignals {
  moved?: boolean;
  kaelDialogueOpen?: boolean;
  kaelCombatStarted?: boolean;
  consequenceVisible?: boolean;
}

interface RivalGuideRecord {
  version: typeof RIVAL_GUIDE_VERSION;
  step: RivalGuideStep;
}

export interface RivalGuideStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function browserRivalGuideStorage(): RivalGuideStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const VALID_STEPS = new Set<RivalGuideStep>([...RIVAL_GUIDE_ACTION_STEPS, 'complete', 'dismissed']);

export function rivalGuideStorageKey(worldId = RIVAL_WORLD_ID): string {
  return `aliveville:rival-guide:v${RIVAL_GUIDE_VERSION}:${worldId}`;
}

export function parseRivalGuideRecord(raw: string | null): RivalGuideRecord | null {
  if (!raw) return null;
  try {
    const candidate = JSON.parse(raw) as Partial<RivalGuideRecord>;
    if (
      candidate.version !== RIVAL_GUIDE_VERSION ||
      typeof candidate.step !== 'string' ||
      !VALID_STEPS.has(candidate.step as RivalGuideStep)
    ) {
      return null;
    }
    return { version: RIVAL_GUIDE_VERSION, step: candidate.step as RivalGuideStep };
  } catch {
    return null;
  }
}

export function loadRivalGuideStep(
  storage: RivalGuideStorage | null,
  worldId = RIVAL_WORLD_ID
): RivalGuideStep {
  if (!storage) return 'move';
  try {
    return parseRivalGuideRecord(storage.getItem(rivalGuideStorageKey(worldId)))?.step ?? 'move';
  } catch {
    return 'move';
  }
}

export function saveRivalGuideStep(
  storage: RivalGuideStorage | null,
  step: RivalGuideStep,
  worldId = RIVAL_WORLD_ID
): boolean {
  if (!storage) return false;
  try {
    const record: RivalGuideRecord = { version: RIVAL_GUIDE_VERSION, step };
    storage.setItem(rivalGuideStorageKey(worldId), JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function shouldAutostartAgentLoop(
  worldId: string,
  storage: RivalGuideStorage | null
): boolean {
  return worldId !== RIVAL_WORLD_ID || loadRivalGuideStep(storage, worldId) === 'dismissed';
}

/** Advance exactly one gate. A later signal cannot skip an unobserved earlier action. */
export function advanceRivalGuide(
  current: RivalGuideStep,
  signals: RivalGuideSignals
): RivalGuideStep {
  if (current === 'move' && signals.moved) return 'talk';
  if (current === 'talk' && signals.kaelDialogueOpen) return 'fight';
  if (current === 'fight' && signals.kaelCombatStarted) return 'consequence';
  if (current === 'consequence' && signals.consequenceVisible) return 'complete';
  return current;
}

export function rivalGuideStepNumber(step: RivalGuideStep): number {
  if (step === 'complete' || step === 'dismissed') return RIVAL_GUIDE_ACTION_STEPS.length;
  return RIVAL_GUIDE_ACTION_STEPS.indexOf(step) + 1;
}
