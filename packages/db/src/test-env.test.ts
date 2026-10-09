import { describe, expect, test } from "bun:test";

describe("test environment service URLs", () => {
	function importTestEnv(overrides: Record<string, string>) {
		return Bun.spawnSync({
			cmd: [process.execPath, "--no-env-file", "-e", 'import "./test-env.ts"'],
			cwd: import.meta.dir,
			env: {
				...process.env,
				CI: "true",
				DATABASE_URL: "postgres://u:p@localhost:5432/databuddy_test",
				REDIS_URL: "redis://localhost:6379/1",
				BULLMQ_REDIS_URL: "redis://localhost:6379/1",
				CLICKHOUSE_URL: "http://localhost:8123",
				...overrides,
			},
			stdout: "ignore",
			stderr: "pipe",
		});
	}

	test.each([
		["DATABASE_URL", "postgres://u:p@staging:5432/databuddy_test"],
		["REDIS_URL", "redis://redis:6379/1"],
		["BULLMQ_REDIS_URL", "redis://queue:6379/1"],
		["CLICKHOUSE_URL", "http://clickhouse:8123"],
	])("refuses CI-supplied non-loopback %s", (name, url) => {
		const result = importTestEnv({ [name]: url });
		expect(result.exitCode).not.toBe(0);
		expect(result.stderr.toString()).toContain(
			`${name} must point at a local test service`
		);
	});

	test.each([
		"localhost",
		"127.0.0.1",
		"[::1]",
	])("allows CI-supplied loopback services: %s", (host) => {
		const result = importTestEnv({
			DATABASE_URL: `postgres://u:p@${host}:5432/databuddy_test`,
			REDIS_URL: `redis://${host}:6379/1`,
			BULLMQ_REDIS_URL: `redis://${host}:6379/1`,
			CLICKHOUSE_URL: `http://${host}:8123`,
		});
		expect(result.exitCode, result.stderr.toString()).toBe(0);
	});
});
