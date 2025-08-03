import { auth } from '@databuddy/auth';
import { cacheable } from '@databuddy/redis';
import { getRateLimitIdentifier, rateLimiters } from '@databuddy/rpc';
import { Elysia } from 'elysia';

export interface RateLimitOptions {
	type: 'api' | 'auth' | 'expensive' | 'admin' | 'public';
	skipAuth?: boolean;
}

const getCachedAuthSession = cacheable(
	async (headers: Headers) => {
		try {
			return await auth.api.getSession({
				headers,
			});
		} catch (error) {
			console.error('[Rate Limit] Auth error:', error);
			return null;
		}
	},
	{
		expireInSec: 30,
		prefix: 'rate-limit-auth',
		staleWhileRevalidate: true,
		staleTime: 15,
	}
);

export function createRateLimitMiddleware(options: RateLimitOptions) {
	return new Elysia().onRequest(async ({ request, set }) => {
		if (request.url.includes('/trpc/')) {
			return;
		}

		const rateLimiter = rateLimiters[options.type];

		let userId: string | undefined;
		if (!options.skipAuth) {
			const session = await getCachedAuthSession(request.headers);
			userId = session?.user?.id;
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
