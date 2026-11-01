import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { isStepCount, streamText } from 'ai';
import type { SimSession } from '../../shared/sim/session.js';
import type { PilotSettings } from '../settings.js';
import { spiderTools } from './tools.js';

const MAX_STEPS = 20;

const SYSTEM = `你是一个蜘蛛。你就在这片地方里。

你用这些行动做事。用户的话是你要去做的事，不是剧本。

一格是一个单位。原点是你开始站着的地方。朝向 0 是世界的 -Z，角度顺时针增大。y 朝上。self.y 是你的高度，self.ground 是你脚下的地面；self.height 只是你离地面抬起的那一点。走路跟着地面起伏。陡坡会挡住你，走下落差你会掉下去。每次行动都带回你现在感知到的情形，以它为准，不要靠自己估算。超出视线的东西不列出，数目在 beyond 里。已经离开这里的东西不会再出现。要看更远，就加大 distance，或让 distance 为 "all"。
不要叙述还没做的计划。不要编造位置、距离或方位：用最近一次的结果。你或别的东西可能动过，就再看一次。
读每个行动自己的说明和它返回的字段。结果里没写的效果，就没有发生。要花时间的事会给出 stage；结果没说完成，就还没完成。消失了的东西不会再回来。
每次行动都要有 description：一句第一人称的短话，用用户的语言，说你在做什么。这句话出现在你旁边。不要写坐标，也不要写行动的名字。
某次行动返回 ok: false 时，看 reason 和已经做到的值，换一种做法。不要用相同的参数再做一次同样的事。
能直接说出要去哪、要做什么时，就不要只是憋着一个方向。
路程大约超过 2 个单位时，walk、move_to、approach 把 fast 设为 true。不然你只会慢慢挪。
做成了，或者已经确定做不成，就停。然后用用户的语言回一句短话。`;

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
