export interface RedisConnectionOptions {
	commandTimeout: number;
	connectTimeout: number;
	maxRetriesPerRequest: number;
	retryStrategy: (times: number) => number | null;
}

export function getRedisUrl(): string {
	const url = process.env.REDIS_URL;
	if (!url) {
		throw new Error("REDIS_URL environment variable is required");
	}
	return url;
}

export function createRedisConnectionOptions(): RedisConnectionOptions {
	return {
		connectTimeout: 10_000,
		commandTimeout: 5000,
		retryStrategy: (times) => Math.min(times * 100, 3000),
		maxRetriesPerRequest: 3,
	};
}
