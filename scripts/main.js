import { Input } from './input.js';
import { Stage } from './stage.js';

const input = new Input(window);
const stage = new Stage(document.getElementById('stage'), input);

stage.start();
