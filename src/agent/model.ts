import { createDeepSeek } from '@ai-sdk/deepseek';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { gateway, type LanguageModel } from 'ai';
import type { AgentSettings } from '../settings.js';

/** Turns the configured provider into a model the AI SDK can call. */
export function makeModel(agent: AgentSettings): LanguageModel {
  switch (agent.provider) {
    case 'gateway':
      return gateway(agent.model);
    case 'deepseek': {
      const provider = createDeepSeek({
        apiKey: agent.apiKey,
        ...(agent.baseURL ? { baseURL: agent.baseURL } : {}),
      });
      return provider(agent.model);
    }
    default: {
      const provider = createOpenAICompatible({
        name: 'openai-compatible',
        baseURL: agent.baseURL ?? 'https://api.openai.com/v1',
        apiKey: agent.apiKey,
      });
      return provider(agent.model);
    }
  }
}
