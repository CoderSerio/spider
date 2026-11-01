import type { Controls } from './types';

const NAV_KEYS = new Set(['ShiftLeft', 'ShiftRight']);

/** Keyboard state. The stage reads these every frame; nothing else writes to them. */
export class Input implements Controls {
  #held = new Set<string>();
  #paused = false;
  #target: Window;

  constructor(target: Window = window) {
    this.#target = target;
    target.addEventListener('keydown', this.#onKeyDown);
    target.addEventListener('keyup', this.#onKeyUp);
  }

  get paused(): boolean {
    return this.#paused;
  }

  get throttle(): number {
    return this.#axis('KeyW', 'KeyS') || this.#axis('ArrowUp', 'ArrowDown');
  }

  get turn(): number {
    return this.#axis('KeyD', 'KeyA') || this.#axis('ArrowRight', 'ArrowLeft');
  }

  get lift(): number {
    return this.#axis('KeyR', 'KeyF');
  }

  get boost(): number {
    return this.#held.has('ShiftLeft') || this.#held.has('ShiftRight') ? 1 : 0;
  }

  dispose(): void {
    this.#target.removeEventListener('keydown', this.#onKeyDown);
    this.#target.removeEventListener('keyup', this.#onKeyUp);
    this.#held.clear();
  }

  #axis(positive: string, negative: string): number {
    return (this.#held.has(positive) ? 1 : 0) - (this.#held.has(negative) ? 1 : 0);
  }

  #onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Space' && !event.repeat) {
      this.#paused = !this.#paused;
      event.preventDefault();
      return;
    }
    this.#held.add(event.code);
    if (Input.#steers(event.code)) event.preventDefault();
  };

  #onKeyUp = (event: KeyboardEvent): void => {
    this.#held.delete(event.code);
  };

  static #steers(code: string): boolean {
    return code.startsWith('Arrow') || code.startsWith('Key') || NAV_KEYS.has(code);
  }
}
