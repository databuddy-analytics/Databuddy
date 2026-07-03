import { describe, expect, test } from "bun:test";

process.env.SKIP_VALIDATION = "true";
const { basketEnvSchema } = await import("./basket");

const baseEnvironment = {
	DATABASE_URL: "postgres://localhost/test",
	REDIS_URL: "redis://localhost",
};

const productionSecrets = {
	DATABUDDY_ENCRYPTION_KEY: "key",
	IP_HASH_SALT: "salt",
};

describe("basket env schema", () => {
	test("rejects production without an encryption key", () => {
		const result = basketEnvSchema.safeParse({
			...baseEnvironment,
			...productionSecrets,
			NODE_ENV: "production",
			DATABUDDY_ENCRYPTION_KEY: undefined,
		});

		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.path).toEqual([
			"DATABUDDY_ENCRYPTION_KEY",
		]);
	});

	test("rejects production without an ip hash salt", () => {
		const result = basketEnvSchema.safeParse({
			...baseEnvironment,
			...productionSecrets,
			NODE_ENV: "production",
			IP_HASH_SALT: undefined,
		});

		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.path).toEqual(["IP_HASH_SALT"]);
	});

	test("accepts production with the required secrets", () => {
		const result = basketEnvSchema.safeParse({
			...baseEnvironment,
			...productionSecrets,
			NODE_ENV: "production",
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
