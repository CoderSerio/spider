import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';

const port = Number(process.env.PORT ?? 3000);

// dist/server/index.js -> dist/client
const clientRoot = fileURLToPath(new URL('../client', import.meta.url));

const app = Fastify({ logger: true });

await app.register(fastifyStatic, { root: clientRoot });

app.get('/api/health', async () => ({
  ok: true,
  uptime: process.uptime(),
}));

try {
  await app.listen({ port, host: '0.0.0.0' });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
