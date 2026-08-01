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

			if (script.includes("abandon-cached-link-mutation")) {
				const [token] = args;
				const pending = parseCacheValue(store.get(key));
				if (pending?.state !== "pending" || pending.token !== token) {
					return 0;
				}
				store.delete(key);
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
	abandonCachedLinkMutation,
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

	test("returns a positive cache hit", async () => {
		store.set(getLinkCacheKey("known-link"), JSON.stringify(link));

		expect(await getCachedLink("known-link")).toEqual({
			state: "hit",
			link,
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

	test("rejects a second mutation while a pending lease exists", async () => {
		getMutationToken(
			await beginCachedLinkMutation("busy-link", {
				id: link.id,
				mode: "existing",
			})
		);

		expect(
			await beginCachedLinkMutation("busy-link", {
				id: link.id,
				mode: "existing",
			})
		).toEqual({ state: "busy" });
	});

	test("requires an existing mutation to own a live cache entry", async () => {
		store.set(getLinkCacheKey("existing-link"), JSON.stringify(link));

		expect(
			await beginCachedLinkMutation("existing-link", {
				id: "different-link",
				mode: "existing",
			})
		).toEqual({ state: "conflict" });
		expect(
			await beginCachedLinkMutation("existing-link", {
				id: link.id,
				mode: "existing",
			})
		).toMatchObject({ state: "acquired" });
	});

	test("allows a new link only over a miss, negative entry, or tombstone", async () => {
		store.set(getLinkCacheKey("live-link"), JSON.stringify(link));
		expect(
			await beginCachedLinkMutation("live-link", {
				id: "new-link",
				mode: "new",
			})
		).toEqual({ state: "conflict" });

		store.set(getLinkCacheKey("negative-link"), "null");
		expect(
			await beginCachedLinkMutation("negative-link", {
				id: "new-link",
				mode: "new",
			})
		).toMatchObject({ state: "acquired" });

		store.set(
			getLinkCacheKey("tombstoned-link"),
			JSON.stringify({ id: "deleted-link", state: "tombstone" })
		);
		expect(
			await beginCachedLinkMutation("tombstoned-link", {
				id: "new-link",
				mode: "new",
			})
		).toMatchObject({ state: "acquired" });
	});

	test("requires an existing mutation to match an id-aware tombstone", async () => {
		store.set(
			getLinkCacheKey("deleted-link"),
			JSON.stringify({ id: "deleted-link", state: "tombstone" })
		);

		expect(
			await beginCachedLinkMutation("deleted-link", {
				id: link.id,
				mode: "existing",
			})
		).toEqual({ state: "conflict" });
		expect(
			await beginCachedLinkMutation("deleted-link", {
				id: "deleted-link",
				mode: "existing",
			})
		).toMatchObject({ state: "acquired" });
	});

	test("only lets the owning token finalize or abandon a mutation", async () => {
		const token = getMutationToken(
			await beginCachedLinkMutation("owned-link", {
				id: link.id,
				mode: "existing",
			})
		);

		expect(
			await finishCachedLinkMutation("owned-link", "other-token", {
				id: link.id,
				state: "tombstone",
			})
		).toBe(false);
		expect(
			await finishCachedLinkMutation("owned-link", token, {
				link: { ...link, id: "different-link" },
				state: "link",
			})
		).toBe(false);
		expect(await abandonCachedLinkMutation("owned-link", "other-token")).toBe(
			false
		);
		expect(await getCachedLink("owned-link")).toEqual({ state: "pending" });

		expect(await abandonCachedLinkMutation("owned-link", token)).toBe(true);
		expect(await getCachedLink("owned-link")).toEqual({ state: "miss" });
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

	test("serializes update and delete mutations without reviving a stale link", async () => {
		const updateToken = getMutationToken(
			await beginCachedLinkMutation("race-link", {
				id: link.id,
				mode: "existing",
			})
		);

		expect(
			await beginCachedLinkMutation("race-link", {
				id: link.id,
				mode: "existing",
			})
		).toEqual({ state: "busy" });
		expect(
			await finishCachedLinkMutation("race-link", updateToken, {
				link,
				state: "link",
			})
		).toBe(true);

		const deleteToken = getMutationToken(
			await beginCachedLinkMutation("race-link", {
				id: link.id,
				mode: "existing",
			})
		);
		expect(
			await finishCachedLinkMutation("race-link", deleteToken, {
				id: link.id,
				state: "tombstone",
			})
		).toBe(true);
		expect(
			await finishCachedLinkMutation("race-link", updateToken, {
				link,
				state: "link",
			})
		).toBe(false);
		expect(await getCachedLink("race-link")).toEqual({
			state: "not_found",
		});
	});

	test("serializes create, update, and delete ownership for one slug", async () => {
		const key = getLinkCacheKey("shared-link");
		store.set(key, JSON.stringify(link));

		const updateToken = getMutationToken(
			await beginCachedLinkMutation("shared-link", {
				id: link.id,
				mode: "existing",
			})
		);
		expect(
			await beginCachedLinkMutation("shared-link", {
				id: "replacement-link",
				mode: "new",
			})
		).toEqual({ state: "busy" });
		expect(
			await beginCachedLinkMutation("shared-link", {
				id: link.id,
				mode: "existing",
			})
		).toEqual({ state: "busy" });

		await finishCachedLinkMutation("shared-link", updateToken, {
			link,
			state: "link",
		});
		const deleteToken = getMutationToken(
			await beginCachedLinkMutation("shared-link", {
				id: link.id,
				mode: "existing",
			})
		);
		expect(
			await beginCachedLinkMutation("shared-link", {
				id: "replacement-link",
				mode: "new",
			})
		).toEqual({ state: "busy" });

		await finishCachedLinkMutation("shared-link", deleteToken, {
			id: link.id,
			state: "tombstone",
		});
		const replacement = { ...link, id: "replacement-link" };
		const createToken = getMutationToken(
			await beginCachedLinkMutation("shared-link", {
				id: replacement.id,
				mode: "new",
			})
		);
		expect(
			await finishCachedLinkMutation("shared-link", deleteToken, {
				id: link.id,
				state: "tombstone",
			})
		).toBe(false);
		expect(
			await finishCachedLinkMutation("shared-link", createToken, {
				link: replacement,
				state: "link",
			})
		).toBe(true);
		expect(await getCachedLink("shared-link")).toEqual({
			state: "hit",
			link: replacement,
		});
	});

	test("allows a recreated slug to replace a completed deletion tombstone", async () => {
		const deleteToken = getMutationToken(
			await beginCachedLinkMutation("recreated-link", {
				id: link.id,
				mode: "existing",
			})
		);
		await finishCachedLinkMutation("recreated-link", deleteToken, {
			id: link.id,
			state: "tombstone",
		});

		const recreatedLink = { ...link, id: "link-2" };
		const createToken = getMutationToken(
			await beginCachedLinkMutation("recreated-link", {
				id: recreatedLink.id,
				mode: "new",
			})
		);
		expect(
			await finishCachedLinkMutation("recreated-link", createToken, {
				link: recreatedLink,
				state: "link",
			})
		).toBe(true);
		expect(await getCachedLink("recreated-link")).toEqual({
			state: "hit",
			link: recreatedLink,
		});
	});
});
