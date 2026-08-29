import { randomUUID } from "node:crypto";
import { runRateLimitCommand } from "./redis";

export interface RateLimitResult {
	degraded?: boolean;
	limit: number;
	remaining: number;
	reset: number;
	success: boolean;
}

const DEGRADED_MAX_TRACKED_KEYS = 10_000;
const degradedHitWindows = new Map<string, number[]>();

function admitDegraded(
	key: string,
	limit: number,
	now: number,
	windowMs: number
): { success: boolean; count: number } {
	if (degradedHitWindows.size > DEGRADED_MAX_TRACKED_KEYS) {
		degradedHitWindows.clear();
	}
	const cutoff = now - windowMs;
	const hits = (degradedHitWindows.get(key) ?? []).filter(
		(timestamp) => timestamp > cutoff
	);
	const success = hits.length < limit;
	if (success) {
		hits.push(now);
	}
	degradedHitWindows.set(key, hits);
	return { success, count: hits.length };
}

export function resetDegradedRateLimitWindows(): void {
	degradedHitWindows.clear();
}

export async function ratelimit(
	identifier: string,
	limit: number,
	windowSeconds: number
): Promise<RateLimitResult> {
	const now = Date.now();
	const windowMs = windowSeconds * 1000;
	const key = `rl:${identifier}`;

	try {
		const result = (await runRateLimitCommand((redis) =>
			redis.eval(
				`local key = KEYS[1]
local now = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
local window_seconds = tonumber(ARGV[5])
redis.call("ZREMRANGEBYSCORE", key, 0, now - window_ms)
local count = redis.call("ZCARD", key)
local success = 0
if count < limit then
	redis.call("ZADD", key, now, member)
	count = count + 1
	success = 1
end
redis.call("EXPIRE", key, window_seconds)
return { success, count }`,
				1,
				key,
				String(now),
				String(windowMs),
				String(limit),
				`${now}:${randomUUID()}`,
				String(windowSeconds)
			)
		)) as [number, number];

		const [success, count] = result;
		return {
			success: success === 1,
			limit,
			remaining: Math.max(0, limit - count),
			reset: now + windowMs,
		};
	} catch {
		const fallback = admitDegraded(key, limit, now, windowMs);
		return {
			degraded: true,
			success: fallback.success,
			limit,
			remaining: Math.max(0, limit - fallback.count),
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
