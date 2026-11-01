import './styles/sheet.css';
import type { AgentEvent } from '../shared/protocol.js';
import { Input } from './input.js';
import { Live } from './net.js';
import { Stage } from './stage.js';

const host = document.querySelector<HTMLElement>('#stage');
if (!host) throw new Error('Missing #stage host element');

const stage = new Stage(host);
const live = new Live();

new Input(
  window,
  (controls) => live.send({ type: 'input', ...controls }),
  (paused) => live.send({ type: 'pause', paused }),
);

const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
live.connect(`${scheme}://${location.host}/ws`, (message) => stage.apply(message));
stage.start();

const form = document.querySelector<HTMLFormElement>('#agent-form');
const goalInput = document.querySelector<HTMLInputElement>('#agent-goal');
const log = document.querySelector<HTMLElement>('#agent-log');

if (form && goalInput && log) {
  const panel = log;
  let say: HTMLElement | null = null;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const goal = goalInput.value.trim();
    if (goal) void runGoal(goal);
  });

  async function runGoal(goal: string): Promise<void> {
    panel.replaceChildren();
    say = null;
    append('goal', goal);

    const response = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goal }),
    });
    if (!response.ok || !response.body) {
      append('error', `请求失败：${response.status}`);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) handle(JSON.parse(line) as AgentEvent);
      }
    }
  }

  function handle(event: AgentEvent): void {
    switch (event.type) {
      case 'text':
        appendText(event.text);
        break;
      case 'tool-call':
        say = null;
        append('tool', `${event.name} ${compact(event.input)}`);
        break;
      case 'tool-result':
        append('result', compact(event.output));
        break;
      case 'error':
        append('error', event.message);
        break;
      case 'done':
        say = null;
        append('done', event.text);
        break;
    }
  }

  function appendText(text: string): void {
    if (!say) {
      say = document.createElement('p');
      say.className = 'say';
      panel.append(say);
    }
    say.textContent += text;
    panel.scrollTop = panel.scrollHeight;
  }

  function append(kind: string, text: string): void {
    const row = document.createElement('p');
    row.className = kind;
    row.textContent = text;
    panel.append(row);
    panel.scrollTop = panel.scrollHeight;
  }
}

function compact(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 160 ? `${text.slice(0, 160)}…` : text;
}
