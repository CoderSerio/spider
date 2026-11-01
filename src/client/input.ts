import type { Controls } from '../shared/types.js';

const NAV_KEYS = new Set(['ShiftLeft', 'ShiftRight']);

/** Keyboard state, pushed to the server as it changes. The page is a viewer. */
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
    this.#held.add(event.code);
    if (Input.#steers(event.code)) event.preventDefault();
    this.#onInput(this.#controls());
  };

  #onKeyUp = (event: KeyboardEvent): void => {
    this.#held.delete(event.code);
    this.#onInput(this.#controls());
  };

  static #steers(code: string): boolean {
    return code.startsWith('Arrow') || code.startsWith('Key') || NAV_KEYS.has(code);
  }
}
