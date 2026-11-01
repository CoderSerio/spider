import { createMCPClient } from '@ai-sdk/mcp';
import { isStepCount, streamText } from 'ai';
import { loadSettings, type AppSettings } from '../settings.js';
import type { AgentEvent } from '../shared/protocol.js';
import { makeModel } from './model.js';

const SYSTEM = `You pilot a mechanical spider in a small grid world.
Achieve the user's goal by calling tools, not by describing what you would do.
Always observe before acting: distances and bearings come from observe, never guess them.
To act on something, use approach to get within reach, then the matching action
(an apple is eaten with eat). If a tool returns ok: false, read its reason and the
achieved value before retrying, and never repeat the same failing call twice.
Stop as soon as the goal is met, then reply with one short sentence.`;

export interface RunAgentOptions {
  goal: string;
  mcpUrl?: string;
  maxSteps?: number;
  settings?: AppSettings;
  onEvent?: (event: AgentEvent) => void;
}

/** One agent turn: connect to the MCP server, let the model use its tools. */
export async function runAgent({
  goal,
  mcpUrl = process.env.MCP_URL ?? 'http://localhost:3000/mcp',
  maxSteps,
  settings = loadSettings(),
  onEvent,
}: RunAgentOptions): Promise<string> {
  const client = await createMCPClient({ transport: { type: 'http', url: mcpUrl } });
  try {
    const tools = await client.tools();
    const result = streamText({
      model: makeModel(settings.agent),
      system: SYSTEM,
      prompt: goal,
      tools,
      stopWhen: isStepCount(maxSteps ?? settings.agent.maxSteps),
    });

    let answer = '';
    for await (const part of result.fullStream) {
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
        case 'error':
          onEvent?.({ type: 'error', message: String(part.error) });
          break;
        default:
          break;
      }
    }
    return answer;
  } finally {
    await client.close();
  }
}
