import Redis from "ioredis";

let redisInstance: Redis | null = null;

export function getRedisCache() {
	if (!redisInstance) {
		const url = process.env.REDIS_URL;
		if (!url) {
			throw new Error("REDIS_URL environment variable is required");
		}

		redisInstance = new Redis(url, {
			connectTimeout: 10_000,
			commandTimeout: 5000,
			retryStrategy: (times) => Math.min(times * 100, 3000),
			maxRetriesPerRequest: 3,
		});

		redisInstance.on("error", (error) => {
			console.error("Redis Client Error:", error);
		});

		process.on("SIGTERM", () => {
			redisInstance?.disconnect();
			redisInstance = null;
		});
	}

	return redisInstance;
}

export const redis = getRedisCache();
