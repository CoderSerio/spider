import { mountScene } from './scene.js';
import { state } from './state.js';

mountScene(document.getElementById('stage'));

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space') {
    state.paused = !state.paused;
    event.preventDefault();
  } else if (event.code === 'ArrowUp') {
    state.curl = Math.min(1.4, state.curl + 0.08);
    event.preventDefault();
  } else if (event.code === 'ArrowDown') {
    state.curl = Math.max(-0.8, state.curl - 0.08);
    event.preventDefault();
  } else if (event.key === 'n' || event.key === 'N') {
    state.curl = ((Math.floor(state.time * 10) % 7) - 3) * 0.18;
  }
});
