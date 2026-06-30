import type { redis as redisClient } from "./redis";

export interface CacheConfig {
	namespace?: string;
	redis: typeof redisClient;
}

export interface WithCacheArgs<T> {
	autoInvalidate?: boolean;
	disabled?: boolean;
	key: string;
	queryFn: () => Promise<T>;
	tables?: string[];
	tag?: string;
	ttl?: number;
}

function debugLog(
	level: "info" | "error",
	message: string,
	...args: unknown[]
) {
	if (!process.env.DEBUG) {
		return;
	}
	console[level](`[drizzle-cache] ${message}`, ...args);
}

const inflightRequests = new Map<string, Promise<unknown>>();

export function createDrizzleCache({
	redis,
	namespace = "cache",
}: CacheConfig) {
	const formatCacheKey = (key: string) => `${namespace}:${key}`;
	const formatDependencyKey = (table: string) => `${namespace}:dep:${table}`;
	const formatTagKey = (tag: string) => `${namespace}:tag:${tag}`;
	const formatByKeyIndex = (key: string) => `${namespace}:by-key:${key}`;

	async function scanKeys(pattern: string): Promise<string[]> {
		const keys: string[] = [];
		let cursor = "0";
		do {
			const [next, batch] = await redis.scan(
				cursor,
				"MATCH",
				pattern,
				"COUNT",
				200
			);
			cursor = next;
			keys.push(...batch);
		} while (cursor !== "0");
		return keys;
	}

	async function setCacheWithTtl(
		cacheKey: string,
		result: unknown,
		ttl: number
	) {
		const start = Date.now();
		try {
			await redis.setex(cacheKey, ttl, JSON.stringify(result));
			const duration = Date.now() - start;
			debugLog("info", `SET: ${cacheKey} (${duration}ms, ttl=${ttl}s)`);
		} catch (error) {
			debugLog("error", `Redis SET failed for ${cacheKey}`, error);
		}
	}

	async function setupInvalidationTracking(
		key: string,
		tables: string[],
		tag?: string
	) {
		const start = Date.now();
		try {
			const operations: Promise<unknown>[] = tables.map((table) =>
				redis.sadd(formatDependencyKey(table), key)
			);

			if (tag) {
				operations.push(redis.sadd(formatTagKey(tag), key));
			}

			// maintain reverse index of sets containing this logical key
			const indexMembers: string[] = [
				...tables.map((table) => formatDependencyKey(table)),
				...(tag ? [formatTagKey(tag)] : []),
			];
			if (indexMembers.length > 0) {
				operations.push(redis.sadd(formatByKeyIndex(key), ...indexMembers));
			}

			await Promise.all(operations);

			const duration = Date.now() - start;
			debugLog(
				"info",
				`TRACKING: tables=[${tables.join(",")}] tag=${tag ?? ""} (${duration}ms)`
			);
		} catch (error) {
			debugLog("error", `Invalidation tracking failed for key ${key}`, error);
			throw error;
		}
	}

	return {
		async withCache<T>({
			key,
			ttl = 60,
			tables = [],
			tag,
			autoInvalidate = true,
			disabled = false,
			queryFn,
		}: WithCacheArgs<T>): Promise<T> {
			if (disabled) {
				return queryFn();
			}

			const cacheKey = formatCacheKey(key);
			const start = Date.now();

			try {
				const cached = await redis.get(cacheKey);
				if (cached) {
					const duration = Date.now() - start;
					debugLog("info", `HIT: ${cacheKey} (${duration}ms)`);
					return JSON.parse(cached);
				}
			} catch (error) {
				debugLog("error", `Redis GET failed for ${cacheKey}`, error);
			}

			// Single-flight protection: wait for existing request
			if (inflightRequests.has(cacheKey)) {
				debugLog("info", `WAIT: ${cacheKey} (single-flight)`);
				return inflightRequests.get(cacheKey) as Promise<T>;
			}

			const missStart = Date.now();
			debugLog("info", `MISS: ${cacheKey}`);

			const promise = (async () => {
				const result = await queryFn();

				try {
					if (autoInvalidate) {
						await setupInvalidationTracking(key, tables, tag);
					}
					await setCacheWithTtl(cacheKey, result, ttl);
				} catch (error) {
					debugLog("error", `Cache write skipped for ${cacheKey}`, error);
				}

				const duration = Date.now() - missStart;
				debugLog("info", `RESOLVED: ${cacheKey} (${duration}ms)`);
				return result;
			})();

			inflightRequests.set(cacheKey, promise);
			try {
				return await promise;
			} finally {
				inflightRequests.delete(cacheKey);
			}
		},

		async invalidateByTables(tables: string[]) {
			if (tables.length === 0) {
				return;
			}

			const dependencyKeys = tables.map((table) => formatDependencyKey(table));

			// Use SUNION to get all members from all dependency sets at once
			const allMembers = await redis.sunion(...dependencyKeys);
			const cacheKeysToDelete = allMembers.map((key) => formatCacheKey(key));

			// Also delete reverse-index entries for affected logical keys
			const byKeyIndexKeys = allMembers.map((key) => formatByKeyIndex(key));

			// Delete dependency sets, cache keys, and reverse-index keys in one operation
			const keysToDelete = [
				...dependencyKeys,
				...cacheKeysToDelete,
				...byKeyIndexKeys,
			];
			if (keysToDelete.length > 0) {
				await redis.unlink(...keysToDelete);
			}
		},

		async invalidateByTags(tags: string[]) {
			if (tags.length === 0) {
				return;
			}

			const tagKeys = tags.map((tag) => formatTagKey(tag));

			// Use SUNION to get all members from all tag sets at once
			const allMembers = await redis.sunion(...tagKeys);
			const cacheKeysToDelete = allMembers.map((key) => formatCacheKey(key));

			// Also delete reverse-index entries for affected logical keys
			const byKeyIndexKeys = allMembers.map((key) => formatByKeyIndex(key));

			// Delete tag sets, cache keys, and reverse-index keys in one operation
			const keysToDelete = [
				...tagKeys,
				...cacheKeysToDelete,
				...byKeyIndexKeys,
			];
			if (keysToDelete.length > 0) {
				await redis.unlink(...keysToDelete);
			}
		},

		async invalidateByKey(key: string) {
			const cacheKey = formatCacheKey(key);
			const byKeyIndexKey = formatByKeyIndex(key);

			// Find all sets that contain this logical key
			const containingSets = await redis.smembers(byKeyIndexKey);
			if (containingSets.length > 0) {
				await Promise.all(
					containingSets.map((setKey) => redis.srem(setKey, key))
				);
			}

			// Remove cache entry and reverse index entry
			await redis.unlink(cacheKey, byKeyIndexKey);
		},

		async cleanupEmptySets() {
			const allKeys = (
				await Promise.all([
					scanKeys(`${namespace}:dep:*`),
					scanKeys(`${namespace}:tag:*`),
					scanKeys(`${namespace}:by-key:*`),
				])
			).flat();

			const counts = await Promise.all(allKeys.map((k) => redis.scard(k)));
			const emptyKeys = allKeys.filter((_, i) => counts[i] === 0);

			if (emptyKeys.length > 0) {
				await redis.unlink(...emptyKeys);
			}
		},
	};
}
