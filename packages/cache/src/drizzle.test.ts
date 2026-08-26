import { beforeEach, describe, expect, it } from "bun:test";
import { pgTable, text } from "drizzle-orm/pg-core";
import { RedisDrizzleCache, type RedisCacheClient } from "./drizzle";

const store = new Map<string, string>();
const sets = new Map<string, Set<string>>();
const setexCalls: Array<{ key: string; seconds: number }> = [];
const expireCalls: Array<{ key: string; seconds: number }> = [];
const keepTtlCalls: string[] = [];
const unlinkCalls: string[] = [];
let failGet = false;

const redis: RedisCacheClient = {
	del: async (key) => {
		store.delete(key);
		sets.delete(key);
	},
	expire: async (key, seconds) => {
		expireCalls.push({ key, seconds });
	},
	get: async (key) => {
		if (failGet) {
			throw new Error("get failed");
		}
		return store.get(key) ?? null;
	},
	sadd: async (key, member) => {
		const set = sets.get(key) ?? new Set<string>();
		set.add(member);
		sets.set(key, set);
	},
	set: async (key, value, mode) => {
		if (mode === "KEEPTTL") {
			keepTtlCalls.push(key);
		}
		store.set(key, value);
	},
	setex: async (key, seconds, value) => {
		setexCalls.push({ key, seconds });
		store.set(key, value);
	},
	smembers: async (key) => Array.from(sets.get(key) ?? []),
	unlink: async (key) => {
		unlinkCalls.push(key);
		store.delete(key);
		sets.delete(key);
	},
};

const cache = new RedisDrizzleCache({ redis, namespace: "test" });

const originalConsoleError = console.error;

beforeEach(() => {
	store.clear();
	sets.clear();
	setexCalls.length = 0;
	expireCalls.length = 0;
	keepTtlCalls.length = 0;
	unlinkCalls.length = 0;
	failGet = false;
	console.error = originalConsoleError;
});

describe("strategy", () => {
	it("defaults to explicit and honors an override", () => {
		expect(cache.strategy()).toBe("explicit");
		expect(new RedisDrizzleCache({ redis, strategy: "all" }).strategy()).toBe(
			"all"
		);
	});
});

describe("get", () => {
	it("returns the parsed rows for a cached query", async () => {
		store.set("test:q1", JSON.stringify([{ id: 1 }]));

		expect(await cache.get("q1")).toEqual([{ id: 1 }]);
	});

	it("returns undefined for a miss or a non-array payload", async () => {
		store.set("test:q1", JSON.stringify({ id: 1 }));

		expect(await cache.get("missing")).toBeUndefined();
		expect(await cache.get("q1")).toBeUndefined();
	});

	it("returns undefined when redis fails", async () => {
		failGet = true;
		console.error = () => undefined;

		expect(await cache.get("q1")).toBeUndefined();
	});
});

describe("put", () => {
	it("stores the response under the namespace with the default TTL", async () => {
		await cache.put("q1", [{ id: 1 }], [], false);

		expect(store.get("test:q1")).toBe(JSON.stringify([{ id: 1 }]));
		expect(setexCalls).toEqual([{ key: "test:q1", seconds: 300 }]);
	});

	it("registers table dependencies with double the effective TTL", async () => {
		await cache.put("q1", [], ["websites"], false, { ex: 600 });

		expect(sets.get("test:dep:websites")).toEqual(new Set(["q1"]));
		expect(expireCalls).toEqual([{ key: "test:dep:websites", seconds: 1200 }]);
	});

	it("preserves the existing TTL when keepTtl is set", async () => {
		await cache.put("q1", [], [], false, { keepTtl: true });

		expect(keepTtlCalls).toEqual(["test:q1"]);
		expect(setexCalls).toEqual([]);
	});

	const nowSeconds = () => Math.floor(Date.now() / 1000);
	it.each([
		["ex in seconds", () => ({ ex: 120 }), 120],
		["px in milliseconds", () => ({ px: 2500 }), 2],
		["exat as unix seconds", () => ({ exat: nowSeconds() + 50 }), 50],
		["pxat as unix milliseconds", () => ({ pxat: Date.now() + 50_000 }), 50],
	])("derives the TTL from %s", async (_label, config, expected) => {
		await cache.put("q1", [], [], false, config());

		const seconds = setexCalls[0]?.seconds ?? 0;
		expect(seconds).toBeGreaterThanOrEqual(expected - 1);
		expect(seconds).toBeLessThanOrEqual(expected);
	});
});

describe("onMutate", () => {
	it("invalidates every query that depends on a mutated table", async () => {
		await cache.put("q1", [1], ["websites"], false);
		await cache.put("q2", [2], ["websites", "members"], false);
		await cache.put("q3", [3], ["links"], false);

		await cache.onMutate({ tables: ["websites"] });

		expect(store.has("test:q1")).toBe(false);
		expect(store.has("test:q2")).toBe(false);
		expect(store.has("test:q3")).toBe(true);
		expect(sets.has("test:dep:websites")).toBe(false);
	});

	it("resolves Table instances to their table name", async () => {
		const websites = pgTable("websites", { id: text("id") });
		await cache.put("q1", [1], ["websites"], false);

		await cache.onMutate({ tables: [websites] });

		expect(store.has("test:q1")).toBe(false);
	});

	it("unlinks tag keys for tag-based invalidation", async () => {
		await cache.onMutate({ tags: "org-1" });

		expect(unlinkCalls).toContain("test:tag:org-1");
	});

	it("does nothing when no dependent queries or tags exist", async () => {
		await cache.onMutate({ tables: ["unknown"] });

		expect(unlinkCalls).toEqual([]);
	});
});
