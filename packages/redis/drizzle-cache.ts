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
		await redis.setex(cacheKey, ttl, JSON.stringify(result));
	}

	async function setupInvalidationTracking(
		key: string,
		tables: string[],
		tag?: string
	) {
		const operations: Promise<unknown>[] = tables.map((table) =>
			redis.sadd(formatDependencyKey(table), key)
		);

		if (tag) {
			operations.push(redis.sadd(formatTagKey(tag), key));
		}

		const indexMembers: string[] = [
			...tables.map((table) => formatDependencyKey(table)),
			...(tag ? [formatTagKey(tag)] : []),
		];
		if (indexMembers.length > 0) {
			operations.push(redis.sadd(formatByKeyIndex(key), ...indexMembers));
		}

		await Promise.all(operations);
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
			try {
				const cached = await redis.get(cacheKey);
				if (cached) {
					return JSON.parse(cached);
				}
			} catch {
				// Cache reads are best effort; run the source query on failure.
			}

			if (inflightRequests.has(cacheKey)) {
				return inflightRequests.get(cacheKey) as Promise<T>;
			}

			const promise = (async () => {
				const result = await queryFn();

				try {
					if (autoInvalidate) {
						await setupInvalidationTracking(key, tables, tag);
					}
					await setCacheWithTtl(cacheKey, result, ttl);
				} catch {
					// Cache writes are best effort; return the source result.
				}

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

			const allMembers = await redis.sunion(...dependencyKeys);
			const cacheKeysToDelete = allMembers.map((key) => formatCacheKey(key));

			const byKeyIndexKeys = allMembers.map((key) => formatByKeyIndex(key));

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

			const allMembers = await redis.sunion(...tagKeys);
			const cacheKeysToDelete = allMembers.map((key) => formatCacheKey(key));

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

			const containingSets = await redis.smembers(byKeyIndexKey);
			if (containingSets.length > 0) {
				await Promise.all(
					containingSets.map((setKey) => redis.srem(setKey, key))
				);
			}

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
