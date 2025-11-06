import { redis } from "@databuddy/redis";
import { logger } from "@databuddy/shared/utils/discord-webhook";
import { parseDurationToSeconds } from "@databuddy/validation";

export interface RateLimitConfig {
	namespace: string;
	limit: number;
	duration: string;
}

export interface RateLimitResult {
	success: boolean;
	limit: number;
	remaining: number;
	reset: number;
}

export class RateLimiter {
	private config: RateLimitConfig;

	constructor(config: RateLimitConfig) {
		this.config = config;
	}

	async checkLimit(identifier: string): Promise<RateLimitResult> {
		const windowSeconds = parseDurationToSeconds(this.config.duration);
		const key = `${this.config.namespace}:${identifier}`;
		const now = Date.now();

		const currentWindowStart =
			Math.floor(now / (windowSeconds * 1000)) * (windowSeconds * 1000);
		const prevWindowStart = currentWindowStart - windowSeconds * 1000;

		const timeInCurrentWindow = now - currentWindowStart;
		const prevWindowWeight = timeInCurrentWindow / (windowSeconds * 1000);

		try {
			const pipeline = redis.pipeline();

			pipeline.get(`${key}:${prevWindowStart}`);
			pipeline.get(`${key}:${currentWindowStart}`);
			pipeline.incr(`${key}:${currentWindowStart}`);
			pipeline.expire(`${key}:${currentWindowStart}`, windowSeconds * 2);

			const results = await pipeline.exec();

			if (!results || results.length < 4) {
				throw new Error("Redis pipeline failed");
			}

			const prevWindowCount = results[0]?.[1]
				? Number.parseInt(results[0][1] as string, 10)
				: 0;
			const newCurrentWindowCount = results[2]?.[1] as number;

			if (typeof newCurrentWindowCount !== "number") {
				throw new Error("Invalid Redis response");
			}

			const weightedPrevCount = Math.floor(prevWindowCount * prevWindowWeight);
			const floatingWindowCount = weightedPrevCount + newCurrentWindowCount;

			const resetTime = currentWindowStart + windowSeconds * 1000;

			if (floatingWindowCount > this.config.limit) {
				return {
					success: false,
					limit: this.config.limit,
					remaining: 0,
					reset: resetTime,
				};
			}

			return {
				success: true,
				limit: this.config.limit,
				remaining: Math.max(0, this.config.limit - floatingWindowCount),
				reset: resetTime,
			};
		} catch (error) {
			logger.error(
				"[Rate Limiter] Redis error:",
				error instanceof Error ? error.message : String(error)
			);
			return {
				success: true,
				limit: this.config.limit,
				remaining: this.config.limit,
				reset: now + windowSeconds * 1000,
			};
		}
	}

	async getStatus(identifier: string): Promise<RateLimitResult> {
		const key = `${this.config.namespace}:${identifier}`;
		const now = Date.now();
		const windowSeconds = parseDurationToSeconds(this.config.duration);

		const currentWindowStart =
			Math.floor(now / (windowSeconds * 1000)) * (windowSeconds * 1000);
		const prevWindowStart = currentWindowStart - windowSeconds * 1000;

		const timeInCurrentWindow = now - currentWindowStart;
		const prevWindowWeight = timeInCurrentWindow / (windowSeconds * 1000);

		try {
			const pipeline = redis.pipeline();

			pipeline.get(`${key}:${prevWindowStart}`);
			pipeline.get(`${key}:${currentWindowStart}`);

			const results = await pipeline.exec();

			if (!results || results.length < 2) {
				throw new Error("Redis pipeline failed");
			}

			const prevWindowCount = results[0]?.[1]
				? Number.parseInt(results[0][1] as string, 10)
				: 0;
			const currentWindowCount = results[1]?.[1]
				? Number.parseInt(results[1][1] as string, 10)
				: 0;

			const weightedPrevCount = Math.floor(prevWindowCount * prevWindowWeight);
			const floatingWindowCount = weightedPrevCount + currentWindowCount;

			return {
				success: floatingWindowCount < this.config.limit,
				limit: this.config.limit,
				remaining: Math.max(0, this.config.limit - floatingWindowCount),
				reset: currentWindowStart + windowSeconds * 1000,
			};
		} catch (error) {
			logger.error(
				"[Rate Limiter] Redis error:",
				error instanceof Error ? error.message : String(error)
			);
			return {
				success: true,
				limit: this.config.limit,
				remaining: this.config.limit,
				reset: now + windowSeconds * 1000,
			};
		}
	}

	async reset(identifier: string): Promise<void> {
		const key = `${this.config.namespace}:${identifier}`;
		const now = Date.now();
		const windowSeconds = parseDurationToSeconds(this.config.duration);

		const currentWindowStart =
			Math.floor(now / (windowSeconds * 1000)) * (windowSeconds * 1000);
		const prevWindowStart = currentWindowStart - windowSeconds * 1000;

		try {
			const pipeline = redis.pipeline();
			pipeline.del(`${key}:${prevWindowStart}`);
			pipeline.del(`${key}:${currentWindowStart}`);
			await pipeline.exec();
		} catch (error) {
			logger.error(
				"[Rate Limiter] Reset error:",
				error instanceof Error ? error.message : String(error)
			);
		}
	}
}

export const rateLimiters = {
	api: new RateLimiter({
		namespace: "api",
		limit: 600,
		duration: "1m",
	}),
	auth: new RateLimiter({
		namespace: "auth",
		limit: 30,
		duration: "1m",
	}),
	expensive: new RateLimiter({
		namespace: "expensive",
		limit: 100,
		duration: "1m",
	}),
	admin: new RateLimiter({
		namespace: "admin",
		limit: 1200,
		duration: "1m",
	}),
	public: new RateLimiter({
		namespace: "public",
		limit: 120,
		duration: "1m",
	}),
};

export function getRateLimitIdentifier(
	userId?: string,
	headers?: Headers
): string {
	if (userId) {
		return userId;
	}

	const cfConnectingIp = headers?.get("cf-connecting-ip");
	if (cfConnectingIp) {
		return cfConnectingIp;
	}

	const realIp = headers?.get("x-real-ip");
	if (realIp) {
		return realIp;
	}

	const forwardedFor = headers?.get("x-forwarded-for");
	if (forwardedFor) {
		return forwardedFor.split(",")[0].trim();
	}

	return "anonymous";
}
