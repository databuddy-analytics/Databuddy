import { ratelimit } from "@databuddy/redis";

export interface AuthRateLimitRule {
	max: number;
	window: number;
}

export function createAuthRateLimitStorage() {
	return {
		consume: async (key: string, rule: AuthRateLimitRule) => {
			const result = await ratelimit(key, rule.max, rule.window);
			return {
				allowed: result.success,
				retryAfter: result.success
					? null
					: Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
			};
		},
	};
}
