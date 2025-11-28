import { getRedisCache } from "./redis";

const logger = console;

const activeRevalidations = new Map<string, Promise<void>>();

const stringifyRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*Z$/;

let redisAvailable = true;
let lastRedisCheck = 0;
const REDIS_CHECK_INTERVAL = 30_000;

type CacheOptions = {
	expireInSec: number;
	prefix?: string;
	serialize?: (data: unknown) => string;
	deserialize?: (data: string) => unknown;
	staleWhileRevalidate?: boolean;
	staleTime?: number;
	maxRetries?: number;
};

const defaultSerialize = (data: unknown): string => JSON.stringify(data);
const defaultDeserialize = (data: string): unknown =>
	JSON.parse(data, (_, value) => {
		if (typeof value === "string" && stringifyRegex.test(value)) {
			return new Date(value);
		}
		return value;
	});

function shouldSkipRedis(): boolean {
	const now = Date.now();
	if (!redisAvailable && now - lastRedisCheck < REDIS_CHECK_INTERVAL) {
		return true;
	}
	if (!redisAvailable && now - lastRedisCheck >= REDIS_CHECK_INTERVAL) {
		redisAvailable = true;
		lastRedisCheck = now;
	}
	return false;
}

export async function getCache<T>(
	key: string,
	options: CacheOptions | number,
	fn: () => Promise<T>
): Promise<T> {
	const {
		expireInSec,
		serialize = defaultSerialize,
		deserialize = defaultDeserialize,
		staleWhileRevalidate = false,
		staleTime = 0,
		maxRetries = 1,
	} = typeof options === "number" ? { expireInSec: options } : options;

	if (shouldSkipRedis()) {
		return fn();
	}

	let retries = 0;
	while (retries < maxRetries) {
		try {
			const redis = getRedisCache();
			const hit = await redis.get(key);
			redisAvailable = true;
			lastRedisCheck = Date.now();

			if (hit) {
				const data = deserialize(hit) as T;

				if (staleWhileRevalidate) {
					try {
						const ttl = await redis.ttl(key);
						if (ttl < staleTime && !activeRevalidations.has(key)) {
							const revalidationPromise = fn()
								.then(async (freshData: T) => {
									if (
										freshData !== undefined &&
										freshData !== null &&
										redisAvailable
									) {
										try {
											const redis = getRedisCache();
											await redis.setex(key, expireInSec, serialize(freshData));
										} catch {
											// Ignore SET failure
										}
									}
								})
								.catch((error: unknown) => {
									logger.error(
										`Background revalidation failed for key ${key}:`,
										error
									);
								})
								.finally(() => {
									activeRevalidations.delete(key);
								});
							activeRevalidations.set(key, revalidationPromise);
						}
					} catch {
						// Ignore TTL check failure
					}
				}

				return data;
			}

			const data = await fn();
			if (
				data !== undefined &&
				data !== null &&
				redisAvailable &&
				!shouldSkipRedis()
			) {
				try {
					await redis.setex(key, expireInSec, serialize(data));
				} catch {
					redisAvailable = false;
					lastRedisCheck = Date.now();
				}
			}
			return data;
		} catch (error: unknown) {
			retries += 1;
			if (retries >= maxRetries) {
				redisAvailable = false;
				lastRedisCheck = Date.now();
				logger.error(`Cache error for key ${key}, skipping Redis:`, error);
				return fn();
			}
		}
	}

	return fn();
}

export function cacheable<T extends (...args: any) => any>(
	fn: T,
	options: CacheOptions | number
) {
	const {
		expireInSec,
		prefix = fn.name,
		serialize = defaultSerialize,
		deserialize = defaultDeserialize,
		staleWhileRevalidate = false,
		staleTime = 0,
	} = typeof options === "number" ? { expireInSec: options } : options;

	const cachePrefix = `cacheable:${prefix}`;

	function stringify(obj: unknown): string {
		if (obj === null) {
			return "null";
		}
		if (obj === undefined) {
			return "undefined";
		}
		if (typeof obj === "boolean") {
			return obj ? "true" : "false";
		}
		if (typeof obj === "number") {
			return String(obj);
		}
		if (typeof obj === "string") {
			return obj;
		}
		if (typeof obj === "function") {
			return obj.toString();
		}

		if (Array.isArray(obj)) {
			return `[${obj.map(stringify).join(",")}]`;
		}

		if (typeof obj === "object") {
			const pairs = Object.entries(obj)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, value]) => `${key}:${stringify(value)}`);
			return pairs.join(":");
		}

		return String(obj);
	}

	const getKey = (...args: Parameters<T>) =>
		`${cachePrefix}:${stringify(args)}`;

	const cachedFn = async (
		...args: Parameters<T>
	): Promise<Awaited<ReturnType<T>>> => {
		const key = getKey(...args);
		const retries = typeof options === "number" ? 1 : (options.maxRetries ?? 1);

		if (shouldSkipRedis()) {
			return fn(...args);
		}

		let attempt = 0;
		while (attempt < retries) {
			try {
				const redis = getRedisCache();
				const cached = await redis.get(key);
				redisAvailable = true;
				lastRedisCheck = Date.now();

				if (cached) {
					const data = deserialize(cached) as Awaited<ReturnType<T>>;

					if (staleWhileRevalidate) {
						try {
							const ttl = await redis.ttl(key);
							if (ttl < staleTime && !activeRevalidations.has(key)) {
								const revalidationPromise = fn(...args)
									.then(async (freshData: Awaited<ReturnType<T>>) => {
										if (
											freshData !== undefined &&
											freshData !== null &&
											redisAvailable
										) {
											try {
												const redis = getRedisCache();
												await redis.setex(key, expireInSec, serialize(freshData));
											} catch {
												// Ignore SET failure
											}
										}
									})
									.catch((error: unknown) => {
										logger.error(
											`Background revalidation failed for function ${fn.name}:`,
											error
										);
									})
									.finally(() => {
										activeRevalidations.delete(key);
									});
								activeRevalidations.set(key, revalidationPromise);
							}
						} catch {
							// Ignore TTL check failure
						}
					}

					return data;
				}

				const result = await fn(...args);
				if (
					result !== undefined &&
					result !== null &&
					redisAvailable &&
					!shouldSkipRedis()
				) {
					try {
						await redis.setex(key, expireInSec, serialize(result));
					} catch {
						redisAvailable = false;
						lastRedisCheck = Date.now();
					}
				}
				return result;
			} catch (error: unknown) {
				attempt += 1;
				if (attempt >= retries) {
					redisAvailable = false;
					lastRedisCheck = Date.now();
					logger.error(
						`Cache error for function ${fn.name}, skipping Redis:`,
						error
					);
					return fn(...args);
				}
			}
		}

		return fn(...args);
	};

	cachedFn.getKey = getKey;
	cachedFn.clear = (...args: Parameters<T>) => {
		const key = getKey(...args);
		const redis = getRedisCache();
		return redis.del(key);
	};

	cachedFn.clearAll = async () => {
		const redis = getRedisCache();
		const keys = await redis.keys(`${cachePrefix}:*`);
		if (keys.length > 0) {
			return redis.del(...keys);
		}
	};

	cachedFn.invalidate = async (...args: Parameters<T>) => {
		const key = getKey(...args);
		const result = await fn(...args);
		if (result !== undefined && result !== null) {
			const redis = getRedisCache();
			await redis.setex(key, expireInSec, serialize(result));
		}
		return result;
	};

	return cachedFn;
}
