import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export const RATE_LIMIT_CONFIGS = {
	public: { requests: 100, window: "1 m" },
	api: { requests: 200, window: "1 m" },
	auth: { requests: 30, window: "1 m" },
	expensive: { requests: 30, window: "1 m" },
	admin: { requests: 500, window: "1 m" },
} as const;

export type RateLimitType = keyof typeof RATE_LIMIT_CONFIGS;

export interface RateLimitOptions {
	type: RateLimitType;
	identifier?: string;
	skipAuth?: boolean;
	customConfig?: { requests: number; window: string };
	rate?: number;
}

export interface RateLimitResult {
	success: boolean;
	limit: number;
	remaining: number;
	reset: Date;
}

const redis = Redis.fromEnv();

const rateLimiterCache = new Map<string, Ratelimit>();
const ephemeralCache = new Map<string, number>();
const inMemoryLimits = new Map<string, { count: number; resetTime: number }>();

export const ratelimit = {
	free: new Ratelimit({
		redis,
		analytics: true,
		prefix: "ratelimit:free",
		limiter: Ratelimit.slidingWindow(50, "10s"),
	}),
	hobby: new Ratelimit({
		redis,
		analytics: true,
		prefix: "ratelimit:hobby",
		limiter: Ratelimit.slidingWindow(100, "10s"),
	}),
	pro: new Ratelimit({
		redis,
		analytics: true,
		prefix: "ratelimit:pro",
		limiter: Ratelimit.slidingWindow(200, "10s"),
	}),
	scale: new Ratelimit({
		redis,
		analytics: true,
		prefix: "ratelimit:scale",
		limiter: Ratelimit.slidingWindow(500, "10s"),
	}),
};

function createRateLimiter(
	type: RateLimitType,
	customConfig?: { requests: number; window: string }
): Ratelimit | null {
	const config = customConfig || RATE_LIMIT_CONFIGS[type];
	const cacheKey = `${type}-${config.requests}-${config.window}`;

	const cached = rateLimiterCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	try {
		const rateLimiter = new Ratelimit({
			redis,
			limiter: Ratelimit.slidingWindow(config.requests, config.window as "1 m"),
			analytics: true,
			prefix: `@databuddy/ratelimit:${type}`,
			ephemeralCache,
		});
		rateLimiterCache.set(cacheKey, rateLimiter);
		return rateLimiter;
	} catch {
		return null;
	}
}

function getRateLimitIdentifier(
	request: Request,
	customIdentifier?: string,
	userId?: string
): string {
	if (customIdentifier) {
		return `custom:${customIdentifier}`;
	}
	if (userId) {
		return `user:${userId}`;
	}

	let apiKey = request.headers.get("x-api-key");
	if (!apiKey) {
		const auth = request.headers.get("authorization");
		if (auth?.toLowerCase().startsWith("bearer ")) {
			apiKey = auth.slice(7).trim();
		}
	}

	if (apiKey) {
		const keyHash = btoa(apiKey).slice(0, 12);
		return `apikey:${keyHash}`;
	}

	let ip =
		request.headers.get("cf-connecting-ip") || // Cloudflare real IP
		request.headers.get("x-forwarded-for") || // Standard proxy chain
		request.headers.get("x-real-ip") || // Nginx real IP
		request.headers.get("x-client-ip") || // Alternative header
		"direct";

	if (ip.includes(",")) {
		ip = ip.split(",")[0]?.trim() || "direct";
	}

	const userAgent = request.headers.get("user-agent");
	const agentHash = userAgent ? btoa(userAgent).slice(0, 6) : "noua";

	return `ip:${ip}:${agentHash}`;
}

function parseWindowMs(window: string): number {
	if (window === "1 m") {
		return 60_000;
	}
	if (window === "10 s") {
		return 10_000;
	}
	if (window === "1 h") {
		return 3_600_000;
	}
	if (window === "1 d") {
		return 86_400_000;
	}
	return 60_000; // default fallback
}

function checkInMemoryRateLimit(
	identifier: string,
	config: { requests: number; window: string },
	rate = 1
): RateLimitResult {
	const windowMs = parseWindowMs(config.window);
	const now = Date.now();
	const resetTime = Math.ceil(now / windowMs) * windowMs;
	const key = `${identifier}:${resetTime}`;

	// Cleanup old entries
	for (const [k, v] of inMemoryLimits.entries()) {
		if (v.resetTime < now) {
			inMemoryLimits.delete(k);
		}
	}

	const current = inMemoryLimits.get(key) || { count: 0, resetTime };
	const newCount = current.count + rate;
	const success = newCount <= config.requests;

	if (success) {
		inMemoryLimits.set(key, { count: newCount, resetTime });
	}

	return {
		success,
		limit: config.requests,
		remaining: Math.max(0, config.requests - newCount),
		reset: new Date(resetTime + windowMs),
	};
}

export async function checkRateLimit(
	request: Request,
	options: RateLimitOptions,
	userId?: string
): Promise<RateLimitResult> {
	const identifier = getRateLimitIdentifier(
		request,
		options.identifier,
		userId
	);
	const config = options.customConfig || RATE_LIMIT_CONFIGS[options.type];
	const rate = options.rate || 1;

	const rateLimiter = createRateLimiter(options.type, options.customConfig);
	if (rateLimiter) {
		try {
			const result = await rateLimiter.limit(
				identifier,
				rate > 1 ? { rate } : undefined
			);
			return {
				success: result.success,
				limit: result.limit,
				remaining: result.remaining,
				reset: new Date(result.reset),
			};
		} catch {
			// ignore
		}
	}

	const result = checkInMemoryRateLimit(identifier, config, rate);
	return result;
}
