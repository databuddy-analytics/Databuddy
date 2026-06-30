import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

interface RedisEntry {
	ttl: number;
	value: string;
}

const redisStore = new Map<string, RedisEntry>();
const redisSets = new Map<string, Set<string>>();
let failGet = false;

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesRedisPattern(pattern: string, key: string): boolean {
	let source = "^";
	for (let i = 0; i < pattern.length; i++) {
		const char = pattern[i];
		if (char === "\\") {
			const next = pattern[i + 1];
			if (next) {
				source += escapeRegex(next);
				i += 1;
			}
			continue;
		}
		if (char === "*") {
			source += ".*";
			continue;
		}
		if (char === "?") {
			source += ".";
			continue;
		}
		source += escapeRegex(char ?? "");
	}
	return new RegExp(`${source}$`).test(key);
}

const mockRedisClient = {
	del: mock(async (...keys: string[]) => {
		let count = 0;
		for (const key of keys) {
			if (redisStore.delete(key)) {
				count += 1;
			}
			if (redisSets.delete(key)) {
				count += 1;
			}
		}
		return count;
	}),
	eval: mock(
		async (
			_script: string,
			_numKeys: number,
			key: string,
			cached: string,
			next: string
		) => {
			const entry = redisStore.get(key);
			if (!(entry && entry.value === cached)) {
				return 0;
			}
			if (next === "") {
				redisStore.delete(key);
				return 1;
			}
			redisStore.set(key, { value: next, ttl: entry.ttl });
			return 1;
		}
	),
	expire: mock(async () => 1),
	get: mock(async (key: string) => {
		if (failGet) {
			throw new Error("redis get failed");
		}
		return redisStore.get(key)?.value ?? null;
	}),
	sadd: mock(async (key: string, ...members: string[]) => {
		const set = redisSets.get(key) ?? new Set<string>();
		for (const member of members) {
			set.add(member);
		}
		redisSets.set(key, set);
		return members.length;
	}),
	scan: mock(
		async (
			_cursor: string,
			_match: "MATCH",
			pattern: string,
			_count: "COUNT",
			_limit: number
		) => [
			"0",
			Array.from(redisStore.keys()).filter((key) =>
				matchesRedisPattern(pattern, key)
			),
		]
	),
	set: mock(async (key: string, value: string) => {
		redisStore.set(key, { value, ttl: -1 });
		return "OK";
	}),
	setex: mock(async (key: string, ttl: number, value: string) => {
		redisStore.set(key, { value, ttl });
		return "OK";
	}),
	smembers: mock(async (key: string) => Array.from(redisSets.get(key) ?? [])),
	ttl: mock(async (key: string) => redisStore.get(key)?.ttl ?? -2),
};

mock.module("./redis", () => ({
	getRedisCache: () => mockRedisClient,
}));

const {
	cacheTags,
	getAgentContextSnapshotKey,
	invalidateAgentContextSnapshot,
	invalidateAgentContextSnapshotsForOwner,
	invalidateAgentContextSnapshotsForWebsite,
	invalidateCacheableTag,
	invalidateCacheableWithArgs,
	invalidateFlagReadCaches,
	invalidateOrganizationMembershipCaches,
	invalidateWebsiteReadCaches,
} = await import("./cache-invalidation");

const freshSnapshot = (context: string) =>
	JSON.stringify({
		context,
		refreshedAt: "2026-05-03T10:00:00.000Z",
	});

const readSnapshot = (key: string) =>
	JSON.parse(redisStore.get(key)?.value ?? "{}") as {
		context?: string;
		refreshedAt?: string;
	};

afterAll(() => {
	mock.restore();
});

beforeEach(() => {
	redisStore.clear();
	redisSets.clear();
	failGet = false;
	mockRedisClient.del.mockClear();
	mockRedisClient.eval.mockClear();
	mockRedisClient.expire.mockClear();
	mockRedisClient.get.mockClear();
	mockRedisClient.sadd.mockClear();
	mockRedisClient.scan.mockClear();
	mockRedisClient.set.mockClear();
	mockRedisClient.setex.mockClear();
	mockRedisClient.smembers.mockClear();
	mockRedisClient.ttl.mockClear();
});

describe("agent context snapshot keys", () => {
	it("uses the organization as owner when available", () => {
		expect(getAgentContextSnapshotKey("user-1", "site-1", "org-1")).toBe(
			"agent:context-snapshot:org-1:site-1"
		);
	});

	it("falls back to the user id for personal workspaces", () => {
		expect(getAgentContextSnapshotKey("user-1", "site-1", null)).toBe(
			"agent:context-snapshot:user-1:site-1"
		);
	});
});

describe("website read cache invalidation", () => {
	it("invalidates known website cacheable keys and batch domain caches", async () => {
		const websiteId = "site-1";
		redisStore.set("cacheable:website_by_id:[site-1]", {
			value: "{}",
			ttl: 100,
		});
		redisStore.set("cacheable:website_with_owner_v2:[site-1]", {
			value: "{}",
			ttl: 100,
		});
		redisStore.set("cacheable:website-cache:[site-1]", {
			value: "{}",
			ttl: 100,
		});
		redisStore.set("cacheable:website-domain:[site-1]", {
			value: "example.com",
			ttl: 100,
		});
		redisStore.set("cacheable:agent-telemetry:website-exists:[site-1]", {
			value: "true",
			ttl: 100,
		});
		redisStore.set("cacheable:website-domains-batch:[[site-1,site-2]]", {
			value: "{}",
			ttl: 100,
		});
		redisStore.set("cacheable:website-domains-batch:[[site-2]]", {
			value: "{}",
			ttl: 100,
		});

		const result = await invalidateWebsiteReadCaches(websiteId);

		expect(result).toEqual({ attempted: 6, failed: 0 });
		expect(redisStore.has("cacheable:website_by_id:[site-1]")).toBe(false);
		expect(redisStore.has("cacheable:website_with_owner_v2:[site-1]")).toBe(
			false
		);
		expect(redisStore.has("cacheable:website-cache:[site-1]")).toBe(false);
		expect(redisStore.has("cacheable:website-domain:[site-1]")).toBe(false);
		expect(
			redisStore.has("cacheable:agent-telemetry:website-exists:[site-1]")
		).toBe(false);
		expect(
			redisStore.has("cacheable:website-domains-batch:[[site-1,site-2]]")
		).toBe(false);
		expect(redisStore.has("cacheable:website-domains-batch:[[site-2]]")).toBe(
			true
		);
	});
});

describe("cache tag registry", () => {
	it("encodes tag parts so ids cannot collide with delimiters", () => {
		expect(cacheTags.flagKey("client:1", "flag/a b")).toBe(
			"flag-key:client%3A1:flag%2Fa%20b"
		);
	});
});

describe("tagged cache invalidation", () => {
	it("deletes keys from an exact tag index without scanning", async () => {
		const indexKey = "cacheable-index:website-domains-batch:website:site-1";
		redisStore.set("cacheable:website-domains-batch:[[site-1,site-2]]", {
			value: "{}",
			ttl: 100,
		});
		redisStore.set("cacheable:website-domains-batch:[[site-2]]", {
			value: "{}",
			ttl: 100,
		});
		redisSets.set(
			indexKey,
			new Set(["cacheable:website-domains-batch:[[site-1,site-2]]"])
		);

		const deletedCount = await invalidateCacheableTag(
			"website-domains-batch",
			cacheTags.website("site-1")
		);

		expect(deletedCount).toBe(1);
		expect(
			redisStore.has("cacheable:website-domains-batch:[[site-1,site-2]]")
		).toBe(false);
		expect(redisStore.has("cacheable:website-domains-batch:[[site-2]]")).toBe(
			true
		);
		expect(redisSets.has(indexKey)).toBe(false);
		expect(mockRedisClient.scan).not.toHaveBeenCalled();
	});
});

describe("argument-based cache invalidation", () => {
	it("matches trailing arguments without deleting prefix-colliding keys", async () => {
		redisStore.set("cacheable:status-page:[site]", { value: "{}", ttl: 100 });
		redisStore.set("cacheable:status-page:[site,undefined]", {
			value: "{}",
			ttl: 100,
		});
		redisStore.set("cacheable:status-page:[site,draft]", {
			value: "{}",
			ttl: 100,
		});
		redisStore.set("cacheable:status-page:[site-2,draft]", {
			value: "{}",
			ttl: 100,
		});

		const deletedCount = await invalidateCacheableWithArgs("status-page", [
			"site",
		]);

		expect(deletedCount).toBe(3);
		expect(redisStore.has("cacheable:status-page:[site]")).toBe(false);
		expect(redisStore.has("cacheable:status-page:[site,undefined]")).toBe(
			false
		);
		expect(redisStore.has("cacheable:status-page:[site,draft]")).toBe(false);
		expect(redisStore.has("cacheable:status-page:[site-2,draft]")).toBe(true);
	});
});

describe("flag read cache invalidation", () => {
	it("invalidates exact tagged flag caches and args-based fallbacks", async () => {
		redisStore.set("cacheable:flag:[homepage,site-1]", {
			value: "{}",
			ttl: 30,
		});
		redisStore.set("cacheable:flag:[pricing,site-1]", {
			value: "{}",
			ttl: 30,
		});
		redisStore.set("cacheable:flags-client:[site-1]", {
			value: "[]",
			ttl: 30,
		});
		redisStore.set("cacheable:flags-definitions:[site-1]", {
			value: "[]",
			ttl: 30,
		});
		redisStore.set("cacheable:flags-user:[user-1,site-1]", {
			value: "[]",
			ttl: 30,
		});
		redisStore.set("cacheable:flags-user:[user-2,site-1]", {
			value: "[]",
			ttl: 30,
		});
		redisSets.set(
			"cacheable-index:flag:flag-key:site-1:homepage",
			new Set(["cacheable:flag:[homepage,site-1]"])
		);
		redisSets.set(
			"cacheable-index:flags-user:flag-user:site-1:user-1",
			new Set(["cacheable:flags-user:[user-1,site-1]"])
		);

		const result = await invalidateFlagReadCaches({
			clientId: "site-1",
			flagKey: "homepage",
			userId: "user-1",
		});

		expect(result).toEqual({ attempted: 4, failed: 0 });
		expect(redisStore.has("cacheable:flag:[homepage,site-1]")).toBe(false);
		expect(redisStore.has("cacheable:flag:[pricing,site-1]")).toBe(true);
		expect(redisStore.has("cacheable:flags-client:[site-1]")).toBe(false);
		expect(redisStore.has("cacheable:flags-definitions:[site-1]")).toBe(false);
		expect(redisStore.has("cacheable:flags-user:[user-1,site-1]")).toBe(false);
		expect(redisStore.has("cacheable:flags-user:[user-2,site-1]")).toBe(
			true
		);
	});
});

describe("organization membership cache invalidation", () => {
	it("invalidates role, owner, and billing caches for a member", async () => {
		redisStore.set("cacheable:rpc:member_role:[user-1,org-1]", {
			value: "member",
			ttl: 100,
		});
		redisStore.set("cacheable:rpc:org_owner:[org-1]", {
			value: "user-1",
			ttl: 100,
		});
		redisStore.set("cacheable:api_key_owner_id:[org-1]", {
			value: "user-1",
			ttl: 100,
		});
		redisStore.set("cacheable:rpc:billing_owner:[user-1,org-1]", {
			value: "{}",
			ttl: 100,
		});
		redisStore.set("cacheable:rpc:billing_owner:[user-2,org-1]", {
			value: "{}",
			ttl: 100,
		});
		redisStore.set("cacheable:rpc:billing_owner:[user-2,org-2]", {
			value: "{}",
			ttl: 100,
		});

		const result = await invalidateOrganizationMembershipCaches({
			organizationId: "org-1",
			userId: "user-1",
		});

		expect(result).toEqual({ attempted: 5, failed: 0 });
		expect(redisStore.has("cacheable:rpc:member_role:[user-1,org-1]")).toBe(
			false
		);
		expect(redisStore.has("cacheable:rpc:org_owner:[org-1]")).toBe(false);
		expect(redisStore.has("cacheable:api_key_owner_id:[org-1]")).toBe(
			false
		);
		expect(redisStore.has("cacheable:rpc:billing_owner:[user-1,org-1]")).toBe(
			false
		);
		expect(redisStore.has("cacheable:rpc:billing_owner:[user-2,org-1]")).toBe(
			false
		);
		expect(redisStore.has("cacheable:rpc:billing_owner:[user-2,org-2]")).toBe(
			true
		);
	});
});

describe("agent context snapshot invalidation", () => {
	it("marks an exact snapshot stale while preserving context and TTL", async () => {
		const key = getAgentContextSnapshotKey("user-1", "site-1", "org-1");
		redisStore.set(key, { value: freshSnapshot("cached context"), ttl: 1234 });

		await invalidateAgentContextSnapshot("user-1", "site-1", "org-1");

		expect(readSnapshot(key)).toEqual({
			context: "cached context",
			refreshedAt: "1970-01-01T00:00:00.000Z",
		});
		expect(redisStore.get(key)?.ttl).toBe(1234);
	});

	it("marks every owner snapshot for a website stale", async () => {
		const orgKey = getAgentContextSnapshotKey("user-1", "site-1", "org-1");
		const userKey = getAgentContextSnapshotKey("user-2", "site-1", null);
		const otherSiteKey = getAgentContextSnapshotKey("user-1", "site-2", "org-1");
		redisStore.set(orgKey, { value: freshSnapshot("org site one"), ttl: 100 });
		redisStore.set(userKey, { value: freshSnapshot("user site one"), ttl: 100 });
		redisStore.set(otherSiteKey, {
			value: freshSnapshot("org site two"),
			ttl: 100,
		});

		const count = await invalidateAgentContextSnapshotsForWebsite("site-1");

		expect(count).toBe(2);
		expect(readSnapshot(orgKey).refreshedAt).toBe("1970-01-01T00:00:00.000Z");
		expect(readSnapshot(userKey).refreshedAt).toBe("1970-01-01T00:00:00.000Z");
		expect(readSnapshot(otherSiteKey).refreshedAt).toBe(
			"2026-05-03T10:00:00.000Z"
		);
	});

	it("marks every website snapshot for an owner stale", async () => {
		const firstKey = getAgentContextSnapshotKey("user-1", "site-1", "org-1");
		const secondKey = getAgentContextSnapshotKey("user-1", "site-2", "org-1");
		const otherOwnerKey = getAgentContextSnapshotKey("user-2", "site-1", null);
		redisStore.set(firstKey, { value: freshSnapshot("first"), ttl: 100 });
		redisStore.set(secondKey, { value: freshSnapshot("second"), ttl: 100 });
		redisStore.set(otherOwnerKey, { value: freshSnapshot("other"), ttl: 100 });

		const count = await invalidateAgentContextSnapshotsForOwner("org-1");

		expect(count).toBe(2);
		expect(readSnapshot(firstKey).refreshedAt).toBe(
			"1970-01-01T00:00:00.000Z"
		);
		expect(readSnapshot(secondKey).refreshedAt).toBe(
			"1970-01-01T00:00:00.000Z"
		);
		expect(readSnapshot(otherOwnerKey).refreshedAt).toBe(
			"2026-05-03T10:00:00.000Z"
		);
	});

	it("does not clobber a snapshot replaced during invalidation", async () => {
		const key = getAgentContextSnapshotKey("user-1", "site-1", "org-1");
		const oldSnapshot = freshSnapshot("old context");
		const newSnapshot = freshSnapshot("new context");
		redisStore.set(key, { value: oldSnapshot, ttl: 100 });
		mockRedisClient.get.mockImplementationOnce(async () => {
			redisStore.set(key, { value: newSnapshot, ttl: 99 });
			return oldSnapshot;
		});

		await invalidateAgentContextSnapshot("user-1", "site-1", "org-1");

		expect(readSnapshot(key)).toEqual({
			context: "new context",
			refreshedAt: "2026-05-03T10:00:00.000Z",
		});
		expect(redisStore.get(key)?.ttl).toBe(99);
	});

	it("deletes corrupt snapshots instead of preserving invalid payloads", async () => {
		const key = getAgentContextSnapshotKey("user-1", "site-1", "org-1");
		redisStore.set(key, { value: "not-json", ttl: 100 });

		const count = await invalidateAgentContextSnapshotsForWebsite("site-1");

		expect(count).toBe(1);
		expect(redisStore.has(key)).toBe(false);
	});

	it("treats Redis failures as best-effort cache misses", async () => {
		const key = getAgentContextSnapshotKey("user-1", "site-1", "org-1");
		redisStore.set(key, { value: freshSnapshot("cached"), ttl: 100 });
		failGet = true;

		await expect(
			invalidateAgentContextSnapshot("user-1", "site-1", "org-1")
		).resolves.toBeUndefined();
		await expect(
			invalidateAgentContextSnapshotsForWebsite("site-1")
		).resolves.toBe(0);
	});
});
