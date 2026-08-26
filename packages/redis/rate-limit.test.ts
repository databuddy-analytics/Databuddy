import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const sortedSets = new Map<string, Map<string, number>>();

const mockRedisClient = {
	eval: mock(
		async (
			_script: string,
			_numKeys: number,
			key: string,
			nowArg: string,
			windowMsArg: string,
			limitArg: string,
			member: string,
			_windowSecondsArg: string
		) => {
			const now = Number(nowArg);
			const windowMs = Number(windowMsArg);
			const limit = Number(limitArg);
			const set = sortedSets.get(key) ?? new Map<string, number>();
			sortedSets.set(key, set);

			for (const [existing, score] of set) {
				if (score <= now - windowMs) {
					set.delete(existing);
				}
			}

			let count = set.size;
			let success = 0;
			if (count < limit) {
				set.set(member, now);
				count += 1;
				success = 1;
			}
			return [success, count] as [number, number];
		}
	),
};

mock.module("./redis", () => ({
	runRateLimitCommand: <T>(
		operation: (client: typeof mockRedisClient) => Promise<T>
	) => operation(mockRedisClient),
}));

const { getRateLimitHeaders, ratelimit } = await import("./rate-limit");

const realDateNow = Date.now;
let timeOffset = 0;
Date.now = () => realDateNow() + timeOffset;

afterAll(() => {
	Date.now = realDateNow;
	mock.restore();
});

beforeEach(() => {
	timeOffset = 0;
	sortedSets.clear();
	mockRedisClient.eval.mockClear();
});

describe("ratelimit", () => {
	it("admits requests until the window holds exactly the limit, then rejects", async () => {
		const first = await ratelimit("user-1", 2, 60);
		const second = await ratelimit("user-1", 2, 60);
		const third = await ratelimit("user-1", 2, 60);

		expect(first).toMatchObject({ success: true, limit: 2, remaining: 1 });
		expect(second).toMatchObject({ success: true, limit: 2, remaining: 0 });
		expect(third).toMatchObject({ success: false, limit: 2, remaining: 0 });
		expect(sortedSets.get("rl:user-1")?.size).toBe(2);
		expect(mockRedisClient.eval).toHaveBeenCalledTimes(3);
	});

	it("readmits once earlier requests fall out of the sliding window", async () => {
		await ratelimit("user-1", 2, 60);
		await ratelimit("user-1", 2, 60);
		expect((await ratelimit("user-1", 2, 60)).success).toBe(false);

		timeOffset += 61_000;

		const afterRollover = await ratelimit("user-1", 2, 60);
		expect(afterRollover.success).toBe(true);
		expect(afterRollover.remaining).toBe(1);
	});

	it("keeps rejecting while any in-window entry holds the slot", async () => {
		await ratelimit("user-1", 1, 60);

		timeOffset += 59_000;

		expect((await ratelimit("user-1", 1, 60)).success).toBe(false);
	});

	it("clamps remaining at zero when the window is over-full", async () => {
		const now = Date.now();
		sortedSets.set(
			"rl:user-1",
			new Map([
				["a", now],
				["b", now],
				["c", now],
			])
		);

		const result = await ratelimit("user-1", 2, 60);

		expect(result.success).toBe(false);
		expect(result.remaining).toBe(0);
	});

	it("computes reset as one full window from the request time", async () => {
		const before = Date.now();
		const result = await ratelimit("user-1", 5, 60);

		expect(result.reset).toBeGreaterThanOrEqual(before + 60_000);
		expect(result.reset).toBeLessThanOrEqual(Date.now() + 60_000);
	});

	it("isolates buckets per identifier", async () => {
		await ratelimit("user-1", 1, 60);

		const other = await ratelimit("user-2", 1, 60);

		expect(other.success).toBe(true);
		expect(sortedSets.has("rl:user-1")).toBe(true);
		expect(sortedSets.has("rl:user-2")).toBe(true);
	});

	it("fails open with a degraded result when redis is unavailable", async () => {
		mockRedisClient.eval.mockImplementationOnce(async () => {
			throw new Error("redis down");
		});

		const result = await ratelimit("user-2", 5, 60);

		expect(result).toMatchObject({
			degraded: true,
			success: true,
			limit: 5,
			remaining: 4,
		});
		expect(sortedSets.has("rl:user-2")).toBe(false);
	});
});

describe("getRateLimitHeaders", () => {
	it("exposes limit, remaining, and reset without Retry-After on success", () => {
		const headers = getRateLimitHeaders({
			limit: 10,
			remaining: 7,
			reset: 1_700_000_000_000,
			success: true,
		});

		expect(headers).toEqual({
			"X-RateLimit-Limit": "10",
			"X-RateLimit-Remaining": "7",
			"X-RateLimit-Reset": "1700000000000",
		});
	});

	it("adds Retry-After in whole seconds until reset on rejection", () => {
		const headers = getRateLimitHeaders({
			limit: 10,
			remaining: 0,
			reset: Date.now() + 30_000,
			success: false,
		});

		expect(headers["Retry-After"]).toBe("30");
		expect(headers["X-RateLimit-Remaining"]).toBe("0");
	});
});
