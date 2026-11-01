import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { loadSettings } from '../settings.js';
import { describeResult, describeTool } from './describe.js';
import { runAgent } from './loop.js';

const settings = loadSettings();
const oneShot = process.argv.slice(2).join(' ').trim();

if (oneShot) {
  await walkThrough(oneShot);
} else {
  const rl = createInterface({ input: stdin, output: stdout });
  console.log(`机械蛛 · ${settings.agent.provider}/${settings.agent.model}`);
  console.log('输入目标后回车执行，直接回车退出。');

  for (;;) {
    const goal = (await rl.question('\n目标 › ')).trim();
    if (!goal) break;
    await walkThrough(goal);
  }

  rl.close();
}

async function walkThrough(goal: string): Promise<void> {
  console.log(`\n▸ ${goal}`);
  try {
    const answer = await runAgent({
      goal,
      settings,
      onEvent(event) {
        switch (event.type) {
          case 'tool-call':
            console.log(`   ${describeTool(event.name, event.input as Record<string, unknown> | undefined)}`);
            break;
          case 'tool-result':
            console.log(`   · ${describeResult(event.output)}`);
            break;
          case 'error':
            console.error(`   ! ${event.message}`);
            break;
          default:
            break;
        }
      },
    });
    console.log(`\n${answer.trim()}\n`);
  } catch (error) {
    console.error(`\n失败：${error instanceof Error ? error.message : String(error)}\n`);
  }
}
