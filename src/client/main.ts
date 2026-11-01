import './styles/sheet.css';
import { Input } from './input.js';
import { mountPanel } from './panel.js';
import { Stage } from './stage.js';
import { SimSession } from '../shared/sim/session.js';

const host = document.querySelector<HTMLElement>('#stage');
if (!host) throw new Error('Missing #stage host element');

const session = new SimSession();

const stage = new Stage(host, session.spider);
stage.bind(
  (dt) => session.frame(dt),
  () => session.world,
);
stage.start();

const input = new Input(window, (controls) => session.setHumanInput(controls));
mountPanel(document, session, stage);

window.addEventListener('pagehide', () => {
  session.stop();
  input.dispose();
  stage.dispose();
});
