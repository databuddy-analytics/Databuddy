import { beforeEach, describe, expect, it } from "bun:test";
import { createDrizzleCache } from "./drizzle-cache";

const store = new Map<string, string>();
const sets = new Map<string, Set<string>>();
let failGet = false;
let failSadd = false;

function matchesPattern(pattern: string, key: string): boolean {
	const source = pattern
		.split("*")
		.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
		.join(".*");
	return new RegExp(`^${source}$`).test(key);
}

const redis = {
	get: async (key: string) => {
		if (failGet) {
			throw new Error("get failed");
		}
		return store.get(key) ?? null;
	},
	sadd: async (key: string, ...members: string[]) => {
		if (failSadd) {
			throw new Error("sadd failed");
		}
		const set = sets.get(key) ?? new Set<string>();
		for (const member of members) {
			set.add(member);
		}
		sets.set(key, set);
		return members.length;
	},
	scan: async (
		_cursor: string,
		_match: "MATCH",
		pattern: string,
		_count: "COUNT",
		_limit: number
	) =>
		[
			"0",
			[...store.keys(), ...sets.keys()].filter((key) =>
				matchesPattern(pattern, key)
			),
		] as [string, string[]],
	scard: async (key: string) => sets.get(key)?.size ?? 0,
	setex: async (key: string, _ttl: number, value: string) => {
		store.set(key, value);
		return "OK" as const;
	},
	smembers: async (key: string) => Array.from(sets.get(key) ?? []),
	srem: async (key: string, ...members: string[]) => {
		const set = sets.get(key);
		let removed = 0;
		for (const member of members) {
			if (set?.delete(member)) {
				removed += 1;
			}
		}
		return removed;
	},
	sunion: async (...keys: string[]) => {
		const union = new Set<string>();
		for (const key of keys) {
			for (const member of sets.get(key) ?? []) {
				union.add(member);
			}
		}
		return Array.from(union);
	},
	unlink: async (...keys: string[]) => {
		let removed = 0;
		for (const key of keys) {
			if (store.delete(key)) {
				removed += 1;
			}
			if (sets.delete(key)) {
				removed += 1;
			}
		}
		return removed;
	},
};

const cache = createDrizzleCache({ redis: redis as never, namespace: "test" });

async function seed(
	key: string,
	value: unknown,
	options: { tables?: string[]; tag?: string } = {}
) {
	return cache.withCache({
		key,
		queryFn: async () => value,
		tables: options.tables ?? [],
		tag: options.tag,
		ttl: 60,
	});
}

beforeEach(() => {
	store.clear();
	sets.clear();
	failGet = false;
	failSadd = false;
});

describe("withCache", () => {
	it("returns the cached value without rerunning the query", async () => {
		let queries = 0;
		const queryFn = async () => {
			queries += 1;
			return { id: "row-1" };
		};

		await cache.withCache({ key: "row-1", queryFn });
		const second = await cache.withCache({ key: "row-1", queryFn });

		expect(second).toEqual({ id: "row-1" });
		expect(queries).toBe(1);
	});

	it("bypasses the cache entirely when disabled", async () => {
		let queries = 0;
		const queryFn = async () => {
			queries += 1;
			return queries;
		};

		await cache.withCache({ key: "row-1", queryFn, disabled: true });
		const second = await cache.withCache({
			key: "row-1",
			queryFn,
			disabled: true,
		});

		expect(second).toBe(2);
		expect(store.size).toBe(0);
	});

	it("deduplicates concurrent misses for the same key (single-flight)", async () => {
		let queries = 0;
		const queryFn = async () => {
			queries += 1;
			await new Promise((resolve) => setTimeout(resolve, 10));
			return { id: "row-1" };
		};

		const results = await Promise.all([
			cache.withCache({ key: "row-1", queryFn }),
			cache.withCache({ key: "row-1", queryFn }),
			cache.withCache({ key: "row-1", queryFn }),
		]);

		expect(results).toEqual([{ id: "row-1" }, { id: "row-1" }, { id: "row-1" }]);
		expect(queries).toBe(1);
	});

	it("falls through to the query when the cache read fails", async () => {
		store.set("test:row-1", JSON.stringify({ id: "stale" }));
		failGet = true;

		const result = await seed("row-1", { id: "fresh" });

		expect(result).toEqual({ id: "fresh" });
	});

	it("registers dependency and tag tracking before caching", async () => {
		await seed("row-1", { id: "row-1" }, { tables: ["websites"], tag: "org-1" });

		expect(store.get("test:row-1")).toBe(JSON.stringify({ id: "row-1" }));
		expect(sets.get("test:dep:websites")).toEqual(new Set(["row-1"]));
		expect(sets.get("test:tag:org-1")).toEqual(new Set(["row-1"]));
		expect(sets.get("test:by-key:row-1")).toEqual(
			new Set(["test:dep:websites", "test:tag:org-1"])
		);
	});

	it("returns the query result without caching when tracking fails", async () => {
		failSadd = true;

		const result = await seed("row-1", { id: "row-1" }, { tables: ["websites"] });

		expect(result).toEqual({ id: "row-1" });
		expect(store.has("test:row-1")).toBe(false);
	});
});

describe("invalidateByTables", () => {
	it("removes every cache entry that depends on the table", async () => {
		await seed("row-1", 1, { tables: ["websites"] });
		await seed("row-2", 2, { tables: ["websites", "members"] });
		await seed("row-3", 3, { tables: ["links"] });

		await cache.invalidateByTables(["websites"]);

		expect(store.has("test:row-1")).toBe(false);
		expect(store.has("test:row-2")).toBe(false);
		expect(store.has("test:row-3")).toBe(true);
		expect(sets.has("test:dep:websites")).toBe(false);
		expect(sets.has("test:by-key:row-1")).toBe(false);
	});

});

describe("invalidateByTags", () => {
	it("removes only entries registered under the tag", async () => {
		await seed("row-1", 1, { tables: ["websites"], tag: "org-1" });
		await seed("row-2", 2, { tables: ["websites"], tag: "org-2" });

		await cache.invalidateByTags(["org-1"]);

		expect(store.has("test:row-1")).toBe(false);
		expect(store.has("test:row-2")).toBe(true);
		expect(sets.has("test:tag:org-1")).toBe(false);
		expect(sets.has("test:tag:org-2")).toBe(true);
	});
});

describe("invalidateByKey", () => {
	it("removes one entry and unregisters it from its dependency sets", async () => {
		await seed("row-1", 1, { tables: ["websites"], tag: "org-1" });
		await seed("row-2", 2, { tables: ["websites"] });

		await cache.invalidateByKey("row-1");

		expect(store.has("test:row-1")).toBe(false);
		expect(store.has("test:row-2")).toBe(true);
		expect(sets.get("test:dep:websites")).toEqual(new Set(["row-2"]));
		expect(sets.get("test:tag:org-1")?.size ?? 0).toBe(0);
		expect(sets.has("test:by-key:row-1")).toBe(false);
	});
});

describe("cleanupEmptySets", () => {
	it("unlinks only tracking sets that became empty", async () => {
		await seed("row-1", 1, { tables: ["websites"], tag: "org-1" });
		await seed("row-2", 2, { tables: ["members"] });
		await cache.invalidateByKey("row-1");

		await cache.cleanupEmptySets();

		expect(sets.has("test:dep:websites")).toBe(false);
		expect(sets.has("test:tag:org-1")).toBe(false);
		expect(sets.get("test:dep:members")).toEqual(new Set(["row-2"]));
	});
});
