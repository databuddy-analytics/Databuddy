import { getRedisCache } from "./redis";

interface RateLimitResult {
	success: boolean;
	limit: number;
	remaining: number;
	reset: number;
}

export async function rateLimit(
	identifier: string,
	limit: number,
	windowSeconds: number
): Promise<RateLimitResult> {
	const redis = getRedisCache();
	const now = Date.now();
	const windowMs = windowSeconds * 1000;
	const key = `rl:${identifier}`;

	try {
		const pipeline = redis.pipeline();
		pipeline.zremrangebyscore(key, 0, now - windowMs);
		pipeline.zcard(key);
		pipeline.zadd(key, now, `${now}:${Math.random()}`);
		pipeline.expire(key, windowSeconds);

		const results = await pipeline.exec();
		if (!results) {
			return {
				success: true,
				limit,
				remaining: limit - 1,
				reset: now + windowMs,
			};
		}

		const count = (results[1]?.[1] as number) || 0;
		return {
			success: count < limit,
			limit,
			remaining: Math.max(0, limit - count - 1),
			reset: now + windowMs,
		};
	} catch {
		return {
			success: true,
			limit,
			remaining: limit - 1,
			reset: now + windowMs,
		};
	}
}

export function getRateLimitHeaders(
	result: RateLimitResult
): Record<string, string> {
	const headers: Record<string, string> = {
		"X-RateLimit-Limit": result.limit.toString(),
		"X-RateLimit-Remaining": result.remaining.toString(),
		"X-RateLimit-Reset": result.reset.toString(),
	};

	if (!result.success) {
		headers["Retry-After"] = Math.ceil(
			(result.reset - Date.now()) / 1000
		).toString();
	}

	return headers;
}
