import type { RedisOptions } from "ioredis";
import Redis from "ioredis";
import { SuperJSON } from "superjson";

const DEFAULT_OPTIONS: RedisOptions = {
	connectTimeout: 10_000,
	commandTimeout: 5000,
	retryStrategy: (times) => Math.min(times * 100, 3000),
	maxRetriesPerRequest: 3,
};

interface ExtendedRedis extends Redis {
	getJson: <T = any>(key: string) => Promise<T | null>;
	setJson: <T = any>(
		key: string,
		value: T,
		expireInSec: number
	) => Promise<void>;
}

const createRedisClient = (
	url: string,
	overrides: RedisOptions = {}
): ExtendedRedis => {
	const client = new Redis(url, {
		...DEFAULT_OPTIONS,
		...overrides,
	}) as ExtendedRedis;

	client.on("error", (error) => {
		console.error("Redis Client Error:", error);
	});

	client.getJson = async <T = any>(key: string): Promise<T | null> => {
		const value = await client.get(key);
		if (!value) {
			return null;
		}

		try {
			const res = SuperJSON.parse(value) as T;

			// Check for empty collections
			if (
				(Array.isArray(res) && res.length === 0) ||
				(res && typeof res === "object" && Object.keys(res).length === 0)
			) {
				return null;
			}

			return res;
		} catch (err) {
			console.error(`Error parsing JSON for key ${key}:`, err);
			return null;
		}
	};

	client.setJson = async <T = any>(
		key: string,
		value: T,
		expireInSec: number
	): Promise<void> => {
		await client.setex(key, expireInSec, SuperJSON.stringify(value));
	};

	return client;
};

// Singleton instance
let redisInstance: ExtendedRedis | null = null;
let rawRedisInstance: Redis | null = null;

function getRedisUrl(): string {
	const url = process.env.REDIS_URL;
	if (!url) {
		throw new Error("REDIS_URL environment variable is required");
	}
	return url;
}

// Create singleton Redis instance
export function getRedisCache(): ExtendedRedis {
	if (!redisInstance) {
		const redisUrl = getRedisUrl();
		redisInstance = createRedisClient(redisUrl);

		// Handle graceful shutdown
		process.on("SIGTERM", () => {
			if (redisInstance) {
				redisInstance.disconnect();
				redisInstance = null;
			}
		});
	}

	return redisInstance;
}

export const redis = getRedisCache();

export const getRawRedis = (): Redis => {
	if (!rawRedisInstance) {
		const redisUrl = getRedisUrl();
		rawRedisInstance = new Redis(redisUrl, DEFAULT_OPTIONS);

		process.on("SIGTERM", () => {
			if (rawRedisInstance) {
				rawRedisInstance.disconnect();
				rawRedisInstance = null;
			}
		});
	}
	return rawRedisInstance;
};
