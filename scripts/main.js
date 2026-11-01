import { mountScene } from './scene.js';
import { state } from './state.js';

mountScene(document.getElementById('stage'));

const held = new Set();

window.addEventListener('keydown', (event) => {
  held.add(event.code);
  if (event.code === 'Space') {
    state.paused = !state.paused;
    event.preventDefault();
  }
  if (event.code.startsWith('Arrow')) event.preventDefault();
  applyKeys();
});

window.addEventListener('keyup', (event) => {
  held.delete(event.code);
  applyKeys();
});

function applyKeys() {
  state.turn = (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0);
  if (held.has('ArrowUp')) state.speed = 1.7;
  else if (held.has('ArrowDown')) state.speed = 0.35;
  else state.speed = 1.15;
}
