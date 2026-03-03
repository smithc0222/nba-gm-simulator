import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import { authRoutes } from './routes/auth.js';
import { draftRoutes } from './routes/drafts.js';
import { seriesRoutes } from './routes/series.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientDistPath = resolve(__dirname, '../../client/dist');
const serveStatic = existsSync(clientDistPath);

const app = Fastify({ logger: true });

await app.register(cookie);
await app.register(cors, {
  origin: serveStatic ? true : (process.env.CLIENT_URL || 'http://localhost:5173'),
  credentials: true,
});
await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
});

await app.register(authRoutes);
await app.register(draftRoutes);
await app.register(seriesRoutes);

// Serve built client assets when available (production)
if (serveStatic) {
  await app.register(fastifyStatic, {
    root: clientDistPath,
    wildcard: false,
  });

  // SPA fallback: serve index.html for all non-API routes
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.status(404).send({ error: 'Not found' });
    }
    return reply.sendFile('index.html');
  });
}

const port = parseInt(process.env.PORT || '3000');

const shutdown = async (signal: string) => {
  app.log.info(`Received ${signal}, shutting down gracefully...`);
  await app.close();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

try {
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`Server running on http://localhost:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
