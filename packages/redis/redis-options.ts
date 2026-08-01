export interface RedisConnectionOptions {
	commandTimeout: number;
	connectTimeout: number;
	maxRetriesPerRequest: number;
	retryStrategy: (times: number) => number | null;
}

export interface LinkCacheRedisConnectionOptions
	extends RedisConnectionOptions {
	connectionName: string;
	enableOfflineQueue: false;
	lazyConnect: true;
}

export type RateLimitRedisConnectionOptions = LinkCacheRedisConnectionOptions;

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

export function createLinkCacheRedisConnectionOptions(): LinkCacheRedisConnectionOptions {
	return {
		connectionName: "databuddy-link-cache",
		connectTimeout: 1000,
		commandTimeout: 1000,
		enableOfflineQueue: false,
		lazyConnect: true,
		maxRetriesPerRequest: 1,
		retryStrategy: () => null,
	};
}

export function createRateLimitRedisConnectionOptions(): RateLimitRedisConnectionOptions {
	return {
		...createLinkCacheRedisConnectionOptions(),
		connectionName: "databuddy-rate-limit",
	};
}
