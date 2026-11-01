import './styles/sheet.css';
import { Input } from './input.js';
import { Live } from './net.js';
import { Stage } from './stage.js';

const host = document.querySelector<HTMLElement>('#stage');
if (!host) throw new Error('Missing #stage host element');

const stage = new Stage(host);
const live = new Live();

new Input(window, (controls) => live.send({ type: 'input', ...controls }));

const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
live.connect(`${scheme}://${location.host}/ws`, (message) => stage.apply(message));
stage.start();
