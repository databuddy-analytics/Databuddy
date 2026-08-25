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

mock.module("@databuddy/redis", () => ({
	createDrizzleCache,
	invalidateAgentContextSnapshotsForWebsite: mock(async () => undefined),
	redis,
}));

const { funnelCache, invalidateFunnelsCache } = await import("./funnels-cache");

beforeEach(() => {
	kv.clear();
	sets.clear();
});

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
});
