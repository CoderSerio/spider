import './styles/sheet.css';
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

mountPanel(document, session, stage);

window.addEventListener('pagehide', () => {
  session.stop();
  stage.dispose();
});
