import cors from '@elysiajs/cors';
import { Elysia } from 'elysia';
import { flagsRoute } from './flags';

export const publicApi = new Elysia({ prefix: '/public' })
	.use(
		cors({
			credentials: false,
			origin: true,
		})
	)
	.options('*', () => new Response(null, { status: 204 }))
	.use(flagsRoute)
	.onError(({ error, code, set }) => {
		const errorMessage = error instanceof Error ? error.message : String(error);

		set.status = code === 'NOT_FOUND' ? 404 : 500;

		return {
			success: false,
			error: errorMessage,
			code: code ?? 'INTERNAL_SERVER_ERROR',
		};
	});
