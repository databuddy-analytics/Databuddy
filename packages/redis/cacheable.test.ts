import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const mockGet = mock((_key: string) => Promise.resolve(null as string | null));
const mockSetex = mock((_key: string, _seconds: number, _value: string) =>
	Promise.resolve("OK" as string)
);
const mockTtl = mock((_key: string) => Promise.resolve(100 as number));
const mockDel = mock((..._keys: string[]) => Promise.resolve(1 as number));
const mockExpire = mock((_key: string, _seconds: number) =>
	Promise.resolve(1 as number)
);
const mockSadd = mock((_key: string, ..._members: string[]) =>
	Promise.resolve(1 as number)
);
const mockScan = mock(
	(
		_cursor: string,
		_match: "MATCH",
		_pattern: string,
		_count: "COUNT",
		_limit: number
	) => Promise.resolve(["0", []] as [string, string[]])
);

const mockSmembers = mock((_key: string) => Promise.resolve([] as string[]));

const mockRedisClient = {
	del: mockDel,
	expire: mockExpire,
	get: mockGet,
	sadd: mockSadd,
	scan: mockScan,
	setex: mockSetex,
	smembers: mockSmembers,
	ttl: mockTtl,
};

mock.module("./redis", () => ({
	getRedisCache: () => mockRedisClient,
}));

const { cacheable } = await import("./cacheable");

const realDateNow = Date.now;
let timeOffset = 0;
Date.now = () => realDateNow() + timeOffset;

async function resetCircuitBreaker() {
	timeOffset += 60_000;
	mockGet.mockImplementation(() => Promise.resolve(null));
	mockSetex.mockImplementation(() => Promise.resolve("OK"));

	const resetFn = cacheable(async () => "reset", {
		expireInSec: 1,
		prefix: "__test_reset__",
	});
	await resetFn();
}

beforeEach(async () => {
	await resetCircuitBreaker();

	mockGet.mockClear();
	mockSetex.mockClear();
	mockTtl.mockClear();
	mockDel.mockClear();
	mockExpire.mockClear();
	mockSadd.mockClear();
	mockScan.mockClear();
	mockSmembers.mockClear();

	mockGet.mockImplementation(() => Promise.resolve(null));
	mockSetex.mockImplementation(() => Promise.resolve("OK"));
	mockTtl.mockImplementation(() => Promise.resolve(100));
	mockDel.mockImplementation(() => Promise.resolve(1));
	mockExpire.mockImplementation(() => Promise.resolve(1));
	mockSadd.mockImplementation(() => Promise.resolve(1));
	mockScan.mockImplementation(() => Promise.resolve(["0", []]));
	mockSmembers.mockImplementation(() => Promise.resolve([]));
});

afterAll(() => {
	Date.now = realDateNow;
	mock.restore();
});

describe("cacheable", () => {
	describe("key generation", () => {
		it("falls back to function name when no prefix given", () => {
			async function namedFunction() {
				return "v";
			}
			const fn = cacheable(namedFunction, 60);
			expect(fn.getKey()).toStartWith("cacheable:namedFunction:");
		});

		it("sorts object keys for stable hashing regardless of insertion order", () => {
			const fn = cacheable(async (o: Record<string, string>) => o, {
				expireInSec: 60,
				prefix: "test",
			});
			expect(fn.getKey({ z: "1", a: "2" })).toBe(fn.getKey({ a: "2", z: "1" }));
		});

		it("gives null, undefined, boolean, and number arguments distinct keys", () => {
			const fn = cacheable(async (..._args: unknown[]) => null, {
				expireInSec: 60,
				prefix: "test",
			});
			const keys = [
				fn.getKey(null),
				fn.getKey(undefined),
				fn.getKey(true),
				fn.getKey(false),
				fn.getKey(0),
				fn.getKey(42),
			];
			expect(new Set(keys).size).toBe(keys.length);
		});
	});

	describe("cache hit", () => {
		it("returns cached data without calling the original function", async () => {
			const original = mock(() => Promise.resolve({ id: 1 }));
			const cached = cacheable(original, {
				expireInSec: 60,
				prefix: "hit",
			});

			mockGet.mockImplementation(() =>
				Promise.resolve(JSON.stringify({ id: 1 }))
			);

			const result = await cached();

			expect(result).toEqual({ id: 1 });
			expect(original).not.toHaveBeenCalled();
			expect(mockSetex).not.toHaveBeenCalled();
		});

		it("revives ISO date strings into Date objects at any depth", async () => {
			const data = {
				createdAt: "2024-01-15T10:30:00.000Z",
				user: {
					sessions: [{ startedAt: "2024-06-01T08:00:00.000Z" }],
				},
			};
			const cached = cacheable(async () => data, {
				expireInSec: 60,
				prefix: "date",
			});

			mockGet.mockImplementation(() => Promise.resolve(JSON.stringify(data)));

			const result = await cached();
			expect(result.createdAt).toBeInstanceOf(Date);
			expect((result.createdAt as unknown as Date).toISOString()).toBe(
				"2024-01-15T10:30:00.000Z"
			);
			expect(result.user.sessions[0].startedAt).toBeInstanceOf(Date);
		});

		it("leaves strings that do not look like ISO timestamps untouched", async () => {
			const data = {
				label: "hello",
				dateOnly: "2024-01-15",
				sentence: "shipped on 2024-01-15T10:30:00.000Z sharp",
			};
			const cached = cacheable(async () => data, {
				expireInSec: 60,
				prefix: "no-date",
			});

			mockGet.mockImplementation(() => Promise.resolve(JSON.stringify(data)));

			const result = await cached();
			expect(result.label).toBe("hello");
			expect(result.dateOnly).toBe("2024-01-15");
			expect(result.sentence).toBe("shipped on 2024-01-15T10:30:00.000Z sharp");
		});
	});

	describe("cache miss", () => {
		it("calls original function and caches the result with the configured TTL", async () => {
			const original = mock(() => Promise.resolve({ data: "fresh" }));
			const cached = cacheable(original, {
				expireInSec: 300,
				prefix: "miss",
			});

			const result = await cached();

			expect(result).toEqual({ data: "fresh" });
			expect(original).toHaveBeenCalledTimes(1);
			expect(mockSetex).toHaveBeenCalledTimes(1);

			const [, ttl, value] = mockSetex.mock.calls[0];
			expect(ttl).toBe(300);
			expect(JSON.parse(value)).toEqual({ data: "fresh" });
		});

		it("does not cache null results", async () => {
			const cached = cacheable(async () => null, {
				expireInSec: 60,
				prefix: "null-skip",
			});

			expect(await cached()).toBeNull();
			expect(mockSetex).not.toHaveBeenCalled();
		});

		it("caches falsy and empty non-null values (0, empty string, false, {}, [])", async () => {
			const values = [0, "", false, {}, []] as const;
			for (const [index, value] of values.entries()) {
				const cached = cacheable(async () => value, {
					expireInSec: 60,
					prefix: `falsy-${index}`,
				});
				expect(await cached()).toEqual(value);
			}
			expect(mockSetex).toHaveBeenCalledTimes(values.length);
		});
	});

	describe("stale-while-revalidate", () => {
		it("returns stale data immediately and revalidates in background when TTL < staleTime", async () => {
			let callCount = 0;
			const original = mock(() => {
				callCount += 1;
				return Promise.resolve({ version: callCount });
			});

			const cached = cacheable(original, {
				expireInSec: 300,
				prefix: "swr-stale",
				staleWhileRevalidate: true,
				staleTime: 60,
			});

			mockGet.mockImplementation(() =>
				Promise.resolve(JSON.stringify({ version: 0 }))
			);
			mockTtl.mockImplementation(() => Promise.resolve(30));

			const result = await cached();
			expect(result).toEqual({ version: 0 });

			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(original).toHaveBeenCalledTimes(1);
			expect(mockSetex).toHaveBeenCalledTimes(1);
		});

		it("does not revalidate when TTL >= staleTime", async () => {
			const original = mock(() => Promise.resolve({ version: 2 }));

			const cached = cacheable(original, {
				expireInSec: 300,
				prefix: "swr-fresh",
				staleWhileRevalidate: true,
				staleTime: 60,
			});

			mockGet.mockImplementation(() =>
				Promise.resolve(JSON.stringify({ version: 1 }))
			);
			mockTtl.mockImplementation(() => Promise.resolve(200));

			await cached();

			await new Promise((resolve) => setTimeout(resolve, 50));
			expect(original).not.toHaveBeenCalled();
		});

		it("deduplicates concurrent revalidations for the same key", async () => {
			let resolve: (v: { version: number }) => void;
			const pending = new Promise<{ version: number }>((r) => {
				resolve = r;
			});
			const original = mock(() => pending);

			const cached = cacheable(original, {
				expireInSec: 300,
				prefix: "swr-dedup",
				staleWhileRevalidate: true,
				staleTime: 60,
			});

			mockGet.mockImplementation(() =>
				Promise.resolve(JSON.stringify({ version: 1 }))
			);
			mockTtl.mockImplementation(() => Promise.resolve(10));

			await cached();
			await cached();

			expect(original).toHaveBeenCalledTimes(1);
			resolve!({ version: 2 });
			await new Promise((r) => setTimeout(r, 50));
		});

		it("swallows revalidation failures without affecting the stale response", async () => {
			const original = mock(
				(): Promise<{ version: number }> =>
					Promise.reject(new Error("revalidation failed"))
			);

			const cached = cacheable(original, {
				expireInSec: 300,
				prefix: "swr-fail",
				staleWhileRevalidate: true,
				staleTime: 60,
			});

			mockGet.mockImplementation(() =>
				Promise.resolve(JSON.stringify({ version: 1 }))
			);
			mockTtl.mockImplementation(() => Promise.resolve(10));

			const result = await cached();
			expect(result).toEqual({ version: 1 });
			await new Promise((resolve) => setTimeout(resolve, 100));
		});

		it("does not check TTL when staleWhileRevalidate is false", async () => {
			const cached = cacheable(async () => ({ version: 2 }), {
				expireInSec: 300,
				prefix: "swr-off",
				staleWhileRevalidate: false,
			});

			mockGet.mockImplementation(() =>
				Promise.resolve(JSON.stringify({ version: 1 }))
			);

			await cached();

			expect(mockTtl).not.toHaveBeenCalled();
		});

		it("disables SWR entirely when staleTime keeps its default of 0", async () => {
			const original = mock(() => Promise.resolve({ version: 2 }));

			const cached = cacheable(original, {
				expireInSec: 300,
				prefix: "swr-default-stale",
				staleWhileRevalidate: true,
			});

			mockGet.mockImplementation(() =>
				Promise.resolve(JSON.stringify({ version: 1 }))
			);
			mockTtl.mockImplementation(() => Promise.resolve(1));

			await cached();
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(mockTtl).not.toHaveBeenCalled();
			expect(original).not.toHaveBeenCalled();
		});

		it("never blocks the cached response on the TTL check", async () => {
			const cached = cacheable(async () => ({ version: 2 }), {
				expireInSec: 300,
				prefix: "swr-ttl-blocks",
				staleWhileRevalidate: true,
				staleTime: 60,
			});

			mockGet.mockImplementation(() =>
				Promise.resolve(JSON.stringify({ version: 1 }))
			);

			mockTtl.mockImplementation(
				() => new Promise((resolve) => setTimeout(() => resolve(200), 300))
			);

			const start = realDateNow();
			const result = await cached();
			const elapsed = realDateNow() - start;

			expect(result).toEqual({ version: 1 });
			expect(elapsed).toBeLessThan(50);
		});

		it("treats a failed TTL lookup as fresh and skips revalidation", async () => {
			const original = mock(() => Promise.resolve({ version: 2 }));

			const cached = cacheable(original, {
				expireInSec: 300,
				prefix: "swr-ttl-err",
				staleWhileRevalidate: true,
				staleTime: 60,
			});

			mockGet.mockImplementation(() =>
				Promise.resolve(JSON.stringify({ version: 1 }))
			);
			mockTtl.mockImplementation(() => Promise.reject(new Error("ttl failed")));

			await cached();
			await new Promise((resolve) => setTimeout(resolve, 50));
			expect(original).not.toHaveBeenCalled();
		});

		it("does not cache null results produced during revalidation", async () => {
			const original = mock(() => Promise.resolve(null));

			const cached = cacheable(original, {
				expireInSec: 300,
				prefix: "swr-null-reval",
				staleWhileRevalidate: true,
				staleTime: 60,
			});

			mockGet.mockImplementation(() =>
				Promise.resolve(JSON.stringify({ version: 1 }))
			);
			mockTtl.mockImplementation(() => Promise.resolve(10));

			await cached();
			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(mockSetex).not.toHaveBeenCalled();
		});
	});

	describe("redis get failure", () => {
		it("falls back to the original function", async () => {
			const original = mock(() => Promise.resolve({ source: "direct" }));
			const cached = cacheable(original, {
				expireInSec: 60,
				prefix: "get-fail",
			});

			mockGet.mockImplementation(() =>
				Promise.reject(new Error("Connection refused"))
			);

			const result = await cached();

			expect(result).toEqual({ source: "direct" });
			expect(original).toHaveBeenCalledTimes(1);
		});
	});

	describe("redis setex failure", () => {
		it("marks redis as unavailable after an async setex failure", async () => {
			const cached = cacheable(async () => "data", {
				expireInSec: 60,
				prefix: "set-fail-mark",
			});

			mockSetex.mockImplementation(() =>
				Promise.reject(new Error("Write failed"))
			);
			await cached();
			await new Promise((resolve) => setTimeout(resolve, 10));

			mockGet.mockClear();
			await cached();
			expect(mockGet).not.toHaveBeenCalled();
		});
	});

	describe("circuit breaker", () => {
		it("skips redis for 30 seconds after a failure", async () => {
			const original = mock(() => Promise.resolve("direct"));
			const cached = cacheable(original, {
				expireInSec: 60,
				prefix: "cb-skip",
			});

			mockGet.mockImplementation(() => Promise.reject(new Error("down")));
			await cached();

			mockGet.mockClear();
			mockGet.mockImplementation(() => Promise.resolve(null));
			original.mockClear();

			const result = await cached();

			expect(result).toBe("direct");
			expect(mockGet).not.toHaveBeenCalled();
			expect(original).toHaveBeenCalledTimes(1);
		});

		it("retries redis after the 30-second cooldown expires", async () => {
			const cached = cacheable(async () => "data", {
				expireInSec: 60,
				prefix: "cb-recover",
			});

			mockGet.mockImplementation(() => Promise.reject(new Error("down")));
			await cached();

			timeOffset += 31_000;

			mockGet.mockClear();
			mockGet.mockImplementation(() => Promise.resolve(null));

			await cached();

			expect(mockGet).toHaveBeenCalledTimes(1);
		});

		it("is global: one failure bypasses redis for all cached functions", async () => {
			const fn1 = mock(() => Promise.resolve("fn1"));
			const fn2 = mock(() => Promise.resolve("fn2"));

			const cached1 = cacheable(fn1, {
				expireInSec: 60,
				prefix: "global-1",
			});
			const cached2 = cacheable(fn2, {
				expireInSec: 60,
				prefix: "global-2",
			});

			mockGet.mockImplementation(() => Promise.reject(new Error("down")));
			await cached1();

			mockGet.mockClear();
			mockGet.mockImplementation(() => Promise.resolve(null));

			await cached2();

			expect(mockGet).not.toHaveBeenCalled();
			expect(fn2).toHaveBeenCalledTimes(1);
		});
	});

	describe("slow redis", () => {
		it("slow setex does not block the return (fire-and-forget)", async () => {
			const cached = cacheable(async () => "data", {
				expireInSec: 60,
				prefix: "slow-set",
			});

			mockSetex.mockImplementation(
				() => new Promise((resolve) => setTimeout(() => resolve("OK"), 500))
			);

			const start = realDateNow();
			const result = await cached();
			const elapsed = realDateNow() - start;

			expect(result).toBe("data");
			expect(elapsed).toBeLessThan(50);
		});

		it("get timeout (>2s) falls back to fn and marks redis unhealthy", async () => {
			const original = mock(() => Promise.resolve("fallback"));
			const cached = cacheable(original, {
				expireInSec: 60,
				prefix: "timeout-get",
			});

			mockGet.mockImplementation(
				() => new Promise((resolve) => setTimeout(() => resolve(null), 3000))
			);

			const start = realDateNow();
			const result = await cached();
			const elapsed = realDateNow() - start;

			expect(result).toBe("fallback");
			expect(original).toHaveBeenCalledTimes(1);
			expect(elapsed).toBeGreaterThanOrEqual(1900);
			expect(elapsed).toBeLessThan(2500);

			mockGet.mockClear();
			mockGet.mockImplementation(() => Promise.resolve(null));
			await cached();
			expect(mockGet).not.toHaveBeenCalled();
		}, 10_000);

		it("setex timeout does not block return and marks redis unhealthy", async () => {
			const cached = cacheable(async () => "data", {
				expireInSec: 60,
				prefix: "timeout-set",
			});

			mockSetex.mockImplementation(
				() => new Promise((resolve) => setTimeout(() => resolve("OK"), 3000))
			);

			const start = realDateNow();
			const result = await cached();
			const elapsed = realDateNow() - start;

			expect(result).toBe("data");
			expect(elapsed).toBeLessThan(50);

			await new Promise((resolve) => setTimeout(resolve, 2100));
			mockGet.mockClear();
			await cached();
			expect(mockGet).not.toHaveBeenCalled();
		}, 10_000);
	});

	describe("concurrent calls", () => {
		it("deduplicates concurrent cache misses (single-flight)", async () => {
			let callCount = 0;
			const original = mock(() => {
				callCount += 1;
				return Promise.resolve({ call: callCount });
			});

			const cached = cacheable(original, {
				expireInSec: 60,
				prefix: "concurrent",
			});

			const results = await Promise.all([
				cached(),
				cached(),
				cached(),
				cached(),
				cached(),
			]);

			expect(results).toHaveLength(5);
			expect(original).toHaveBeenCalledTimes(1);
			expect(mockSetex).toHaveBeenCalledTimes(1);
			for (const r of results) {
				expect(r).toEqual({ call: 1 });
			}
		});
	});

	describe("original function errors", () => {
		it("propagates errors on cache miss", async () => {
			const cached = cacheable(
				async () => {
					throw new Error("Database error");
				},
				{ expireInSec: 60, prefix: "fn-err" }
			);

			await expect(cached()).rejects.toThrow("Database error");
		});

		it("does not cache failed function results", async () => {
			let attempt = 0;
			const original = mock(async () => {
				attempt += 1;
				if (attempt === 1) {
					throw new Error("temporary failure");
				}
				return { planId: "pro" };
			});
			const cached = cacheable(original, {
				expireInSec: 60,
				prefix: "fn-err-retry",
			});

			await expect(cached()).rejects.toThrow("temporary failure");
			await expect(cached()).resolves.toEqual({ planId: "pro" });

			expect(original).toHaveBeenCalledTimes(2);
			expect(mockSetex).toHaveBeenCalledTimes(1);
		});

		it("propagates errors when redis is unavailable (fn called directly)", async () => {
			mockGet.mockImplementation(() => Promise.reject(new Error("down")));
			const setup = cacheable(async () => "x", {
				expireInSec: 1,
				prefix: "setup-err",
			});
			await setup();

			const cached = cacheable(
				async () => {
					throw new Error("Service unavailable");
				},
				{ expireInSec: 60, prefix: "fn-err-no-redis" }
			);

			await expect(cached()).rejects.toThrow("Service unavailable");
		});

		it("propagates the fn error when redis.get fails and fn also throws", async () => {
			let callAttempt = 0;
			const original = mock(() => {
				callAttempt += 1;
				return Promise.reject(new Error(`fn failed attempt ${callAttempt}`));
			});

			const cached = cacheable(original, {
				expireInSec: 60,
				prefix: "double-fail",
			});

			mockGet.mockImplementation(() => Promise.reject(new Error("redis down")));

			await expect(cached()).rejects.toThrow("fn failed attempt 1");
		});
	});

	describe("corrupted cache data", () => {
		it("falls back to fn when cached value is invalid JSON", async () => {
			const original = mock(() => Promise.resolve({ source: "fallback" }));
			const cached = cacheable(original, {
				expireInSec: 60,
				prefix: "corrupt",
			});

			mockGet.mockImplementation(() =>
				Promise.resolve("this is not valid json{{{")
			);

			const result = await cached();

			expect(result).toEqual({ source: "fallback" });
			expect(original).toHaveBeenCalledTimes(1);
		});

		it("invalid JSON in cache does not trip the circuit breaker", async () => {
			const cached = cacheable(async () => "fallback", {
				expireInSec: 60,
				prefix: "corrupt-mark",
			});

			mockGet.mockImplementation(() => Promise.resolve("not json!!!"));
			await cached();

			mockGet.mockClear();
			mockGet.mockImplementation(() => Promise.resolve(null));
			await cached();
			expect(mockGet).toHaveBeenCalled();
		});
	});

	describe("serialization failures", () => {
		it("returns an unserializable result without caching it", async () => {
			let callCount = 0;
			const original = mock(() => {
				callCount += 1;
				const obj: Record<string, unknown> = { name: "test" };
				obj.self = obj;
				return Promise.resolve(obj);
			});

			const cached = cacheable(original, {
				expireInSec: 60,
				prefix: "circular",
			});

			const result = await cached();
			expect(callCount).toBe(1);
			expect(result.name).toBe("test");
			expect(mockSetex).not.toHaveBeenCalled();
		});

		it("serialization failure does not trip the circuit breaker", async () => {
			let callCount = 0;
			const cached = cacheable(
				async () => {
					callCount += 1;
					if (callCount === 1) {
						const obj: Record<string, unknown> = {};
						obj.self = obj;
						return obj;
					}
					return { ok: true };
				},
				{ expireInSec: 60, prefix: "circular-mark" }
			);

			await cached();

			mockGet.mockClear();
			await cached();
			expect(mockGet).toHaveBeenCalled();
		});
	});

	describe("query timeout", () => {
		it("rejects when the underlying function exceeds queryTimeoutMs", async () => {
			const cached = cacheable(
				(): Promise<string> =>
					new Promise((resolve) => setTimeout(() => resolve("late"), 5000)),
				{
					expireInSec: 60,
					prefix: "qtimeout-basic",
					queryTimeoutMs: 50,
				}
			);

			await expect(cached()).rejects.toThrow("Query timeout");
		}, 5000);

		it("cleans up inflight state after a timeout so the next call retries", async () => {
			let callCount = 0;
			const original = mock((): Promise<string> => {
				callCount += 1;
				if (callCount === 1) {
					return new Promise((resolve) =>
						setTimeout(() => resolve("late"), 5000)
					);
				}
				return Promise.resolve("fast");
			});

			const cached = cacheable(original, {
				expireInSec: 60,
				prefix: "qtimeout-retry",
				queryTimeoutMs: 50,
			});

			await expect(cached()).rejects.toThrow("Query timeout");

			const result = await cached();
			expect(result).toBe("fast");
			expect(original).toHaveBeenCalledTimes(2);
		}, 5000);

		it("fails all concurrent callers when the shared inflight promise times out", async () => {
			const cached = cacheable(
				(): Promise<string> =>
					new Promise((resolve) => setTimeout(() => resolve("late"), 5000)),
				{
					expireInSec: 60,
					prefix: "qtimeout-concurrent",
					queryTimeoutMs: 50,
				}
			);

			const results = await Promise.allSettled([cached(), cached(), cached()]);

			for (const result of results) {
				expect(result.status).toBe("rejected");
				if (result.status === "rejected") {
					expect(result.reason.message).toBe("Query timeout");
				}
			}
		}, 5000);

		it("applies the timeout on the circuit-breaker bypass path too", async () => {
			mockGet.mockImplementation(() => Promise.reject(new Error("down")));
			const setup = cacheable(async () => "x", {
				expireInSec: 1,
				prefix: "qtimeout-setup",
			});
			await setup();

			const cached = cacheable(
				(): Promise<string> =>
					new Promise((resolve) => setTimeout(() => resolve("late"), 5000)),
				{
					expireInSec: 60,
					prefix: "qtimeout-no-redis",
					queryTimeoutMs: 50,
				}
			);

			await expect(cached()).rejects.toThrow("Query timeout");
		}, 5000);
	});

	describe("invalidation helpers", () => {
		it("invalidate deletes exactly the key for the given arguments", async () => {
			const cached = cacheable(async (id: string) => id, {
				expireInSec: 60,
				prefix: "getkey",
			});

			await cached.invalidate("abc");
			expect(mockDel).toHaveBeenCalledWith(cached.getKey("abc"));
		});

		it("indexes cached keys by tag", async () => {
			const cached = cacheable(async (ids: string[]) => ({ ids }), {
				expireInSec: 60,
				prefix: "tagged",
				tags: (_result, ids) => ids.map((id) => `website:${id}`),
			});

			await cached(["a", "b"]);
			await new Promise((resolve) => setTimeout(resolve, 0));

			const key = cached.getKey(["a", "b"]);
			expect(mockSadd).toHaveBeenCalledWith(
				"cacheable-index:tagged:website:a",
				key
			);
			expect(mockSadd).toHaveBeenCalledWith(
				"cacheable-index:tagged:website:b",
				key
			);
			expect(mockExpire).toHaveBeenCalledWith(
				"cacheable-index:tagged:website:a",
				60
			);
		});

		it("invalidates tagged keys without scanning", async () => {
			const cached = cacheable(async (id: string) => id, {
				expireInSec: 60,
				prefix: "tagged-delete",
			});
			const keys = [cached.getKey("a"), cached.getKey("b")];
			mockSmembers.mockImplementation(() => Promise.resolve(keys));
			mockDel.mockImplementation((...deletedKeys: string[]) =>
				Promise.resolve(deletedKeys.length)
			);

			const deletedCount = await cached.invalidateTag("website:a");

			expect(deletedCount).toBe(2);
			expect(mockDel).toHaveBeenCalledWith(...keys);
			expect(mockDel).toHaveBeenCalledWith(
				"cacheable-index:tagged-delete:website:a"
			);
			expect(mockScan).not.toHaveBeenCalled();
		});
	});
});
