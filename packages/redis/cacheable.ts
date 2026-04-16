import { getRedisCache } from "./redis";

const activeRevalidations = new Map<string, Promise<void>>();
const inflightRequests = new Map<string, Promise<unknown>>();
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*Z$/;

const REDIS_TIMEOUT_MS = 2000;

let redisAvailable = true;
let lastRedisCheck = 0;

interface CacheOptions {
	expireInSec: number;
	prefix?: string;
	staleTime?: number;
	staleWhileRevalidate?: boolean;
}

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

function markRedisHealthy() {
	redisAvailable = true;
	lastRedisCheck = Date.now();
}

function markRedisUnhealthy() {
	redisAvailable = false;
	lastRedisCheck = Date.now();
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	let timer: Timer;
	return Promise.race([
		promise,
		new Promise<never>((_, reject) => {
			timer = setTimeout(() => reject(new Error("Redis timeout")), ms);
		}),
	]).finally(() => clearTimeout(timer));
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

function triggerBackgroundRevalidation<T>(
	key: string,
	fn: () => Promise<T>,
	expireInSec: number,
	staleTime: number
) {
	if (activeRevalidations.has(key)) {
		return;
	}

	const work = (async () => {
		const redis = getRedisCache();
		const ttl = await withTimeout(redis.ttl(key), REDIS_TIMEOUT_MS).catch(
			() => expireInSec
		);

		if (ttl >= staleTime) {
			return;
		}

		const fresh = await fn();
		if (fresh != null && redisAvailable) {
			const serialized = JSON.stringify(fresh);
			await withTimeout(
				redis.setex(key, expireInSec, serialized),
				REDIS_TIMEOUT_MS
			).catch(() => {});
		}
	})()
		.catch(() => {})
		.finally(() => activeRevalidations.delete(key));

	activeRevalidations.set(key, work);
}

export function cacheable<
	T extends (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>,
>(fn: T, options: CacheOptions | number) {
	const {
		expireInSec,
		prefix = fn.name,
		staleWhileRevalidate = false,
		staleTime = 0,
	} = typeof options === "number" ? { expireInSec: options } : options;

	const cachePrefix = `cacheable:${prefix}`;
	const getKey = (...args: Parameters<T>) =>
		`${cachePrefix}:${stringify(args)}`;

	const cachedFn = async (
		...args: Parameters<T>
	): Promise<Awaited<ReturnType<T>>> => {
		if (shouldSkipRedis()) {
			return fn(...args);
		}

		const key = getKey(...args);

		let cached: string | null = null;
		try {
			const redis = getRedisCache();
			cached = await withTimeout(redis.get(key), REDIS_TIMEOUT_MS);
			markRedisHealthy();
		} catch {
			markRedisUnhealthy();
			return fn(...args);
		}

		if (cached) {
			if (staleWhileRevalidate && staleTime > 0) {
				triggerBackgroundRevalidation(
					key,
					() => fn(...args),
					expireInSec,
					staleTime
				);
			}

			try {
				return deserialize(cached) as Awaited<ReturnType<T>>;
			} catch {
				// Corrupted cache data — fall through to cache miss
			}
		}

		if (inflightRequests.has(key)) {
			return (await inflightRequests.get(key)) as Awaited<ReturnType<T>>;
		}

		const promise = fn(...args);
		inflightRequests.set(key, promise);

		try {
			const result = await promise;

			if (result != null && redisAvailable) {
				try {
					const serialized = JSON.stringify(result);
					const redis = getRedisCache();
					withTimeout(
						redis.setex(key, expireInSec, serialized),
						REDIS_TIMEOUT_MS
					).catch(() => markRedisUnhealthy());
				} catch {
					// JSON.stringify failed
				}
			}

			return result;
		} finally {
			inflightRequests.delete(key);
		}
	};

	cachedFn.getKey = getKey;
	return cachedFn;
}
