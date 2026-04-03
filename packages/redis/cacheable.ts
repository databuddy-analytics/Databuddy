import type { Span } from "@opentelemetry/api";
import { SpanStatusCode, trace } from "@opentelemetry/api";
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

function endSpanWithError(span: Span, error: unknown) {
	span.setStatus({
		code: SpanStatusCode.ERROR,
		message: error instanceof Error ? error.message : String(error),
	});
	span.end();
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

	const cachedFn = (
		...args: Parameters<T>
	): Promise<Awaited<ReturnType<T>>> => {
		if (shouldSkipRedis()) {
			return fn(...args);
		}

		const key = getKey(...args);
		const tracer = trace.getTracer("redis");

		return tracer.startActiveSpan(
			`cache:${prefix}`,
			async (span): Promise<Awaited<ReturnType<T>>> => {
				span.setAttribute("cache.prefix", prefix);

				// Phase 1: Cache lookup (only redis errors trip the breaker)
				let cached: string | null = null;
				try {
					const redis = getRedisCache();
					cached = await withTimeout(redis.get(key), REDIS_TIMEOUT_MS);
					markRedisHealthy();
				} catch (error) {
					markRedisUnhealthy();
					span.setAttribute("cache.hit", false);
					span.setAttribute("cache.error", true);
					endSpanWithError(span, error);
					return fn(...args);
				}

				// Phase 2: Cache hit (JSON errors do NOT trip the breaker)
				if (cached) {
					span.setAttribute("cache.hit", true);

					if (staleWhileRevalidate && staleTime > 0) {
						triggerBackgroundRevalidation(
							key,
							() => fn(...args),
							expireInSec,
							staleTime
						);
					}

					try {
						const result = deserialize(cached) as Awaited<ReturnType<T>>;
						span.setStatus({ code: SpanStatusCode.OK });
						span.end();
						return result;
					} catch {
						// Corrupted cache data — fall through to cache miss
						span.setAttribute("cache.corrupt", true);
					}
				}

				// Phase 3: Cache miss with single-flight deduplication
				span.setAttribute("cache.hit", false);

				if (inflightRequests.has(key)) {
					span.setAttribute("cache.coalesced", true);
					try {
						const result = (await inflightRequests.get(key)) as Awaited<
							ReturnType<T>
						>;
						span.setStatus({ code: SpanStatusCode.OK });
						span.end();
						return result;
					} catch (error) {
						endSpanWithError(span, error);
						throw error;
					}
				}

				const promise = fn(...args);
				inflightRequests.set(key, promise);

				try {
					const result = await promise;

					// Fire-and-forget cache write
					if (result != null && redisAvailable) {
						try {
							const serialized = JSON.stringify(result);
							const redis = getRedisCache();
							withTimeout(
								redis.setex(key, expireInSec, serialized),
								REDIS_TIMEOUT_MS
							).catch(() => markRedisUnhealthy());
						} catch {
							// JSON.stringify failed — do NOT affect redis state
						}
					}

					span.setStatus({ code: SpanStatusCode.OK });
					span.end();
					return result;
				} catch (error) {
					endSpanWithError(span, error);
					throw error;
				} finally {
					inflightRequests.delete(key);
				}
			}
		);
	};

	cachedFn.getKey = getKey;
	return cachedFn;
}
