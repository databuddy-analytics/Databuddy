import { afterAll, describe, expect, it } from "bun:test";
import {
	createRedisConnectionOptions,
	getRedisUrl,
} from "./redis-options";

process.env.REDIS_URL = "redis://test-host:6379";

const { getRedisCache, shutdownRedis } = await import("./redis");

describe("redis", () => {
	describe("connection options", () => {
		const options = createRedisConnectionOptions();

		it("reads REDIS_URL from the environment", () => {
			expect(getRedisUrl()).toBe("redis://test-host:6379");
		});

		it("sets connectTimeout to 10 seconds", () => {
			expect(options.connectTimeout).toBe(10_000);
		});

		it("sets commandTimeout to 5 seconds", () => {
			expect(options.commandTimeout).toBe(5000);
		});

		it("sets maxRetriesPerRequest to 3", () => {
			expect(options.maxRetriesPerRequest).toBe(3);
		});
	});

	describe("retry strategy", () => {
		const { retryStrategy } = createRedisConnectionOptions();

		it("returns 100ms on first retry", () => {
			expect(retryStrategy(1)).toBe(100);
		});

		it("scales linearly at 100ms per attempt", () => {
			expect(retryStrategy(5)).toBe(500);
			expect(retryStrategy(10)).toBe(1000);
			expect(retryStrategy(20)).toBe(2000);
		});

		it("never returns null so ioredis keeps reconnecting", () => {
			expect(retryStrategy(21)).toBe(2100);
			expect(retryStrategy(30)).toBe(3000);
			expect(retryStrategy(1000)).toBe(3000);
		});
	});

	describe("singleton lifecycle", () => {
		afterAll(async () => {
			await shutdownRedis();
		});

		it("rebuilds the singleton after the connection ends", async () => {
			const first = getRedisCache();
			first.disconnect();
			first.emit("end");

			const second = getRedisCache();
			expect(second).not.toBe(first);
			second.disconnect();
		});
	});
});
