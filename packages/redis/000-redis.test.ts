import { afterAll, describe, expect, it, mock } from "bun:test";
import {
	createLinkCacheRedisConnectionOptions,
	createRateLimitRedisConnectionOptions,
} from "./redis-options";

process.env.REDIS_URL = "redis://test-host:6379";

const {
	getRedisCache,
	runAuthCacheCommand,
	runLinkCacheCommand,
	runRateLimitCommand,
	shutdownRedis,
} = await import("./redis");

describe("redis", () => {
	describe("latency-sensitive rate limit options", () => {
		const options = createRateLimitRedisConnectionOptions();

		it("uses a distinct bounded connection identity", () => {
			expect(options.connectionName).toBe("databuddy-rate-limit");
			expect(options.connectionName).not.toBe(
				createLinkCacheRedisConnectionOptions().connectionName
			);
			expect(options.connectTimeout).toBe(1000);
			expect(options.commandTimeout).toBe(1000);
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

	describe("link cache fail-fast", () => {
		afterAll(async () => {
			await shutdownRedis();
		});

		it("rejects immediately after a recent failure without running the operation", async () => {
			await expect(
				runLinkCacheCommand(async () => "unreachable")
			).rejects.toThrow();

			const operation = mock(async () => "value");
			const startedAt = performance.now();
			await expect(runLinkCacheCommand(operation)).rejects.toThrow(
				"failing fast"
			);
			expect(performance.now() - startedAt).toBeLessThan(100);
			expect(operation).not.toHaveBeenCalled();
		});

		it("probes again after shutdown resets the fail-fast window", async () => {
			await shutdownRedis();
			const error = await runLinkCacheCommand(async () => "value").catch(
				(caught: Error) => caught
			);
			expect(error).toBeInstanceOf(Error);
			expect(error.message).not.toContain("failing fast");
		});
	});

	describe("rate limit fail-fast", () => {
		afterAll(async () => {
			await shutdownRedis();
		});

		it("rejects immediately after a recent failure without running the operation", async () => {
			await expect(
				runRateLimitCommand(async () => "unreachable")
			).rejects.toThrow();

			const operation = mock(async () => "value");
			const startedAt = performance.now();
			await expect(runRateLimitCommand(operation)).rejects.toThrow(
				"failing fast"
			);
			expect(performance.now() - startedAt).toBeLessThan(100);
			expect(operation).not.toHaveBeenCalled();
		});

		it("tracks its window independently of the link cache", async () => {
			await shutdownRedis();
			await expect(
				runRateLimitCommand(async () => "unreachable")
			).rejects.toThrow();

			const linkCacheError = await runLinkCacheCommand(
				async () => "value"
			).catch((caught: Error) => caught);
			expect(linkCacheError).toBeInstanceOf(Error);
			expect(linkCacheError.message).not.toContain("failing fast");
		});
	});

	describe("auth cache fail-fast", () => {
		afterAll(async () => {
			await shutdownRedis();
		});

		it("rejects immediately after a recent failure without running the operation", async () => {
			await expect(
				runAuthCacheCommand(async () => {
					throw new Error("redis down");
				})
			).rejects.toThrow("redis down");

			const operation = mock(async () => "value");
			const startedAt = performance.now();
			await expect(runAuthCacheCommand(operation)).rejects.toThrow(
				"failing fast"
			);
			expect(performance.now() - startedAt).toBeLessThan(100);
			expect(operation).not.toHaveBeenCalled();
		});

		it("tracks its window independently of the link cache", async () => {
			await shutdownRedis();
			await expect(
				runAuthCacheCommand(async () => {
					throw new Error("redis down");
				})
			).rejects.toThrow("redis down");

			const linkCacheError = await runLinkCacheCommand(
				async () => "value"
			).catch((caught: Error) => caught);
			expect(linkCacheError).toBeInstanceOf(Error);
			expect(linkCacheError.message).not.toContain("failing fast");
		});
	});
});
