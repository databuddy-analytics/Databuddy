import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createDrizzleCache } from "@databuddy/redis/drizzle-cache";

const kv = new Map<string, string>();
const sets = new Map<string, Set<string>>();

const redis = {
	get: mock(async (key: string) => kv.get(key) ?? null),
	setex: mock(async (key: string, _ttl: number, value: string) => {
		kv.set(key, value);
		return "OK" as const;
	}),
	sadd: mock(async (key: string, ...members: string[]) => {
		const set = sets.get(key) ?? new Set<string>();
		for (const member of members) {
			set.add(member);
		}
		sets.set(key, set);
		return members.length;
	}),
	smembers: mock(async (key: string) => Array.from(sets.get(key) ?? [])),
	srem: mock(async (key: string, member: string) => {
		sets.get(key)?.delete(member);
		return 1;
	}),
	unlink: mock(async (...keys: string[]) => {
		for (const key of keys) {
			kv.delete(key);
			sets.delete(key);
		}
		return keys.length;
	}),
	sunion: mock(async (...keys: string[]) => {
		const out = new Set<string>();
		for (const key of keys) {
			for (const member of sets.get(key) ?? []) {
				out.add(member);
			}
		}
		return Array.from(out);
	}),
};

let failUnlink = false;
const unlinkImplementation = redis.unlink.getMockImplementation();
redis.unlink.mockImplementation(async (...keys: string[]) => {
	if (failUnlink) {
		throw new Error("redis unavailable");
	}
	return unlinkImplementation?.(...keys) ?? keys.length;
});

mock.module("@databuddy/redis", () => ({
	createDrizzleCache,
	invalidateAgentContextSnapshotsForWebsite: mock(async () => undefined),
	redis,
}));

const { funnelCache, invalidateFunnelsCache } = await import("./funnels-cache");

beforeEach(() => {
	kv.clear();
	sets.clear();
	failUnlink = false;
});

function cachedAnalytics(funnelId: string, key: string) {
	let calls = 0;
	const read = () =>
		funnelCache.withCache({
			key,
			queryFn: async () => {
				calls += 1;
				return { funnelId, version: calls };
			},
			tables: ["funnelDefinitions"],
			tag: `funnel:${funnelId}`,
			ttl: 180,
		});
	return { read, calls: () => calls };
}

describe("invalidateFunnelsCache", () => {
	it("invalidates the exact key a cached getById lookup is stored under", async () => {
		const funnelId = "funnel-1";
		let calls = 0;

		const readFunnel = () =>
			funnelCache.withCache({
				key: `byId:${funnelId}`,
				queryFn: async () => {
					calls += 1;
					return { id: funnelId, name: `v${calls}` };
				},
				tables: ["funnelDefinitions"],
				ttl: 300,
			});

		expect(await readFunnel()).toEqual({ id: funnelId, name: "v1" });
		expect(await readFunnel()).toEqual({ id: funnelId, name: "v1" });
		expect(calls).toBe(1);

		await invalidateFunnelsCache("website-1", funnelId);

		expect(await readFunnel()).toEqual({ id: funnelId, name: "v2" });
		expect(calls).toBe(2);
	});

	it("invalidates the exact key a cached list lookup is stored under", async () => {
		const websiteId = "website-2";
		let calls = 0;

		const readList = () =>
			funnelCache.withCache({
				key: `list:${websiteId}`,
				queryFn: async () => {
					calls += 1;
					return [{ id: `funnel-${calls}` }];
				},
				tables: ["funnelDefinitions"],
				ttl: 300,
			});

		await readList();
		await readList();
		expect(calls).toBe(1);

		await invalidateFunnelsCache(websiteId);

		await readList();
		expect(calls).toBe(2);
	});

	it("invalidates every tag-cached analytics entry for the mutated funnel", async () => {
		const funnelId = "funnel-3";
		const conversion = cachedAnalytics(
			funnelId,
			`analytics:${funnelId}:2026-01-01:2026-01-31`
		);
		const byReferrer = cachedAnalytics(
			funnelId,
			`analyticsByReferrer:${funnelId}:2026-01-01:2026-01-31`
		);

		await conversion.read();
		await byReferrer.read();
		await conversion.read();
		expect(conversion.calls()).toBe(1);
		expect(byReferrer.calls()).toBe(1);

		await invalidateFunnelsCache("website-3", funnelId);

		await conversion.read();
		await byReferrer.read();
		expect(conversion.calls()).toBe(2);
		expect(byReferrer.calls()).toBe(2);
	});

	it("leaves analytics for other funnels cached", async () => {
		const other = cachedAnalytics(
			"funnel-other",
			"analytics:funnel-other:2026-01-01:2026-01-31"
		);

		await other.read();
		await invalidateFunnelsCache("website-4", "funnel-4");
		await other.read();

		expect(other.calls()).toBe(1);
	});

	it("resolves even when a cache backend operation fails", async () => {
		failUnlink = true;

		await expect(
			invalidateFunnelsCache("website-5", "funnel-5")
		).resolves.toBeUndefined();
	});
});
