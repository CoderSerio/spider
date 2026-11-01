// Keyboard state. The stage reads these every frame; nothing else writes to them.

const NAV_KEYS = new Set(['ShiftLeft', 'ShiftRight']);

export class Input {
  #held = new Set();
  #paused = false;
  #target;

  constructor(target = window) {
    this.#target = target;
    target.addEventListener('keydown', this.#onKeyDown);
    target.addEventListener('keyup', this.#onKeyUp);
  }

  get paused() {
    return this.#paused;
  }

  get throttle() {
    return this.#axis('KeyW', 'KeyS') || this.#axis('ArrowUp', 'ArrowDown');
  }

  get turn() {
    return this.#axis('KeyD', 'KeyA') || this.#axis('ArrowRight', 'ArrowLeft');
  }

  get lift() {
    return this.#axis('KeyR', 'KeyF');
  }

  get boost() {
    return this.#held.has('ShiftLeft') || this.#held.has('ShiftRight') ? 1 : 0;
  }

  dispose() {
    this.#target.removeEventListener('keydown', this.#onKeyDown);
    this.#target.removeEventListener('keyup', this.#onKeyUp);
    this.#held.clear();
  }

  #axis(positive, negative) {
    return (this.#held.has(positive) ? 1 : 0) - (this.#held.has(negative) ? 1 : 0);
  }

  #onKeyDown = (event) => {
    if (event.code === 'Space' && !event.repeat) {
      this.#paused = !this.#paused;
      event.preventDefault();
      return;
    }
    this.#held.add(event.code);
    if (Input.#steers(event.code)) event.preventDefault();
  };

  #onKeyUp = (event) => {
    this.#held.delete(event.code);
  };

  static #steers(code) {
    return code.startsWith('Arrow') || code.startsWith('Key') || NAV_KEYS.has(code);
  }
}
