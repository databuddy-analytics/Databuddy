import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

const store = new Map<string, string>();
let replacementBeforeConditionalDelete: string | null = null;

function parseCacheValue(value: string | undefined): Record<string, unknown> | null {
	if (!value || value === "null") {
		return null;
	}

	try {
		const parsed: unknown = JSON.parse(value);
		return parsed && typeof parsed === "object"
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

const redis = {
	eval: mock(
		async (
			script: string,
			_keyCount: number,
			key: string,
			...args: string[]
		) => {
			if (script.includes("begin-cached-link-mutation")) {
				const [id, token, mode] = args;
				const current = store.get(key);
				if (current && current !== "null") {
					const decoded = parseCacheValue(current);
					if (!decoded) {
						return "conflict";
					}
					if (decoded.state === "pending") {
						return "busy";
					}
					if (decoded.state === "tombstone") {
						if (mode === "existing" && decoded.id !== id) {
							return "conflict";
						}
					} else if (
						typeof decoded.id !== "string" ||
						typeof decoded.targetUrl !== "string" ||
						mode === "new" ||
						decoded.id !== id
					) {
						return "conflict";
					}
				}
				store.set(key, JSON.stringify({ id, state: "pending", token }));
				return "acquired";
			}

			if (script.includes("finish-cached-link-mutation")) {
				const [token, next] = args;
				const pending = parseCacheValue(store.get(key));
				const nextValue = parseCacheValue(next);
				if (
					pending?.state !== "pending" ||
					pending.token !== token ||
					!nextValue ||
					nextValue.id !== pending.id
				) {
					return 0;
				}
				store.set(key, next);
				return 1;
			}

			if (script.includes("delete-cached-link-if-current")) {
				const [current] = args;
				if (replacementBeforeConditionalDelete) {
					store.set(key, replacementBeforeConditionalDelete);
					replacementBeforeConditionalDelete = null;
				}
				if (store.get(key) !== current) {
					return 0;
				}
				store.delete(key);
				return 1;
			}

			throw new Error("Unexpected Redis script");
		}
	),
	get: mock(async (key: string) => store.get(key) ?? null),
	set: mock(
		async (
			key: string,
			value: string,
			_mode: "EX",
			_ttl: number,
			condition: "NX"
		) => {
			if (condition === "NX" && store.has(key)) {
				return null;
			}
			store.set(key, value);
			return "OK";
		}
	),
};

mock.module("./redis", () => ({
	runLinkCacheCommand: <T>(operation: (client: typeof redis) => Promise<T>) =>
		operation(redis),
}));

const {
	beginCachedLinkMutation,
	finishCachedLinkMutation,
	getCachedLink,
	getLinkCacheKey,
	setCachedLinkIfAbsent,
	setCachedLinkNotFoundIfAbsent,
} = await import("./links-cache");

const link = {
	androidUrl: null,
	deepLinkApp: null,
	expiredRedirectUrl: null,
	expiresAt: null,
	id: "link-1",
	iosUrl: null,
	ogDescription: null,
	ogImageUrl: null,
	ogTitle: null,
	ogVideoUrl: null,
	targetUrl: "https://example.com",
};

function getMutationToken(
	result: Awaited<ReturnType<typeof beginCachedLinkMutation>>
): string {
	if (result.state !== "acquired") {
		throw new Error(`Expected mutation lease, received ${result.state}`);
	}
	return result.token;
}

beforeEach(() => {
	store.clear();
	replacementBeforeConditionalDelete = null;
	redis.eval.mockClear();
	redis.get.mockClear();
	redis.set.mockClear();
});

afterAll(() => {
	mock.restore();
});

describe("links cache", () => {
	test("keeps legacy raw null negative entries backward compatible", async () => {
		store.set(getLinkCacheKey("missing-link"), "null");

		expect(await getCachedLink("missing-link")).toEqual({
			state: "not_found",
		});
	});

	test("clears malformed cache values without deleting a newer value", async () => {
		const key = getLinkCacheKey("broken-link");
		store.set(key, "{");
		replacementBeforeConditionalDelete = JSON.stringify(link);

		expect(await getCachedLink("broken-link")).toEqual({ state: "miss" });
		expect(store.get(key)).toBe(JSON.stringify(link));
		expect(await getCachedLink("broken-link")).toEqual({
			state: "hit",
			link,
		});
	});

	test("treats malformed cache values as a miss when eviction fails", async () => {
		store.set(getLinkCacheKey("broken-link"), "{");
		redis.eval.mockRejectedValueOnce(new Error("Redis unavailable"));

		expect(await getCachedLink("broken-link")).toEqual({ state: "miss" });
	});

	test("treats invalid cache payload shapes as a miss", async () => {
		const key = getLinkCacheKey("invalid-link");
		store.set(key, JSON.stringify({ id: link.id }));

		expect(await getCachedLink("invalid-link")).toEqual({ state: "miss" });
		expect(store.has(key)).toBe(false);
	});

	test("returns pending and blocks read-through backfills during a mutation", async () => {
		const token = getMutationToken(
			await beginCachedLinkMutation("updating-link", {
				id: link.id,
				mode: "existing",
			})
		);

		expect(await getCachedLink("updating-link")).toEqual({
			state: "pending",
		});
		expect(await setCachedLinkIfAbsent("updating-link", link)).toBe(false);
		expect(await setCachedLinkNotFoundIfAbsent("updating-link")).toBe(false);
		expect(
			await finishCachedLinkMutation("updating-link", token, {
				link,
				state: "link",
			})
		).toBe(true);
		expect(redis.eval.mock.calls.at(-1)?.at(-1)).toBe("604800");

		expect(await getCachedLink("updating-link")).toEqual({
			state: "hit",
			link,
		});
	});

	test("does not let a stale read-through overwrite an id-aware tombstone", async () => {
		const token = getMutationToken(
			await beginCachedLinkMutation("deleted-link", {
				id: link.id,
				mode: "existing",
			})
		);
		expect(
			await finishCachedLinkMutation("deleted-link", token, {
				id: link.id,
				state: "tombstone",
			})
		).toBe(true);
		expect(redis.eval.mock.calls.at(-1)?.at(-1)).toBe("60");

		expect(await setCachedLinkIfAbsent("deleted-link", link)).toBe(false);
		expect(await getCachedLink("deleted-link")).toEqual({
			state: "not_found",
		});
	});
});
