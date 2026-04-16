import { describe, expect, it, mock } from "bun:test";

let capturedUrl: string | undefined;
let capturedOptions: Record<string, unknown> | undefined;
let registeredErrorHandler: ((...args: unknown[]) => void) | undefined;

class MockRedis {
	url: string;
	options: Record<string, unknown>;

	constructor(url: string, options: Record<string, unknown>) {
		capturedUrl = url;
		capturedOptions = options;
	}

	on(event: string, handler: (...args: unknown[]) => void) {
		if (event === "error") {
			registeredErrorHandler = handler;
		}
		return this;
	}

	disconnect() {}
}

mock.module("ioredis", () => ({
	default: MockRedis,
}));

process.env.REDIS_URL = "redis://test-host:6379";

const { getRedisCache, redis } = await import("./redis");

describe("redis", () => {
	describe("constructor options", () => {
		it("passes REDIS_URL to the Redis constructor", () => {
			expect(capturedUrl).toBe("redis://test-host:6379");
		});

		it("sets connectTimeout to 10 seconds", () => {
			expect(capturedOptions?.connectTimeout).toBe(10_000);
		});

		it("sets commandTimeout to 5 seconds", () => {
			expect(capturedOptions?.commandTimeout).toBe(5000);
		});

		it("sets maxRetriesPerRequest to 3", () => {
			expect(capturedOptions?.maxRetriesPerRequest).toBe(3);
		});
	});

	describe("retry strategy", () => {
		const strategy = capturedOptions?.retryStrategy as (
			times: number
		) => number;

		it("returns 100ms on first retry", () => {
			expect(strategy(1)).toBe(100);
		});

		it("scales linearly at 100ms per attempt", () => {
			expect(strategy(5)).toBe(500);
			expect(strategy(10)).toBe(1000);
			expect(strategy(20)).toBe(2000);
		});

		it("caps at 3000ms", () => {
			expect(strategy(30)).toBe(3000);
			expect(strategy(50)).toBe(3000);
			expect(strategy(100)).toBe(3000);
		});

		it("returns 0ms for zeroth attempt (ioredis starts at 1)", () => {
			expect(strategy(0)).toBe(0);
		});
	});

	describe("singleton behavior", () => {
		it("returns the same instance on repeated calls", () => {
			const a = getRedisCache();
			const b = getRedisCache();
			expect(a).toBe(b);
		});

		it("module-level redis export equals getRedisCache result", () => {
			expect(redis).toBe(getRedisCache());
		});
	});

	describe("error handling", () => {
		it("registers an error event handler", () => {
			expect(registeredErrorHandler).toBeDefined();
		});

		it("error handler calls console.error", () => {
			const originalError = console.error;
			let errorLogged = false;
			console.error = (..._args: unknown[]) => {
				errorLogged = true;
			};

			registeredErrorHandler?.(new Error("test error"));
			expect(errorLogged).toBe(true);

			console.error = originalError;
		});
	});

	describe("shutdown behavior", () => {
		it("registers a SIGTERM handler", () => {
			expect(process.listenerCount("SIGTERM")).toBeGreaterThanOrEqual(1);
		});
	});
});
