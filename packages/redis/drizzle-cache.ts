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
	queryFn: () => Promise<T>;
};

// Add a custom log function
function logIfDebug(type: 'info' | 'error', ...args: any[]) {
	if (!process.env.DEBUG) {
		return;
	}
	if (type === 'error') {
		console.error(...args);
	} else {
		console.info(...args);
	}
}

// In-memory map for single-flight (per process)
const inflight = new Map<string, Promise<any>>();

export function createDrizzleCache({
	redis,
	namespace = 'cache',
}: CacheConfig) {
	const makeKey = (k: string) => `${namespace}:${k}`;
	const makeDepKey = (table: string) => `${namespace}:dep:${table}`;
	const makeTagKey = (tag: string) => `${namespace}:tag:${tag}`;

	return {
		async withCache<T>({
			key,
			ttl = 60,
			tables = [],
			tag,
			autoInvalidate = true,
			queryFn,
		}: WithCacheArgs<T>): Promise<T> {
			const cacheKey = makeKey(key);
			const start = Date.now();

			try {
				const existing = await redis.get(cacheKey);
				if (existing) {
					const duration = Date.now() - start;
					logIfDebug(
						'info',
						`[drizzle-cache] HIT: ${cacheKey} (${duration}ms)`
					);
					return JSON.parse(existing);
				}
			} catch (err) {
				logIfDebug(
					'error',
					`[drizzle-cache] ERROR: Redis GET failed for ${cacheKey}`,
					err
				);
			}

			// Single-flight: if another miss is in progress, wait for it
			if (inflight.has(cacheKey)) {
				logIfDebug('info', `[drizzle-cache] WAIT: ${cacheKey} (single-flight)`);
				return inflight.get(cacheKey) as Promise<T>;
			}

			const missStart = Date.now();
			logIfDebug('info', `[drizzle-cache] MISS: ${cacheKey}`);

			// Start the miss and store the promise
			const missPromise = (async () => {
				const result = await queryFn();

				// Set cache and expire
				const setStart = Date.now();
				try {
					await redis.set(cacheKey, JSON.stringify(result));
					await redis.expire(cacheKey, ttl);
					const setDuration = Date.now() - setStart;
					logIfDebug(
						'info',
						`[drizzle-cache] SET+EXPIRE: ${cacheKey} (${setDuration}ms, ttl=${ttl}s)`
					);
				} catch (err) {
					logIfDebug(
						'error',
						`[drizzle-cache] ERROR: Redis SET/EXPIRE failed for ${cacheKey}`,
						err
					);
				}

				// Auto-invalidate
				if (autoInvalidate) {
					const invStart = Date.now();
					try {
						for (const table of tables) {
							await redis.sadd(makeDepKey(table), key);
						}
						if (tag) {
							await redis.sadd(makeTagKey(tag), key);
						}
						const invDuration = Date.now() - invStart;
						logIfDebug(
							'info',
							`[drizzle-cache] AUTO-INVALIDATE: tables=[${tables.join(',')}] tag=${tag ?? ''} (${invDuration}ms)`
						);
					} catch (err) {
						logIfDebug(
							'error',
							`[drizzle-cache] ERROR: Auto-invalidate failed for ${cacheKey}`,
							err
						);
					}
				}

				const duration = Date.now() - missStart;
				logIfDebug(
					'info',
					`[drizzle-cache] MISS-RESOLVED: ${cacheKey} (${duration}ms)`
				);

				return result;
			})();

			inflight.set(cacheKey, missPromise);
			try {
				return await missPromise;
			} finally {
				inflight.delete(cacheKey);
			}
		},

		async invalidateByTables(tables: string[]) {
			const keys = new Set<string>();
			for (const table of tables) {
				const depKey = makeDepKey(table);
				const members = await redis.smembers(depKey);
				for (const k of members) {
					keys.add(makeKey(k));
				}
				await redis.del(depKey);
			}

			if (keys.size > 0) {
				await redis.del(...Array.from(keys));
			}
		},

		async invalidateByTags(tags: string[]) {
			const keys = new Set<string>();
			for (const tag of tags) {
				const tagKey = makeTagKey(tag);
				const members = await redis.smembers(tagKey);
				for (const k of members) {
					keys.add(makeKey(k));
				}
				await redis.del(tagKey);
			}

			if (keys.size > 0) {
				await redis.del(...Array.from(keys));
			}
		},

		async invalidateByKey(key: string) {
			const cacheKey = makeKey(key);
			await redis.del(cacheKey);
			// Remove from all dependency sets
			// Find all dep/tag sets (scan keys)
			const depKeys = await redis.keys(`${namespace}:dep:*`);
			for (const depKey of depKeys) {
				await redis.srem(depKey, key);
			}
			const tagKeys = await redis.keys(`${namespace}:tag:*`);
			for (const tagKey of tagKeys) {
				await redis.srem(tagKey, key);
			}
		},

		async cleanupDeps() {
			// Clean up empty dep sets
			const depKeys = await redis.keys(`${namespace}:dep:*`);
			for (const depKey of depKeys) {
				const count = await redis.scard(depKey);
				if (count === 0) {
					await redis.del(depKey);
				}
			}
			// Clean up empty tag sets
			const tagKeys = await redis.keys(`${namespace}:tag:*`);
			for (const tagKey of tagKeys) {
				const count = await redis.scard(tagKey);
				if (count === 0) {
					await redis.del(tagKey);
				}
			}
		},
	};
}
