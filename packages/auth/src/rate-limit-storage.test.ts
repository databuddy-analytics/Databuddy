import { describe, expect, mock, test } from "bun:test";

const ratelimit = mock(async () => ({
	limit: 3,
	remaining: 2,
	reset: Date.now() + 60_000,
	success: true,
}));

mock.module("@databuddy/redis", () => ({ ratelimit }));

const { createAuthRateLimitStorage } = await import("./rate-limit-storage");

describe("createAuthRateLimitStorage", () => {
	test("atomically delegates the request rule and allows successful requests", async () => {
		resetRateLimit();
		const storage = createAuthRateLimitStorage();

		await expect(
			storage.consume("auth:sign-in", { max: 3, window: 60 })
		).resolves.toEqual({ allowed: true, retryAfter: null });
		expect(ratelimit).toHaveBeenCalledWith("auth:sign-in", 3, 60);
	});

	test("maps blocked requests to a positive retry delay", async () => {
		resetRateLimit({
			success: false,
			reset: Date.now() + 2_000,
		});
		const storage = createAuthRateLimitStorage();

		await expect(
			storage.consume("auth:sign-in", { max: 3, window: 60 })
		).resolves.toEqual({ allowed: false, retryAfter: 2 });
	});

	test("never returns a zero-second retry delay", async () => {
		resetRateLimit({ success: false, reset: Date.now() });
		const storage = createAuthRateLimitStorage();

		await expect(
			storage.consume("auth:sign-in", { max: 3, window: 60 })
		).resolves.toEqual({ allowed: false, retryAfter: 1 });
	});
});

function resetRateLimit(
	override: Partial<Awaited<ReturnType<typeof ratelimit>>> = {}
) {
	ratelimit.mockReset();
	ratelimit.mockResolvedValue({
		limit: 3,
		remaining: 2,
		reset: Date.now() + 60_000,
		success: true,
		...override,
	});
}
