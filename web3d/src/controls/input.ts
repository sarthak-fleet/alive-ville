import { combatInput } from '../combat/player-fsm.ts';

export interface InputState {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  run: boolean;
}

export const input: InputState = {
  forward: false,
  back: false,
  left: false,
  right: false,
  run: false,
};

const KEY_MAP: Record<string, keyof InputState> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'run',
  ShiftRight: 'run',
};

export function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

export function attachInput(): () => void {
  const down = (event: KeyboardEvent) => {
    if (isTypingTarget(event.target)) return;
    if (!event.repeat) {
      if (event.code === 'KeyF') combatInput.attackPressed = true;
      if (event.code === 'Space') combatInput.dodgePressed = true;
      if (event.code === 'KeyQ') combatInput.lockPressed = true;
    }
    const key = KEY_MAP[event.code];
    if (key) input[key] = true;
  };
  const up = (event: KeyboardEvent) => {
    const key = KEY_MAP[event.code];
    if (key) input[key] = false;
  };
  const blur = () => {
    input.forward = input.back = input.left = input.right = input.run = false;
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
  };
}
