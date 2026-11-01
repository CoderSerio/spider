import type { FastifyInstance } from 'fastify';
import type { AgentEvent } from '../../shared/protocol.js';
import { runAgent } from '../../agent/loop.js';

/** NDJSON stream of agent text and tool traffic, for the in-page panel. */
export async function registerAgent(app: FastifyInstance): Promise<void> {
  app.post('/api/agent', async (request, reply) => {
    const goal = (request.body as { goal?: string } | null)?.goal?.trim();

    reply.hijack();
    reply.raw.writeHead(200, {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-cache',
    });
    const send = (event: AgentEvent) => {
      reply.raw.write(`${JSON.stringify(event)}\n`);
    };

    if (!goal) {
      send({ type: 'error', message: 'goal required' });
      reply.raw.end();
      return;
    }

    try {
      const answer = await runAgent({ goal, onEvent: send });
      send({ type: 'done', text: answer });
    } catch (error) {
      send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      reply.raw.end();
    }
  });
}
