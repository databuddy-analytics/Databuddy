import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import { createDrizzleCache } from './drizzle-cache';
import { getRedisCache } from './redis';

const redis = getRedisCache();
const cache = createDrizzleCache({ redis, namespace: 'test' });

beforeEach(async () => {
	await redis.flushdb();
});

afterAll(async () => {
	await redis.quit();
});

describe('drizzle-cache', () => {
	it('caches and returns values (hit/miss)', async () => {
		let calls = 0;
		const result = await cache.withCache({
			key: 'a',
			queryFn: async () => {
				calls++;
				return await Promise.resolve('foo');
			},
		});
		expect(result).toBe('foo');
		expect(calls).toBe(1);
		const hit = await cache.withCache({
			key: 'a',
			queryFn: async () => {
				calls++;
				return await Promise.resolve('bar');
			},
		});
		expect(hit).toBe('foo');
		expect(calls).toBe(1);
	});

	it('expires cache after TTL', async () => {
		let calls = 0;
		await cache.withCache({
			key: 'b',
			ttl: 1,
			queryFn: async () => {
				calls++;
				return await Promise.resolve('baz');
			},
		});
		await new Promise((r) => setTimeout(r, 1100));
		const result = await cache.withCache({
			key: 'b',
			ttl: 1,
			queryFn: async () => {
				calls++;
				return await Promise.resolve('qux');
			},
		});
		expect(result).toBe('qux');
		expect(calls).toBe(2);
	});

	it('single-flight: only one queryFn runs on concurrent miss', async () => {
		let calls = 0;
		const fn = async () => {
			calls++;
			await new Promise((r) => setTimeout(r, 10));
			return 'sf';
		};
		const [a, b] = await Promise.all([
			cache.withCache({ key: 'sf', queryFn: fn }),
			cache.withCache({ key: 'sf', queryFn: fn }),
		]);
		expect(a).toBe('sf');
		expect(b).toBe('sf');
		expect(calls).toBe(1);
	});

	it('granular invalidation by table', async () => {
		await cache.withCache({
			key: 'c',
			tables: ['t1'],
			queryFn: async () => 'v1',
		});
		await cache.withCache({
			key: 'd',
			tables: ['t1'],
			queryFn: async () => 'v2',
		});
		await cache.invalidateByTables(['t1']);
		const v1 = await cache.withCache({ key: 'c', queryFn: async () => 'nv1' });
		const v2 = await cache.withCache({ key: 'd', queryFn: async () => 'nv2' });
		expect(v1).toBe('nv1');
		expect(v2).toBe('nv2');
	});

	it('granular invalidation by tag', async () => {
		await cache.withCache({ key: 'e', tag: 'tag1', queryFn: async () => 'v1' });
		await cache.withCache({ key: 'f', tag: 'tag1', queryFn: async () => 'v2' });
		await cache.invalidateByTags(['tag1']);
		const v1 = await cache.withCache({ key: 'e', queryFn: async () => 'nv1' });
		const v2 = await cache.withCache({ key: 'f', queryFn: async () => 'nv2' });
		expect(v1).toBe('nv1');
		expect(v2).toBe('nv2');
	});

	it('partial invalidation by key', async () => {
		await cache.withCache({
			key: 'g',
			tables: ['t2'],
			queryFn: async () => 'v1',
		});
		await cache.withCache({
			key: 'h',
			tables: ['t2'],
			queryFn: async () => 'v2',
		});
		await cache.invalidateByKey('g');
		const v1 = await cache.withCache({ key: 'g', queryFn: async () => 'nv1' });
		const v2 = await cache.withCache({ key: 'h', queryFn: async () => 'v2' });
		expect(v1).toBe('nv1');
		expect(v2).toBe('v2');
	});

	it('cleanupDeps removes empty dep/tag sets', async () => {
		await cache.withCache({
			key: 'i',
			tables: ['t3'],
			tag: 'tag3',
			queryFn: async () => 'v',
		});
		await cache.invalidateByKey('i');
		await cache.cleanupEmptySets();
		const depMembers = await redis.smembers('test:dep:t3');
		const tagMembers = await redis.smembers('test:tag:tag3');
		expect(depMembers).toEqual([]);
		expect(tagMembers).toEqual([]);
	});
});
