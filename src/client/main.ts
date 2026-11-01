import './styles/sheet.css';
import { Input } from './input';
import { Stage } from './stage';

const host = document.querySelector<HTMLElement>('#stage');
if (!host) throw new Error('Missing #stage host element');

const input = new Input(window);
const stage = new Stage(host, input);

stage.start();
