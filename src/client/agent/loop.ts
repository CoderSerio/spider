import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { isStepCount, streamText } from 'ai';
import type { SimSession } from '../../shared/sim/session.js';
import type { PilotSettings } from '../settings.js';
import { spiderTools } from './tools.js';

const MAX_STEPS = 20;

const SYSTEM = `You act only by calling tools. The user's message is the goal, not a script.

One unit is one grid cell. The origin is where the body started. Heading 0 points at world -Z, and angles grow clockwise. Every tool returns that frame in observation; trust it over your own estimate. Entities past the look radius are omitted and counted in beyond. Call observe with a larger distance, or distance "all", to see them.
Do not narrate a plan you have not carried out. Do not invent positions, distances, or bearings: take them from the latest tool result, and look again when the body or a target may have moved.
Read each tool's documentation and the fields it returns. Do not assume an effect the result does not report.
Every call must include description: one short first-person sentence in the user's language saying what you are trying to do. That sentence is shown beside the spider. Do not put coordinates or tool names in it.
When a call returns ok: false, use its reason and any achieved value to choose a different call. Never send the same tool with the same arguments twice.
Prefer a tool that names a goal over holding raw controls.
Set fast to true on walk, move_to, or approach when the trip is longer than about 2 units. Without it the body only creeps.
Stop as soon as the goal is met, or as soon as you know it cannot be met. Then reply with one short sentence in the user's language.`;

export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; name: string; input: unknown }
  | { type: 'tool-result'; name: string; output: unknown }
  | { type: 'error'; message: string };

export interface RunAgentOptions {
  goal: string;
  session: SimSession;
  settings: PilotSettings;
  signal?: AbortSignal;
  onEvent?: (event: AgentEvent) => void;
}

/**
 * One agent turn in the page. The model calls the local tools; each tool
 * drives the simulation until it finishes, then the loop continues.
 */
export async function runAgent({
  goal,
  session,
  settings,
  signal,
  onEvent,
}: RunAgentOptions): Promise<string> {
  const provider = createOpenAICompatible({
    name: 'openai-compatible',
    baseURL: settings.baseURL,
    apiKey: settings.apiKey,
  });

  signal?.addEventListener('abort', () => session.cancel(), { once: true });

  const result = streamText({
    model: provider(settings.model),
    system: SYSTEM,
    prompt: goal,
    tools: spiderTools(session),
    stopWhen: isStepCount(MAX_STEPS),
    abortSignal: signal,
    toolCallConcurrency: 1,
  });

  let answer = '';
  for await (const part of result.fullStream) {
    if (signal?.aborted) break;
    switch (part.type) {
      case 'text-delta':
        answer += part.text;
        onEvent?.({ type: 'text', text: part.text });
        break;
      case 'tool-call':
        onEvent?.({ type: 'tool-call', name: part.toolName, input: part.input });
        break;
      case 'tool-result':
        onEvent?.({ type: 'tool-result', name: part.toolName, output: part.output });
        break;
      case 'tool-error':
        onEvent?.({
          type: 'error',
          message: `${part.toolName}：${part.error instanceof Error ? part.error.message : String(part.error)}`,
        });
        break;
      case 'error':
        onEvent?.({ type: 'error', message: errorText(part.error) });
        break;
      default:
        break;
    }
  }
  return answer;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
