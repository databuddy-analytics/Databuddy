import { auth } from '@databuddy/auth';
import { getRateLimitIdentifier, rateLimiters } from '@databuddy/rpc';
import { logger } from '@databuddy/shared';
import { Elysia } from 'elysia';

export interface RateLimitOptions {
	type: 'api' | 'auth' | 'expensive' | 'admin' | 'public';
	skipAuth?: boolean;
}

export function createRateLimitMiddleware(options: RateLimitOptions) {
	return new Elysia().onRequest(async ({ request, set }) => {
		if (request.url.includes('/trpc/')) {
			return;
		}

		const rateLimiter = rateLimiters[options.type];

		let userId: string | undefined;
		if (!options.skipAuth) {
			try {
				const session = await auth.api.getSession({
					headers: request.headers,
				});
				userId = session?.user?.id;
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);

				logger.error('[Rate Limit] Auth error:', errorMessage, {
					userId,
					requestUrl: request.url,
				});
			}
		}

		const identifier = getRateLimitIdentifier(userId, request.headers);
		const result = await rateLimiter.checkLimit(identifier);

		if (!result.success) {
			set.status = 429;
			return {
				success: false,
				error: 'Rate limit exceeded',
				code: 'RATE_LIMIT_EXCEEDED',
				limit: result.limit,
				remaining: result.remaining,
				reset: result.reset,
			};
		}
	});
}
