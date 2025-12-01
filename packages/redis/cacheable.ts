import { getRedisCache } from "./redis";

const activeRevalidations = new Map<string, Promise<void>>();
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*Z$/;

let redisAvailable = true;
let lastRedisCheck = 0;

type CacheOptions = {
	expireInSec: number;
	prefix?: string;
	staleWhileRevalidate?: boolean;
	staleTime?: number;
};

function deserialize(data: string): unknown {
	return JSON.parse(data, (_, value) => {
		if (typeof value === "string" && DATE_REGEX.test(value)) {
			return new Date(value);
		}
		return value;
	});
}

function shouldSkipRedis(): boolean {
	if (!redisAvailable && Date.now() - lastRedisCheck < 30_000) {
		return true;
	}
	if (!redisAvailable) {
		redisAvailable = true;
		lastRedisCheck = Date.now();
	}
	return false;
}

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
	if (typeof obj === "number" || typeof obj === "string") {
		return String(obj);
	}
	if (typeof obj === "function") {
		return obj.toString();
	}
	if (Array.isArray(obj)) {
		return `[${obj.map(stringify).join(",")}]`;
	}
	if (typeof obj === "object") {
		return Object.entries(obj)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([k, v]) => `${k}:${stringify(v)}`)
			.join(":");
	}
	return String(obj);
}

export function cacheable<T extends (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>>(
	fn: T,
	options: CacheOptions | number
) {
	const {
		expireInSec,
		prefix = fn.name,
		staleWhileRevalidate = false,
		staleTime = 0,
	} = typeof options === "number" ? { expireInSec: options } : options;

	const cachePrefix = `cacheable:${prefix}`;
	const getKey = (...args: Parameters<T>) => `${cachePrefix}:${stringify(args)}`;

	const cachedFn = async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
		if (shouldSkipRedis()) {
			return fn(...args);
		}

		const key = getKey(...args);

		try {
			const redis = getRedisCache();
			const cached = await redis.get(key);
			redisAvailable = true;
			lastRedisCheck = Date.now();

			if (cached) {
				if (staleWhileRevalidate) {
					const ttl = await redis.ttl(key).catch(() => expireInSec);
					if (ttl < staleTime && !activeRevalidations.has(key)) {
						const revalidation = fn(...args)
							.then(async (fresh) => {
								if (fresh != null && redisAvailable) {
									await redis.setex(key, expireInSec, JSON.stringify(fresh)).catch(() => { });
								}
							})
							.catch(() => { })
							.finally(() => activeRevalidations.delete(key));
						activeRevalidations.set(key, revalidation);
					}
				}
				return deserialize(cached) as Awaited<ReturnType<T>>;
			}

			const result = await fn(...args);
			if (result != null && redisAvailable) {
				await redis.setex(key, expireInSec, JSON.stringify(result)).catch(() => {
					redisAvailable = false;
					lastRedisCheck = Date.now();
				});
			}
			return result;
		} catch {
			redisAvailable = false;
			lastRedisCheck = Date.now();
			return fn(...args);
		}
	};

	cachedFn.getKey = getKey;
	return cachedFn;
}
