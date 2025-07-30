import { getRedisCache } from './redis';

const logger = console;

interface CacheOptions {
	expireInSec: number;
	prefix?: string;
	serialize?: (data: unknown) => string;
	deserialize?: (data: string) => unknown;
	staleWhileRevalidate?: boolean;
	staleTime?: number;
	maxRetries?: number;
}

const defaultSerialize = (data: unknown): string => JSON.stringify(data);
const defaultDeserialize = (data: string): unknown =>
	JSON.parse(data, (_, value) => {
		if (
			typeof value === 'string' &&
			/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*Z$/.test(value)
		) {
			return new Date(value);
		}
		return value;
	});

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
		maxRetries = 3,
	} = typeof options === 'number' ? { expireInSec: options } : options;

	let retries = 0;
	while (retries < maxRetries) {
		try {
			const redis = getRedisCache();
			const hit = await redis.get(key);
			if (hit) {
				const data = deserialize(hit) as T;

				if (staleWhileRevalidate) {
					const ttl = await redis.ttl(key);
					if (ttl < staleTime) {
						// Return stale data and revalidate in background
						fn()
							.then(async (freshData: T) => {
								if (freshData !== undefined && freshData !== null) {
									const redis = getRedisCache();
									await redis.setex(key, expireInSec, serialize(freshData));
								}
							})
							.catch((error: unknown) => {
								logger.error(
									`Background revalidation failed for key ${key}:`,
									error
								);
							});
					}
				}

				return data;
			}

			const data = await fn();
			if (data !== undefined && data !== null) {
				await redis.setex(key, expireInSec, serialize(data));
			}
			return data;
		} catch (error: unknown) {
			retries++;
			if (retries === maxRetries) {
				logger.error(
					`Cache error for key ${key} after ${maxRetries} retries:`,
					error
				);
				return fn();
			}
			await new Promise((resolve) => setTimeout(resolve, 100 * retries)); // Exponential backoff
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
		maxRetries = 3,
	} = typeof options === 'number' ? { expireInSec: options } : options;

	const cachePrefix = `cacheable:${prefix}`;

	function stringify(obj: unknown): string {
		if (obj === null) {
			return 'null';
		}
		if (obj === undefined) {
			return 'undefined';
		}
		if (typeof obj === 'boolean') {
			return obj ? 'true' : 'false';
		}
		if (typeof obj === 'number') {
			return String(obj);
		}
		if (typeof obj === 'string') {
			return obj;
		}
		if (typeof obj === 'function') {
			return obj.toString();
		}

		if (Array.isArray(obj)) {
			return `[${obj.map(stringify).join(',')}]`;
		}

		if (typeof obj === 'object') {
			const pairs = Object.entries(obj)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, value]) => `${key}:${stringify(value)}`);
			return pairs.join(':');
		}

		return String(obj);
	}

	const getKey = (...args: Parameters<T>) =>
		`${cachePrefix}:${stringify(args)}`;

	const cachedFn = async (
		...args: Parameters<T>
	): Promise<Awaited<ReturnType<T>>> => {
		const key = getKey(...args);
		let retries = 0;

		while (retries < maxRetries) {
			try {
				const redis = getRedisCache();
				const cached = await redis.get(key);
				if (cached) {
					const data = deserialize(cached) as Awaited<ReturnType<T>>;

					if (staleWhileRevalidate) {
						const ttl = await redis.ttl(key);
						if (ttl < staleTime) {
							// Return stale data and revalidate in background
							fn(...args)
								.then(async (freshData: Awaited<ReturnType<T>>) => {
									if (freshData !== undefined && freshData !== null) {
										const redis = getRedisCache();
										await redis.setex(key, expireInSec, serialize(freshData));
									}
								})
								.catch((error: unknown) => {
									logger.error(
										`Background revalidation failed for function ${fn.name}:`,
										error
									);
								});
						}
					}

					return data;
				}

				const result = await fn(...args);
				if (result !== undefined && result !== null) {
					await redis.setex(key, expireInSec, serialize(result));
				}
				return result;
			} catch (error: unknown) {
				retries++;
				if (retries === maxRetries) {
					logger.error(
						`Cache error for function ${fn.name} after ${maxRetries} retries:`,
						error
					);
					return fn(...args);
				}
				await new Promise((resolve) => setTimeout(resolve, 100 * retries)); // Exponential backoff
			}
		}

		return fn(...args);
	};

	cachedFn.getKey = getKey;
	cachedFn.clear = async (...args: Parameters<T>) => {
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
