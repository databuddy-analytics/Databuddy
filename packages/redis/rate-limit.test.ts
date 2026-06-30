import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const calls: Array<{ key: string; member: string }> = [];
const buckets = new Map<string, number>();

const mockRedisClient = {
	eval: mock(
		async (
			_script: string,
			_numKeys: number,
			key: string,
			_now: string,
			_windowMs: string,
			limitValue: string,
			member: string
		) => {
			calls.push({ key, member });
			const limit = Number(limitValue);
			const count = buckets.get(key) ?? 0;
			if (count >= limit) {
				return [0, count] as [number, number];
			}
			const next = count + 1;
			buckets.set(key, next);
			return [1, next] as [number, number];
		}
	),
};

mock.module("./redis", () => ({
	getRedisCache: () => mockRedisClient,
}));

const { ratelimit } = await import("./rate-limit");

afterAll(() => {
	mock.restore();
});

beforeEach(() => {
	calls.length = 0;
	buckets.clear();
	mockRedisClient.eval.mockClear();
});

describe("ratelimit", () => {
	it("uses one atomic Redis script per decision", async () => {
		const first = await ratelimit("user-1", 2, 60);
		const second = await ratelimit("user-1", 2, 60);
		const third = await ratelimit("user-1", 2, 60);

		expect(first.success).toBe(true);
		expect(first.remaining).toBe(1);
		expect(second.success).toBe(true);
		expect(second.remaining).toBe(0);
		expect(third.success).toBe(false);
		expect(third.remaining).toBe(0);
		expect(buckets.get("rl:user-1")).toBe(2);
		expect(mockRedisClient.eval).toHaveBeenCalledTimes(3);
		expect(calls.every((call) => call.key === "rl:user-1")).toBe(true);
	});

	it("fails open when Redis is unavailable", async () => {
		mockRedisClient.eval.mockImplementationOnce(async () => {
			throw new Error("redis down");
		});

		const result = await ratelimit("user-2", 5, 60);

		expect(result.success).toBe(true);
		expect(result.limit).toBe(5);
		expect(result.remaining).toBe(4);
		expect(buckets.has("rl:user-2")).toBe(false);
	});
});
