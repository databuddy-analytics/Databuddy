import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createDrizzleCache } from "./drizzle-cache";

let failSadd = false;

const redis = {
	get: mock(async () => null as string | null),
	sadd: mock(async () => {
		if (failSadd) {
			throw new Error("sadd failed");
		}
		return 1;
	}),
	setex: mock(async () => "OK" as const),
};

beforeEach(() => {
	failSadd = false;
	redis.get.mockClear();
	redis.sadd.mockClear();
	redis.setex.mockClear();
});

describe("createDrizzleCache", () => {
	it("writes the cache only after invalidation tracking succeeds", async () => {
		const cache = createDrizzleCache({
			redis: redis as never,
			namespace: "test",
		});

		const result = await cache.withCache({
			key: "row-1",
			queryFn: async () => ({ id: "row-1" }),
			tables: ["websites"],
			ttl: 60,
		});

		expect(result).toEqual({ id: "row-1" });
		expect(redis.sadd).toHaveBeenCalled();
		expect(redis.setex).toHaveBeenCalledWith(
			"test:row-1",
			60,
			JSON.stringify({ id: "row-1" })
		);
	});

	it("does not write cache entries when invalidation tracking fails", async () => {
		failSadd = true;
		const cache = createDrizzleCache({
			redis: redis as never,
			namespace: "test",
		});

		const result = await cache.withCache({
			key: "row-1",
			queryFn: async () => ({ id: "row-1" }),
			tables: ["websites"],
			ttl: 60,
		});

		expect(result).toEqual({ id: "row-1" });
		expect(redis.sadd).toHaveBeenCalled();
		expect(redis.setex).not.toHaveBeenCalled();
	});
});
