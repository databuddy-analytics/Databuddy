import './polyfills/compression';
import { appRouter, createTRPCContext } from '@databuddy/rpc';
import cors from '@elysiajs/cors';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { Elysia } from 'elysia';
import { logger } from './lib/logger';
import { assistant } from './routes/assistant';
import { health } from './routes/health';
import { query } from './routes/query';

const app = new Elysia()
	.use(
		cors({
			credentials: true,
			origin: [
				/(?:^|\.)databuddy\.cc$/,
				...(process.env.NODE_ENV === 'development'
					? ['http://localhost:3000']
					: []),
			],
		})
	)

	.use(query)
	.use(assistant)
	.use(health)
	.all('/trpc/*', ({ request }) => {
		return fetchRequestHandler({
			endpoint: '/trpc',
			router: appRouter,
			req: request,
			createContext: () => createTRPCContext({ headers: request.headers }),
		});
	})
	.onError(({ error, code }) => {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error(errorMessage, { error });

		if (error instanceof Error && error.message === 'Unauthorized') {
			return new Response(
				JSON.stringify({
					success: false,
					error: 'Authentication required',
					code: 'AUTH_REQUIRED',
				}),
				{
					status: 401,
					headers: { 'Content-Type': 'application/json' },
				}
			);
		}

		return { success: false, code };
	});

export default {
	fetch: app.fetch,
	port: 3001,
};

process.on('SIGINT', () => {
	logger.info('SIGINT signal received, shutting down...');
	process.exit(0);
});

process.on('SIGTERM', () => {
	logger.info('SIGTERM signal received, shutting down...');
	process.exit(0);
});
