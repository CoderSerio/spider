import { resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { loadSettings } from '../settings.js';
import { registerAgent } from './agent/route.js';
import { registerMcpHttp } from './mcp/http.js';
import { SimSession } from './sim/session.js';
import { registerLive } from './ws.js';

const settings = loadSettings();
const port = settings.server.port;

// Vite emits here. Resolved from the project root so it works the same under
// tsx (src/server/index.ts) and the build (dist/server/index.js).
const clientRoot = resolve(process.env.CLIENT_DIR ?? 'dist/client');

const session = new SimSession();
session.start();

const app = Fastify({ logger: true });

await app.register(fastifyStatic, { root: clientRoot });
await registerLive(app, session);
await registerMcpHttp(app, session);
await registerAgent(app);

app.get('/api/health', async () => ({
  ok: true,
  uptime: process.uptime(),
  spider: session.observe().self,
}));

try {
  app.log.info(
    `agent: ${settings.agent.provider}/${settings.agent.model}` +
      (settings.agent.apiKey ? '' : ' (no api key configured)'),
  );
  await app.listen({ port, host: '0.0.0.0' });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
