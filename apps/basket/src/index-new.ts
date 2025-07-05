import { Elysia } from 'elysia';
import { bootstrap, shutdown } from './bootstrap';
import basketRouter from './routes/basket-new';
import stripeRouter from './routes/stripe';
import { logger } from './lib/logger';
import './polyfills/compression';

// Bootstrap the application
bootstrap().catch((error) => {
  logger.error('Failed to bootstrap application', { error });
  process.exit(1);
});

const app = new Elysia()
  .onError(({ error }) => {
    logger.error(
      new Error(
        `${error instanceof Error ? error.name : 'Unknown'}: ${error instanceof Error ? error.message : 'Unknown'}`,
      ),
    );
  })
  .onBeforeHandle(async ({ request, set }) => {
    const origin = request.headers.get('origin');
    if (origin) {
      set.headers ??= {};
      set.headers['Access-Control-Allow-Origin'] = origin;
      set.headers['Access-Control-Allow-Methods'] = 'POST, GET, OPTIONS, PUT, DELETE';
      set.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, databuddy-client-id, databuddy-sdk-name, databuddy-sdk-version';
      set.headers['Access-Control-Allow-Credentials'] = 'true';
    }
  })
  .options('*', () => new Response(null, { status: 204 }))
  .use(basketRouter)
  .use(stripeRouter)
  .get('/health', () => ({ 
    status: 'ok', 
    version: '2.0.0',
    timestamp: new Date().toISOString()
  }))
  .get('/health/detailed', async () => {
    // TODO: Add detailed health checks for all services
    return {
      status: 'ok',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      services: {
        storage: 'ok',
        cache: 'ok',
        events: 'ok'
      }
    };
  });

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  await shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully');
  await shutdown();
  process.exit(0);
});

export default {
  port: process.env.PORT || 4000,
  fetch: app.fetch,
};