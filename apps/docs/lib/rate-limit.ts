interface RateLimitEntry {
	count: number;
	resetTime: number;
}

class InMemoryRateLimit {
	private store = new Map<string, RateLimitEntry>();
	private maxRequests: number;
	private windowMs: number;

	constructor(maxRequests = 3, windowMs: number = 60 * 60 * 1000) {
		this.maxRequests = maxRequests;
		this.windowMs = windowMs;

		// Clean up expired entries every 5 minutes
		setInterval(
			() => {
				this.cleanup();
			},
			5 * 60 * 1000
		);
	}

	check(key: string): {
		allowed: boolean;
		resetTime?: number;
		remaining?: number;
	} {
		const now = Date.now();
		const current = this.store.get(key);

		if (!current || now > current.resetTime) {
			// First request or window expired
			this.store.set(key, { count: 1, resetTime: now + this.windowMs });
			return {
				allowed: true,
				remaining: this.maxRequests - 1,
				resetTime: now + this.windowMs,
			};
		}

		if (current.count >= this.maxRequests) {
			return {
				allowed: false,
				resetTime: current.resetTime,
				remaining: 0,
			};
		}

		// Increment count
		current.count += 1;
		this.store.set(key, current);

		return {
			allowed: true,
			remaining: this.maxRequests - current.count,
			resetTime: current.resetTime,
		};
	}

	private cleanup(): void {
		const now = Date.now();
		for (const [key, entry] of this.store.entries()) {
			if (now > entry.resetTime) {
				this.store.delete(key);
			}
		}
	}

	reset(key: string): void {
		this.store.delete(key);
	}

	getStats(): { totalKeys: number } {
		return { totalKeys: this.store.size };
	}
}

// Export singleton instance for form submissions
export const formRateLimit = new InMemoryRateLimit(3, 60 * 60 * 1000); // 3 requests per hour

export { InMemoryRateLimit };
