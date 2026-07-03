import { describe, expect, test } from "bun:test";

process.env.SKIP_VALIDATION = "true";
const { basketEnvSchema } = await import("./basket");

const baseEnvironment = {
	DATABASE_URL: "postgres://localhost/test",
	REDIS_URL: "redis://localhost",
};

describe("basket env schema", () => {
	test("rejects production without an encryption key", () => {
		const result = basketEnvSchema.safeParse({
			...baseEnvironment,
			NODE_ENV: "production",
		});

		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.path).toEqual([
			"DATABUDDY_ENCRYPTION_KEY",
		]);
	});

	test("accepts production with an encryption key", () => {
		const result = basketEnvSchema.safeParse({
			...baseEnvironment,
			NODE_ENV: "production",
			DATABUDDY_ENCRYPTION_KEY: "key",
		});

		expect(result.success).toBe(true);
	});

	test("accepts development without an encryption key", () => {
		const result = basketEnvSchema.safeParse({
			...baseEnvironment,
			NODE_ENV: "development",
		});

		expect(result.success).toBe(true);
	});
});
