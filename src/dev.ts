import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { loadSettings } from './settings.js';

// One command for the whole loop: build watcher, authoritative server, and the
// prompt in this same terminal. Ctrl-C takes all of it down.

const { port } = loadSettings().server;

const children = [
  spawn('pnpm', ['exec', 'vite', 'build', '--watch'], { stdio: 'inherit' }),
  spawn('pnpm', ['exec', 'tsx', 'watch', 'src/server/index.ts'], { stdio: 'inherit' }),
];

const stop = (): void => {
  for (const child of children) child.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

let up = false;
for (let attempt = 0; attempt < 60 && !up; attempt++) {
  await sleep(250);
  try {
    up = (await fetch(`http://localhost:${port}/api/health`)).ok;
  } catch {
    // Server still booting.
  }
}

if (!up) {
  console.error(`服务没有在 ${port} 端口起来，先看上面的日志。`);
  process.exit(1);
}

await import('./agent/cli.js');
