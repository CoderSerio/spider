import { mountScene } from './scene.js';
import { state } from './state.js';

mountScene(document.getElementById('stage'));

const held = new Set();

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space' && !event.repeat) {
    state.paused = !state.paused;
    event.preventDefault();
    return;
  }
  held.add(event.code);
  if (steerKey(event.code)) event.preventDefault();
  applyKeys();
});

window.addEventListener('keyup', (event) => {
  held.delete(event.code);
  applyKeys();
});

function steerKey(code) {
  return code.startsWith('Arrow') || code.startsWith('Key') || code === 'ShiftLeft' || code === 'ShiftRight';
}

function axis(pos, neg) {
  return (held.has(pos) ? 1 : 0) - (held.has(neg) ? 1 : 0);
}

function applyKeys() {
  state.throttle = axis('KeyW', 'KeyS') || axis('ArrowUp', 'ArrowDown');
  state.turn = axis('KeyD', 'KeyA') || axis('ArrowRight', 'ArrowLeft');
  state.lift = axis('KeyR', 'KeyF');
  state.boost = held.has('ShiftLeft') || held.has('ShiftRight') ? 1 : 0;
}
