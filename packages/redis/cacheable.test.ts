import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const mockGet = mock((_key: string) => Promise.resolve(null as string | null));
const mockSetex = mock((_key: string, _seconds: number, _value: string) =>
	Promise.resolve("OK" as string)
);
const mockTtl = mock((_key: string) => Promise.resolve(100 as number));

const mockRedisClient = {
	get: mockGet,
	setex: mockSetex,
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

	mockGet.mockImplementation(() => Promise.resolve(null));
	mockSetex.mockImplementation(() => Promise.resolve("OK"));
	mockTtl.mockImplementation(() => Promise.resolve(100));
});

afterAll(() => {
	Date.now = realDateNow;
});

describe("cacheable", () => {
	describe("key generation", () => {
		it("produces consistent keys for the same arguments", () => {
			const fn = cacheable(async (a: string, b: number) => `${a}-${b}`, {
				expireInSec: 60,
				prefix: "test",
			});
			expect(fn.getKey("hello", 42)).toBe(fn.getKey("hello", 42));
		});

		it("produces different keys for different arguments", () => {
			const fn = cacheable(async (x: string) => x, {
				expireInSec: 60,
				prefix: "test",
			});
			expect(fn.getKey("a")).not.toBe(fn.getKey("b"));
		});

		it("uses the provided prefix in the key", () => {
			const fn = cacheable(async () => "v", {
				expireInSec: 60,
				prefix: "myprefix",
			});
			expect(fn.getKey()).toStartWith("cacheable:myprefix:");
		});

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

		it("handles null, undefined, boolean, and number arguments", () => {
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
			const unique = new Set(keys);
			expect(unique.size).toBe(keys.length);
		});

		it("handles nested objects and arrays", () => {
			const fn = cacheable(async (d: unknown) => d, {
				expireInSec: 60,
				prefix: "test",
			});
			const key = fn.getKey({ items: [1, 2], nested: { deep: true } });
			expect(typeof key).toBe("string");
			expect(key.length).toBeGreaterThan(0);
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

		it("deserializes ISO date strings back to Date objects", async () => {
			const iso = "2024-01-15T10:30:00.000Z";
			const original = mock(() =>
				Promise.resolve({ createdAt: new Date(iso) })
			);
			const cached = cacheable(original, {
				expireInSec: 60,
				prefix: "date",
			});

			mockGet.mockImplementation(() =>
				Promise.resolve(JSON.stringify({ createdAt: iso }))
			);

			const result = await cached();
			expect(result.createdAt).toBeInstanceOf(Date);
			expect(result.createdAt.toISOString()).toBe(iso);
		});

		it("deserializes nested date strings", async () => {
			const data = {
				user: {
					name: "test",
					createdAt: "2024-01-15T10:30:00.000Z",
					sessions: [{ startedAt: "2024-06-01T08:00:00.000Z" }],
				},
			};
			const cached = cacheable(async () => data, {
				expireInSec: 60,
				prefix: "nested-date",
			});

			mockGet.mockImplementation(() => Promise.resolve(JSON.stringify(data)));

			const result = await cached();
			expect(result.user.createdAt).toBeInstanceOf(Date);
			expect(result.user.sessions[0].startedAt).toBeInstanceOf(Date);
		});

		it("does not convert non-ISO strings to dates", async () => {
			const data = { label: "hello", badDate: "2024-99-99T99:99:99Z" };
			const cached = cacheable(async () => data, {
				expireInSec: 60,
				prefix: "no-date",
			});

			mockGet.mockImplementation(() => Promise.resolve(JSON.stringify(data)));

			const result = await cached();
			expect(typeof result.label).toBe("string");
		});

		it("handles cached primitive number", async () => {
			const cached = cacheable(async () => 42, {
				expireInSec: 60,
				prefix: "num",
			});
			mockGet.mockImplementation(() => Promise.resolve("42"));

			expect(await cached()).toBe(42);
		});

		it("handles cached string", async () => {
			const cached = cacheable(async () => "hello", {
				expireInSec: 60,
				prefix: "str",
			});
			mockGet.mockImplementation(() => Promise.resolve('"hello"'));

			expect(await cached()).toBe("hello");
		});

		it("handles cached array", async () => {
			const cached = cacheable(async () => [1, 2, 3], {
				expireInSec: 60,
				prefix: "arr",
			});
			mockGet.mockImplementation(() => Promise.resolve("[1,2,3]"));

			expect(await cached()).toEqual([1, 2, 3]);
		});

		it("handles cached null value", async () => {
			const cached = cacheable(async () => null, {
				expireInSec: 60,
				prefix: "cached-null",
			});
			mockGet.mockImplementation(() => Promise.resolve("null"));

			expect(await cached()).toBeNull();
		});
	});

	describe("cache miss", () => {
		it("calls original function and caches the result", async () => {
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

		it("forwards arguments to the original function", async () => {
			const original = mock((a: string, b: number) =>
				Promise.resolve(`${a}-${b}`)
			);
			const cached = cacheable(original, {
				expireInSec: 60,
				prefix: "args",
			});

			await cached("hello", 42);
			expect(original).toHaveBeenCalledWith("hello", 42);
		});

		it("does NOT cache null results", async () => {
			const cached = cacheable(async () => null, {
				expireInSec: 60,
				prefix: "null-skip",
			});

			const result = await cached();
			expect(result).toBeNull();
			expect(mockSetex).not.toHaveBeenCalled();
		});

		it("does NOT cache undefined results", async () => {
			const cached = cacheable(async () => undefined, {
				expireInSec: 60,
				prefix: "undef-skip",
			});

			const result = await cached();
			expect(result).toBeUndefined();
			expect(mockSetex).not.toHaveBeenCalled();
		});

		it("DOES cache falsy non-null values (0, empty string, false)", async () => {
			const cachedZero = cacheable(async () => 0, {
				expireInSec: 60,
				prefix: "zero",
			});
			const cachedEmpty = cacheable(async () => "", {
				expireInSec: 60,
				prefix: "empty",
			});
			const cachedFalse = cacheable(async () => false, {
				expireInSec: 60,
				prefix: "false-val",
			});

			await cachedZero();
			await cachedEmpty();
			await cachedFalse();

			expect(mockSetex).toHaveBeenCalledTimes(3);
		});

		it("accepts numeric shorthand for expireInSec", async () => {
			const cached = cacheable(async () => "v", 120);
			await cached();

			const [, ttl] = mockSetex.mock.calls[0];
			expect(ttl).toBe(120);
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

		it("does NOT revalidate when TTL >= staleTime (data is fresh)", async () => {
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

		it("handles revalidation failure gracefully (no throw, no crash)", async () => {
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

		it("does NOT check TTL when staleWhileRevalidate is false", async () => {
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

		it("default staleTime=0 disables SWR entirely (TTL is never checked)", async () => {
			const original = mock(() => Promise.resolve({ version: 2 }));

			const cached = cacheable(original, {
				expireInSec: 300,
				prefix: "swr-default-stale",
				staleWhileRevalidate: true,
				// staleTime defaults to 0
			});

			mockGet.mockImplementation(() =>
				Promise.resolve(JSON.stringify({ version: 1 }))
			);
			mockTtl.mockImplementation(() => Promise.resolve(1));

			await cached();
			await new Promise((resolve) => setTimeout(resolve, 50));

			// With staleTime=0, the staleTime > 0 guard skips SWR entirely
			expect(mockTtl).not.toHaveBeenCalled();
			expect(original).not.toHaveBeenCalled();
		});

		it("SWR TTL check does NOT block return of cached data (non-blocking)", async () => {
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

		it("falls back to expireInSec when TTL call fails (treats as fresh)", async () => {
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

		it("does NOT cache null result during revalidation", async () => {
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

		it("marks redis as unavailable after failure", async () => {
			const original = mock(() => Promise.resolve("ok"));
			const cached = cacheable(original, {
				expireInSec: 60,
				prefix: "unavail",
			});

			mockGet.mockImplementation(() =>
				Promise.reject(new Error("Connection refused"))
			);
			await cached();

			mockGet.mockClear();
			mockGet.mockImplementation(() => Promise.resolve(null));
			await cached();
			expect(mockGet).not.toHaveBeenCalled();
		});
	});

	describe("redis setex failure", () => {
		it("still returns the result even when caching fails", async () => {
			const cached = cacheable(async () => ({ data: "fresh" }), {
				expireInSec: 60,
				prefix: "set-fail",
			});

			mockSetex.mockImplementation(() =>
				Promise.reject(new Error("Write failed"))
			);

			const result = await cached();
			expect(result).toEqual({ data: "fresh" });
		});

		it("marks redis as unavailable after setex failure (async)", async () => {
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

		it("retries redis after 30-second cooldown expires", async () => {
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

		it("circuit breaker is global - one failure affects ALL cached functions (intentional)", async () => {
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

		it("recovers and successfully caches after cooldown", async () => {
			const cached = cacheable(async () => ({ recovered: true }), {
				expireInSec: 60,
				prefix: "cb-full-recovery",
			});

			mockGet.mockImplementation(() => Promise.reject(new Error("down")));
			await cached();

			timeOffset += 31_000;
			mockGet.mockImplementation(() => Promise.resolve(null));
			mockSetex.mockClear();

			await cached();
			expect(mockSetex).toHaveBeenCalledTimes(1);
		});
	});

	describe("slow redis", () => {
		it("slow get under timeout threshold still blocks (500ms < 2s timeout)", async () => {
			const cached = cacheable(async () => "fast", {
				expireInSec: 60,
				prefix: "slow-get",
			});

			mockGet.mockImplementation(
				() => new Promise((resolve) => setTimeout(() => resolve(null), 500))
			);

			const start = realDateNow();
			const result = await cached();
			const elapsed = realDateNow() - start;

			expect(result).toBe("fast");
			expect(elapsed).toBeGreaterThanOrEqual(450);
		});

		it("slow setex does NOT block return (fire-and-forget)", async () => {
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
		it("concurrent cache misses are deduplicated (single-flight)", async () => {
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

		it("concurrent calls with different args use different cache keys", async () => {
			const original = mock((id: string) => Promise.resolve({ id }));
			const cached = cacheable(original, {
				expireInSec: 60,
				prefix: "concurrent-diff",
			});

			const results = await Promise.all([
				cached("a"),
				cached("b"),
				cached("c"),
			]);

			expect(results).toEqual([{ id: "a" }, { id: "b" }, { id: "c" }]);
			expect(original).toHaveBeenCalledTimes(3);
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

		it("propagates errors when redis is unavailable (fn called directly)", async () => {
			// First: break redis
			mockGet.mockImplementation(() => Promise.reject(new Error("down")));
			const setup = cacheable(async () => "x", {
				expireInSec: 1,
				prefix: "setup-err",
			});
			await setup();

			// Now fn is called directly and throws
			const cached = cacheable(
				async () => {
					throw new Error("Service unavailable");
				},
				{ expireInSec: 60, prefix: "fn-err-no-redis" }
			);

			await expect(cached()).rejects.toThrow("Service unavailable");
		});

		it("when redis.get fails and fn also throws, error propagates", async () => {
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

		it("invalid JSON in cache does NOT trip circuit breaker", async () => {
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
		it("circular reference in result is handled gracefully (fn called once)", async () => {
			let callCount = 0;
			const original = mock(() => {
				callCount += 1;
				// Return circular object (can't be JSON.stringified)
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

		it("serialization failure does NOT trip circuit breaker", async () => {
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

	describe("edge cases", () => {
		it("works with no arguments", async () => {
			const cached = cacheable(async () => "no-args", {
				expireInSec: 60,
				prefix: "no-args",
			});

			expect(await cached()).toBe("no-args");
		});

		it("handles empty object result", async () => {
			const cached = cacheable(async () => ({}), {
				expireInSec: 60,
				prefix: "empty-obj",
			});

			const result = await cached();
			expect(result).toEqual({});
			expect(mockSetex).toHaveBeenCalledTimes(1);
		});

		it("handles empty array result", async () => {
			const cached = cacheable(async () => [], {
				expireInSec: 60,
				prefix: "empty-arr",
			});

			const result = await cached();
			expect(result).toEqual([]);
			expect(mockSetex).toHaveBeenCalledTimes(1);
		});

		it("handles large objects", async () => {
			const large = {
				items: Array.from({ length: 1000 }, (_, i) => ({
					id: i,
					name: `item-${i}`,
				})),
			};
			const cached = cacheable(async () => large, {
				expireInSec: 60,
				prefix: "large",
			});

			const result = await cached();
			expect(result.items).toHaveLength(1000);
		});

		it("exposes getKey method on the returned function", () => {
			const cached = cacheable(async () => "v", {
				expireInSec: 60,
				prefix: "getkey",
			});

			expect(typeof cached.getKey).toBe("function");
			expect(typeof cached.getKey()).toBe("string");
		});

		it("calls redis on every invocation", async () => {
			const cached = cacheable(async () => "v", {
				expireInSec: 60,
				prefix: "hot-path",
			});

			await cached();
			await cached();
			await cached();
			expect(mockGet).toHaveBeenCalledTimes(3);
		});

		it("uses correct cache key with the provided prefix", async () => {
			const cached = cacheable(async (id: string) => id, {
				expireInSec: 60,
				prefix: "users",
			});

			await cached("abc");

			const [key] = mockGet.mock.calls[0];
			expect(key).toStartWith("cacheable:users:");
			expect(key).toContain("abc");
		});
	});
});
