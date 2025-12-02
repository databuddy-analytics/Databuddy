import type { Logger, RateLimitConfig } from "../types";

/**
 * Rate limiter interface
 */
export interface RateLimiter {
	/**
	 * Try to acquire a token
	 * @returns true if allowed, false if rate limited
	 */
	tryAcquire(): Promise<boolean>;

	/**
	 * Get time until next token is available (ms)
	 */
	getWaitTime(): Promise<number>;

	/**
	 * Reset the rate limiter
	 */
	reset(): Promise<void>;

	/**
	 * Close the rate limiter
	 */
	close(): Promise<void>;
}

/**
 * Token bucket rate limiter (in-memory)
 * Allows burst traffic while enforcing average rate
 */
export class TokenBucketLimiter implements RateLimiter {
	private tokens: number;
	private lastRefill: number;
	private readonly maxTokens: number;
	private readonly refillRate: number; // tokens per ms
	private readonly logger: Logger;

	constructor(config: Required<RateLimitConfig>, logger: Logger) {
		this.maxTokens = config.maxRequests;
		this.tokens = this.maxTokens;
		this.lastRefill = Date.now();
		this.refillRate = config.maxRequests / config.intervalMs;
		this.logger = logger;
	}

	async tryAcquire(): Promise<boolean> {
		this.refill();

		if (this.tokens >= 1) {
			this.tokens -= 1;
			return true;
		}

		this.logger.debug("Rate limit exceeded", {
			tokens: this.tokens,
			maxTokens: this.maxTokens,
		});

		return false;
	}

	async getWaitTime(): Promise<number> {
		this.refill();

		if (this.tokens >= 1) {
			return 0;
		}

		// Time until 1 token is available
		const tokensNeeded = 1 - this.tokens;
		return Math.ceil(tokensNeeded / this.refillRate);
	}

	async reset(): Promise<void> {
		this.tokens = this.maxTokens;
		this.lastRefill = Date.now();
	}

	async close(): Promise<void> {
		// No cleanup needed for in-memory limiter
	}

	private refill(): void {
		const now = Date.now();
		const elapsed = now - this.lastRefill;
		const tokensToAdd = elapsed * this.refillRate;

		this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
		this.lastRefill = now;
	}
}

/**
 * No-op rate limiter that always allows
 */
export class NoopRateLimiter implements RateLimiter {
	async tryAcquire(): Promise<boolean> {
		return true;
	}
	async getWaitTime(): Promise<number> {
		return 0;
	}
	async reset(): Promise<void> {}
	async close(): Promise<void> {}
}

/**
 * Create a rate limiter based on config
 */
export function createRateLimiter(
	config: Required<RateLimitConfig> | false,
	logger: Logger,
): RateLimiter {
	if (config === false) {
		return new NoopRateLimiter();
	}

	return new TokenBucketLimiter(config, logger);
}
