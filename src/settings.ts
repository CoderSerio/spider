import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

export type Provider = 'deepseek' | 'gateway' | 'openai-compatible';

export interface AgentSettings {
  provider: Provider;
  model: string;
  apiKey?: string;
  /** Only needed for self-hosted or proxy endpoints. */
  baseURL?: string;
  maxSteps: number;
}

export interface AppSettings {
  agent: AgentSettings;
  server: { port: number };
}

const DEFAULTS: AppSettings = {
  agent: { provider: 'deepseek', model: 'deepseek-chat', maxSteps: 20 },
  server: { port: 3000 },
};

const KEY_ENV: Record<Provider, string> = {
  deepseek: 'DEEPSEEK_API_KEY',
  gateway: 'AI_GATEWAY_API_KEY',
  'openai-compatible': 'OPENAI_API_KEY',
};

/**
 * Reads config.yaml from the working directory (or CONFIG_PATH). Environment
 * variables win where they make sense, so a key never has to be written down.
 */
export function loadSettings(): AppSettings {
  const path = resolve(process.env.CONFIG_PATH ?? 'config.yaml');
  const raw = existsSync(path) ? (parse(readFileSync(path, 'utf8')) as Partial<AppSettings> | null) : null;

  const agent: AgentSettings = { ...DEFAULTS.agent, ...(raw?.agent ?? {}) };
  agent.apiKey = agent.apiKey || process.env[KEY_ENV[agent.provider]] || undefined;
  if (!agent.baseURL) delete agent.baseURL;

  return {
    agent,
    server: { port: Number(process.env.PORT ?? raw?.server?.port ?? DEFAULTS.server.port) },
  };
}
