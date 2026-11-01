import { loadSettings } from '../settings.js';
import { runAgent } from './loop.js';

const settings = loadSettings();
const goal = process.argv.slice(2).join(' ').trim() || '吃掉场景里的苹果。';

console.log(`模型：${settings.agent.provider}/${settings.agent.model}`);
console.log(`目标：${goal}\n`);

const answer = await runAgent({
  goal,
  settings,
  onEvent(event) {
    switch (event.type) {
      case 'text':
        process.stdout.write(event.text);
        break;
      case 'tool-call':
        console.log(`\n→ ${event.name} ${JSON.stringify(event.input)}`);
        break;
      case 'tool-result':
        console.log(`← ${JSON.stringify(event.output).slice(0, 240)}`);
        break;
      case 'error':
        console.error(`\n! ${event.message}`);
        break;
      default:
        break;
    }
  },
});

console.log(`\n\n${answer}`);
