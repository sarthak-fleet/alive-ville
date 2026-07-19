export type CombatAnimKind = 'attack1' | 'attack2' | 'attack3' | 'dodge' | 'hit' | 'telegraph';

export interface CharacterAnimationHandle {
  /** speed in m/s; 0 = idle */
  setSpeed: (speed: number) => void;
  /** play a short combat animation overlay */
  trigger: (kind: CombatAnimKind) => void;
  /** enter/leave the defeated pose (rig plays Death01; procedural lies down) */
  setDefeated: (defeated: boolean) => void;
  /** brief red damage flash (optional) */
  flash?: () => void;
  /** orange emissive pulse for enemy wind-up telegraph (optional) */
  setTelegraph?: (active: boolean) => void;
  /** conversational idle while a dialogue is open (optional) */
  setTalking?: (talking: boolean) => void;
  /** one-shot non-combat gesture (optional; rig only) */
  gesture?: (kind: 'pickup' | 'interact') => void;
}
