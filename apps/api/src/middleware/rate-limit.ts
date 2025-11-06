import { auth } from "@databuddy/auth";
import { cacheable } from "@databuddy/redis";
import { Elysia } from "elysia";
import { checkRateLimit, type RateLimitOptions } from "../lib/rate-limit";

export interface RateLimitMiddlewareOptions extends RateLimitOptions {
	errorMessage?: string;
	includeHeaders?: boolean;
}

const getCachedAuthSession = cacheable(
	async (headers: Headers) => {
		try {
			return await auth.api.getSession({ headers });
		} catch {
			return null;
		}
	},
	{
		expireInSec: 30,
		prefix: "rate-limit-auth",
		staleWhileRevalidate: true,
		staleTime: 15,
	}
);

export function createRateLimitMiddleware(options: RateLimitMiddlewareOptions) {
	const {
		errorMessage = "Rate limit exceeded. Please try again later.",
		includeHeaders = true,
		...rateLimitOptions
	} = options;

	return new Elysia().onRequest(async ({ request, set }) => {
		if (request.url.includes("/trpc/")) {
			return;
		}

		let userId: string | undefined;
		if (!rateLimitOptions.skipAuth) {
			const session = await getCachedAuthSession(request.headers);
			userId = session?.user?.id;
		}

		const result = await checkRateLimit(request, rateLimitOptions, userId);

		if (includeHeaders && set.headers) {
			set.headers["X-RateLimit-Limit"] = result.limit.toString();
			set.headers["X-RateLimit-Remaining"] = result.remaining.toString();
			set.headers["X-RateLimit-Reset"] = Math.ceil(
				result.reset.getTime() / 1000
			).toString();
		}

		if (!result.success) {
			const errorResponse = {
				success: false,
				error: errorMessage,
				code: "RATE_LIMIT_EXCEEDED",
				limit: result.limit,
				remaining: result.remaining,
				reset: result.reset.toISOString(),
				retryAfter: Math.ceil((result.reset.getTime() - Date.now()) / 1000),
			};

			return new Response(JSON.stringify(errorResponse), {
				status: 429,
				headers: {
					"Content-Type": "application/json",
					"X-RateLimit-Limit": result.limit.toString(),
					"X-RateLimit-Remaining": result.remaining.toString(),
					"X-RateLimit-Reset": Math.ceil(
						result.reset.getTime() / 1000
					).toString(),
				},
			});
		}
	});
}

export const rateLimitMiddlewares = {
	public: () =>
		createRateLimitMiddleware({
			type: "public",
			skipAuth: true,
			errorMessage: "Too many requests. Please try again in a minute.",
		}),

	api: () =>
		createRateLimitMiddleware({
			type: "api",
			errorMessage: "API rate limit exceeded. Please try again later.",
		}),

	auth: () =>
		createRateLimitMiddleware({
			type: "auth",
			skipAuth: true,
			errorMessage: "Too many authentication attempts.",
		}),

	expensive: () =>
		createRateLimitMiddleware({
			type: "expensive",
			errorMessage: "Rate limit exceeded. Please wait before retrying.",
		}),

	admin: () =>
		createRateLimitMiddleware({
			type: "admin",
			errorMessage: "Admin rate limit exceeded.",
		}),

	batch: (rate: number) =>
		createRateLimitMiddleware({
			type: "api",
			rate,
			errorMessage: "Batch operation rate limit exceeded.",
		}),
};

export function createCustomRateLimitMiddleware(
	requests: number,
	window: string,
	type: RateLimitOptions["type"] = "api",
	options?: Partial<RateLimitMiddlewareOptions>
) {
	return createRateLimitMiddleware({
		type,
		customConfig: { requests, window },
		...options,
	});
}
