import { afterAll, describe, expect, it } from "bun:test";

process.env.REDIS_URL = "redis://test-host:6379";

const { getRedisCache, resetAuthCacheFailFast } = await import(
	"@databuddy/redis"
);
const { createAuthSecondaryStorage } = await import("./auth-redis-storage");

describe("createAuthSecondaryStorage", () => {
	afterAll(() => {
		resetAuthCacheFailFast();
		getRedisCache().disconnect();
	});

	it("fails fast on later session reads after Redis fails", async () => {
		const storage = createAuthSecondaryStorage();
		await expect(storage.get("session-key")).rejects.toThrow();

		const startedAt = performance.now();
		await expect(storage.get("session-key")).rejects.toThrow("failing fast");
		expect(performance.now() - startedAt).toBeLessThan(100);
	});
});
