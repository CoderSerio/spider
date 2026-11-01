import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { FastifyInstance } from 'fastify';
import type { SimSession } from '../sim/session.js';
import { createMcpServer } from './createServer.js';

/** Stateless Streamable HTTP: one transport per request, no session table. */
export async function registerMcpHttp(app: FastifyInstance, session: SimSession): Promise<void> {
  app.post('/mcp', async (request, reply) => {
    reply.hijack();

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    reply.raw.on('close', () => {
      void transport.close();
    });

    const server = createMcpServer(session);
    await server.connect(transport);
    await transport.handleRequest(request.raw, reply.raw, request.body);
  });
}
