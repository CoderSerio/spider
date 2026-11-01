import type { Controls } from '../shared/types.js';

const NAV_KEYS = new Set(['ShiftLeft', 'ShiftRight']);

/** Keyboard state for the local simulation. Typing in the page chrome is left alone. */
export class Input {
  #held = new Set<string>();
  readonly #target: Window;
  readonly #onInput: (controls: Controls) => void;

  constructor(target: Window, onInput: (controls: Controls) => void) {
    this.#target = target;
    this.#onInput = onInput;
    target.addEventListener('keydown', this.#onKeyDown);
    target.addEventListener('keyup', this.#onKeyUp);
  }

  dispose(): void {
    this.#target.removeEventListener('keydown', this.#onKeyDown);
    this.#target.removeEventListener('keyup', this.#onKeyUp);
    this.#held.clear();
  }

  #controls(): Controls {
    return {
      throttle: this.#axis('KeyW', 'KeyS') || this.#axis('ArrowUp', 'ArrowDown'),
      turn: this.#axis('KeyD', 'KeyA') || this.#axis('ArrowRight', 'ArrowLeft'),
      lift: this.#axis('KeyR', 'KeyF'),
      boost: this.#held.has('ShiftLeft') || this.#held.has('ShiftRight') ? 1 : 0,
    };
  }

  #axis(positive: string, negative: string): number {
    return (this.#held.has(positive) ? 1 : 0) - (this.#held.has(negative) ? 1 : 0);
  }

  #onKeyDown = (event: KeyboardEvent): void => {
    if (Input.#typing(event)) return;
    this.#held.add(event.code);
    if (Input.#steers(event.code)) event.preventDefault();
    this.#onInput(this.#controls());
  };

  #onKeyUp = (event: KeyboardEvent): void => {
    this.#held.delete(event.code);
    if (Input.#typing(event)) return;
    this.#onInput(this.#controls());
  };

  /** Forms and the settings dialog must receive letters, including W A S D. */
  static #typing(event: KeyboardEvent): boolean {
    const target = event.target;
    return target instanceof Element && Boolean(target.closest('input, textarea, select, dialog'));
  }

  static #steers(code: string): boolean {
    return code.startsWith('Arrow') || code.startsWith('Key') || NAV_KEYS.has(code);
  }
}
