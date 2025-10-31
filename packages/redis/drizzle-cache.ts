import type { redis as redisClient } from './redis';

export type CacheConfig = {
	redis: typeof redisClient;
	namespace?: string;
};

export type WithCacheArgs<T> = {
	key: string;
	ttl?: number;
	tables?: string[];
	tag?: string;
	autoInvalidate?: boolean;
	disabled?: boolean;
	queryFn: () => Promise<T>;
};

function debugLog(
	level: 'info' | 'error',
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
	namespace = 'cache',
}: CacheConfig) {
	const formatCacheKey = (key: string) => `${namespace}:${key}`;
	const formatDependencyKey = (table: string) => `${namespace}:dep:${table}`;
	const formatTagKey = (tag: string) => `${namespace}:tag:${tag}`;
	const formatByKeyIndex = (key: string) => `${namespace}:by-key:${key}`;

	function collectEmptyKeys(keys: string[], counts: number[]): string[] {
		const empties: string[] = [];
		for (let i = 0; i < keys.length; i++) {
			if (counts[i] === 0) {
				empties.push(keys[i]);
			}
		}
		return empties;
	}

	async function setCacheWithTtl(
		cacheKey: string,
		result: unknown,
		ttl: number
	) {
		const start = Date.now();
		try {
			await redis.set(cacheKey, JSON.stringify(result), 'EX', ttl);
			const duration = Date.now() - start;
			debugLog('info', `SET: ${cacheKey} (${duration}ms, ttl=${ttl}s)`);
		} catch (error) {
			debugLog('error', `Redis SET failed for ${cacheKey}`, error);
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
				'info',
				`TRACKING: tables=[${tables.join(',')}] tag=${tag ?? ''} (${duration}ms)`
			);
		} catch (error) {
			debugLog('error', `Invalidation tracking failed for key ${key}`, error);
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
					debugLog('info', `HIT: ${cacheKey} (${duration}ms)`);
					return JSON.parse(cached);
				}
			} catch (error) {
				debugLog('error', `Redis GET failed for ${cacheKey}`, error);
			}

			// Single-flight protection: wait for existing request
			if (inflightRequests.has(cacheKey)) {
				debugLog('info', `WAIT: ${cacheKey} (single-flight)`);
				return inflightRequests.get(cacheKey) as Promise<T>;
			}

			const missStart = Date.now();
			debugLog('info', `MISS: ${cacheKey}`);

			const promise = (async () => {
				const result = await queryFn();
				await setCacheWithTtl(cacheKey, result, ttl);

				if (autoInvalidate) {
					await setupInvalidationTracking(key, tables, tag);
				}

				const duration = Date.now() - missStart;
				debugLog('info', `RESOLVED: ${cacheKey} (${duration}ms)`);
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
			const [dependencyKeys, tagKeys, byKeyIndexKeys] = await Promise.all([
				redis.keys(`${namespace}:dep:*`),
				redis.keys(`${namespace}:tag:*`),
				redis.keys(`${namespace}:by-key:*`),
			]);

			const [dependencyCounts, tagCounts, byKeyCounts] = await Promise.all([
				Promise.all(dependencyKeys.map((depKey) => redis.scard(depKey))),
				Promise.all(tagKeys.map((tagKey) => redis.scard(tagKey))),
				Promise.all(byKeyIndexKeys.map((idxKey) => redis.scard(idxKey))),
			]);

			const emptyKeys: string[] = [
				...collectEmptyKeys(dependencyKeys, dependencyCounts),
				...collectEmptyKeys(tagKeys, tagCounts),
				...collectEmptyKeys(byKeyIndexKeys, byKeyCounts),
			];

			if (emptyKeys.length > 0) {
				await redis.unlink(...emptyKeys);
			}
		},
	};
}
