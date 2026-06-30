import {
	getCacheableTagIndexKey,
	invalidateCacheablePattern,
	invalidateCacheableTag,
	invalidateCacheableTags,
	invalidateCacheableWithArgs,
	type CacheInvalidationResult,
} from "./cache-invalidation";
import { getRedisCache } from "./redis";

const activeRevalidations = new Map<string, Promise<void>>();
const inflightRequests = new Map<string, Promise<unknown>>();
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*Z$/;

const REDIS_TIMEOUT_MS = 2000;

let redisAvailable = true;
let lastRedisCheck = 0;

export interface CacheLookupEvent {
	durationMs: number;
	hit: boolean;
}

let _cacheTimingFn: ((event: CacheLookupEvent) => void) | null = null;

export function setCacheTimingFn(fn: (event: CacheLookupEvent) => void) {
	_cacheTimingFn = fn;
}

type CacheTagger<
	T extends (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>,
> = (
	result: Awaited<ReturnType<T>>,
	...args: Parameters<T>
) => Promise<string[]> | string[];

interface CacheOptions<
	T extends (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>,
> {
	expireInSec: number;
	prefix?: string;
	/**
	 * Maximum milliseconds to wait for the underlying function (e.g. a DB
	 * query) before rejecting with a "Query timeout" error.  When unset the
	 * function may hang indefinitely.  Background stale-while-revalidate
	 * fetches are also bounded by this value.
	 */
	queryTimeoutMs?: number;
	staleTime?: number;
	staleWhileRevalidate?: boolean;
	tags?: CacheTagger<T>;
}

export type CacheableFunction<
	T extends (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>,
> = ((...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>) & {
	getKey: (...args: Parameters<T>) => string;
	invalidate: (...args: Parameters<T>) => Promise<void>;
	invalidatePrefix: () => Promise<number>;
	invalidateTag: (tag: string) => Promise<number>;
	invalidateTags: (tags: string[]) => Promise<CacheInvalidationResult>;
	invalidateWithArgs: (knownArgs: unknown[]) => Promise<number>;
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

function markRedisHealthy() {
	redisAvailable = true;
	lastRedisCheck = Date.now();
}

function markRedisUnhealthy() {
	redisAvailable = false;
	lastRedisCheck = Date.now();
}

function withTimeout<T>(
	promise: Promise<T>,
	ms: number,
	message = "Redis timeout"
): Promise<T> {
	let timer: ReturnType<typeof setTimeout>;
	return Promise.race([
		promise,
		new Promise<never>((_, reject) => {
			timer = setTimeout(() => reject(new Error(message)), ms);
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

async function resolveCacheTags<
	T extends (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>,
>(
	tag: CacheTagger<T> | undefined,
	result: Awaited<ReturnType<T>>,
	args: Parameters<T>
): Promise<string[]> {
	if (!tag) {
		return [];
	}
	const tags = await tag(result, ...args);
	return [...new Set(tags.filter(Boolean))];
}

async function indexCacheKey(
	prefix: string,
	key: string,
	tags: string[],
	expireInSec: number
): Promise<void> {
	if (tags.length === 0) {
		return;
	}
	const redis = getRedisCache();
	await Promise.all(
		tags.map(async (tag) => {
			const indexKey = getCacheableTagIndexKey(prefix, tag);
			await withTimeout(redis.sadd(indexKey, key), REDIS_TIMEOUT_MS);
			await withTimeout(redis.expire(indexKey, expireInSec), REDIS_TIMEOUT_MS);
		})
	);
}

async function writeCacheEntry<
	T extends (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>,
>(
	prefix: string,
	key: string,
	serialized: string,
	result: Awaited<ReturnType<T>>,
	args: Parameters<T>,
	expireInSec: number,
	tags?: CacheTagger<T>
): Promise<void> {
	const resolvedTags = await resolveCacheTags(tags, result, args);
	await withTimeout(
		getRedisCache().setex(key, expireInSec, serialized),
		REDIS_TIMEOUT_MS
	);
	try {
		await indexCacheKey(prefix, key, resolvedTags, expireInSec);
	} catch (error) {
		await getRedisCache()
			.del(key)
			.catch(() => {});
		throw error;
	}
}

function triggerBackgroundRevalidation<
	T extends (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>,
>(
	key: string,
	args: Parameters<T>,
	fn: () => Promise<Awaited<ReturnType<T>>>,
	expireInSec: number,
	staleTime: number,
	prefix: string,
	tags?: CacheTagger<T>,
	queryTimeoutMs?: number
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

		const fresh = await (queryTimeoutMs == null
			? fn()
			: withTimeout(fn(), queryTimeoutMs, "Query timeout"));
		if (fresh != null && redisAvailable) {
			try {
				const serialized = JSON.stringify(fresh);
				await writeCacheEntry(
					prefix,
					key,
					serialized,
					fresh,
					args,
					expireInSec,
					tags
				).catch(() => {});
			} catch {
				// JSON.stringify failed
			}
		}
	})()
		.catch(() => {})
		.finally(() => activeRevalidations.delete(key));

	activeRevalidations.set(key, work);
}

export function cacheable<
	T extends (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>,
>(fn: T, options: CacheOptions<T> | number): CacheableFunction<T> {
	const {
		expireInSec,
		prefix = fn.name,
		staleWhileRevalidate = false,
		staleTime = 0,
		tags,
		queryTimeoutMs,
	} = typeof options === "number" ? { expireInSec: options } : options;

	const cachePrefix = `cacheable:${prefix}`;
	const getKey = (...args: Parameters<T>) =>
		`${cachePrefix}:${stringify(args)}`;

	const cachedFn = async (
		...args: Parameters<T>
	): Promise<Awaited<ReturnType<T>>> => {
		if (shouldSkipRedis()) {
			return queryTimeoutMs == null
				? fn(...args)
				: withTimeout(fn(...args), queryTimeoutMs, "Query timeout");
		}

		const key = getKey(...args);

		const timingFn = _cacheTimingFn;
		const lookupStartedAt = timingFn ? performance.now() : 0;

		let cached: string | null = null;
		try {
			const redis = getRedisCache();
			cached = await withTimeout(redis.get(key), REDIS_TIMEOUT_MS);
			markRedisHealthy();
		} catch {
			markRedisUnhealthy();
			timingFn?.({
				durationMs: performance.now() - lookupStartedAt,
				hit: false,
			});
			return queryTimeoutMs == null
				? fn(...args)
				: withTimeout(fn(...args), queryTimeoutMs, "Query timeout");
		}

		timingFn?.({
			durationMs: performance.now() - lookupStartedAt,
			hit: Boolean(cached),
		});

		if (cached) {
			if (staleWhileRevalidate && staleTime > 0) {
				triggerBackgroundRevalidation(
					key,
					args,
					() => fn(...args),
					expireInSec,
					staleTime,
					prefix,
					tags,
					queryTimeoutMs
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

		const rawPromise = fn(...args);
		const promise =
			queryTimeoutMs == null
				? rawPromise
				: withTimeout(rawPromise, queryTimeoutMs, "Query timeout");
		inflightRequests.set(key, promise);

		try {
			const result = await promise;

			if (result != null && redisAvailable) {
				try {
					const serialized = JSON.stringify(result);
					writeCacheEntry(
						prefix,
						key,
						serialized,
						result,
						args,
						expireInSec,
						tags
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
	cachedFn.invalidate = async (...args: Parameters<T>) => {
		await getRedisCache().del(getKey(...args));
	};
	cachedFn.invalidatePrefix = () =>
		invalidateCacheablePattern(`${cachePrefix}:*`);
	cachedFn.invalidateTag = (tag: string) => invalidateCacheableTag(prefix, tag);
	cachedFn.invalidateTags = (cacheTags: string[]) =>
		invalidateCacheableTags(prefix, cacheTags);
	cachedFn.invalidateWithArgs = (knownArgs: unknown[]) =>
		invalidateCacheableWithArgs(prefix, knownArgs);
	return cachedFn;
}
