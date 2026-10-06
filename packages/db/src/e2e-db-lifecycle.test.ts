import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	mock,
	spyOn,
} from "bun:test";
import { Client } from "pg";
import {
	assertLocalTargets,
	deriveAdminDatabaseUrl,
	deriveDatabaseUrl,
	parseLifecycleArgs,
	resolveE2EDatabaseName,
	resolveLifecycleConfig,
	resetLocalDatabase,
	sanitizeDbIdentifierPart,
	toShellAssignments,
} from "./e2e-db-lifecycle";

describe("e2e db lifecycle helpers", () => {
	it("parses create arguments", () => {
		expect(
			parseLifecycleArgs([
				"create",
				"--base-dsn",
				"postgres://u:p@localhost:5432/databuddy",
				"--db-prefix",
				"db_e2e",
				"--run-id",
				"run-1",
			])
		).toMatchObject({
			baseDsn: "postgres://u:p@localhost:5432/databuddy",
			command: "create",
			dbPrefix: "db_e2e",
			runId: "run-1",
		});
	});

	it("requires a db name for drop", () => {
		expect(() =>
			parseLifecycleArgs([
				"drop",
				"--base-dsn",
				"postgres://u:p@localhost:5432/databuddy",
			])
		).toThrow("Drop command requires '--db-name'");
	});

	it("sanitizes and caps generated database names", () => {
		expect(sanitizeDbIdentifierPart("Databuddy E2E -- branch/main")).toBe(
			"Databuddy_E2E_branch_main"
		);
		expect(
			resolveE2EDatabaseName({
				dbPrefix: "databuddy-e2e",
				runId: "run/with spaces",
			})
		).toBe("databuddy_e2e_run_with_spaces");
		expect(
			resolveE2EDatabaseName({
				dbPrefix: "x".repeat(80),
				runId: "y".repeat(20),
			}).length
		).toBeLessThanOrEqual(63);
	});

	it("derives admin and target DSNs", () => {
		const base = new URL(
			"postgres://u:p@localhost:5432/databuddy?sslmode=disable"
		);
		expect(deriveAdminDatabaseUrl(base).pathname).toBe("/postgres");
		expect(deriveDatabaseUrl(base, "databuddy_e2e_run").pathname).toBe(
			"/databuddy_e2e_run"
		);
	});

	it.each([
		"postgres://u:p@db:5432/databuddy",
		"postgres://u:p@staging:5432/databuddy",
		"postgres://u:p@0.0.0.0:5432/databuddy",
		"postgres://u:p@db.example.com:5432/databuddy",
		"postgres://[2001:db8::1]:5432/databuddy",
		"postgres://[::ffff:8.8.8.8]:5432/databuddy",
	])("refuses non-local database hosts by default: %s", (baseDsn) => {
		expect(() =>
			resolveLifecycleConfig({
				allowNonLocal: false,
				baseDsn,
				command: "create",
				dbPrefix: "databuddy_e2e",
			})
		).toThrow("Refusing to manage E2E DB on non-local host");
	});

	it("refuses to drop a database on a single-label host without the override", () => {
		const args = parseLifecycleArgs([
			"drop",
			"--base-dsn",
			"postgres://u:p@staging:5432/databuddy",
			"--db-name",
			"databuddy_e2e_run",
		]);
		expect(() => resolveLifecycleConfig(args)).toThrow(
			"Refusing to manage E2E DB on non-local host"
		);
		expect(
			resolveLifecycleConfig({ ...args, allowNonLocal: true }).adminDsn
		).toBe("postgres://u:p@staging:5432/postgres");
	});

	it.each([
		"host=remote.example",
		"%68ost=remote.example",
		"host=localhost&host=remote.example",
		"host=%2Ftmp%2Fpostgres",
	])("refuses PostgreSQL host overrides before create or drop: %s", (query) => {
		for (const command of ["create", "drop"] as const) {
			expect(() =>
				resolveLifecycleConfig({
					allowNonLocal: false,
					baseDsn: `postgres://u:p@localhost:5432/databuddy?${query}`,
					command,
					dbName: "databuddy_e2e_run",
					dbPrefix: "databuddy_e2e",
				})
			).toThrow("Refusing to manage E2E DB with a PostgreSQL host override");
		}
	});

	it("preserves an explicitly allowed PostgreSQL host override", () => {
		const config = resolveLifecycleConfig({
			allowNonLocal: true,
			baseDsn: "postgres://u:p@localhost:5432/databuddy?host=remote.example",
			command: "create",
			dbName: "databuddy_e2e_run",
			dbPrefix: "databuddy_e2e",
		});
		expect(config.adminDsn).toBe(
			"postgres://u:p@localhost:5432/postgres?host=remote.example"
		);
		expect(config.dbDsn).toBe(
			"postgres://u:p@localhost:5432/databuddy_e2e_run?host=remote.example"
		);
	});

	it.each([
		"localhost",
		"127.0.0.1",
		"[::1]",
		"[0:0:0:0:0:0:0:1]",
	])("allows an E2E database on loopback: %s", (host) => {
		expect(
			resolveLifecycleConfig({
				allowNonLocal: false,
				baseDsn: `postgres://u:p@${host}:5432/databuddy`,
				command: "create",
				dbPrefix: "databuddy_e2e",
				runId: "run",
			}).dbName
		).toBe("databuddy_e2e_run");
	});

	it("prints shell-safe assignments", () => {
		expect(
			toShellAssignments({ DATABASE_URL: "postgres://u:p@localhost/db'quoted" })
		).toBe("DATABASE_URL='postgres://u:p@localhost/db'\"'\"'quoted'");
	});
});

describe("workspace target guards", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv, NODE_ENV: "development" };
		delete process.env.CLICKHOUSE_URL;
		delete process.env.DATABASE_URL;
		delete process.env.REDIS_URL;
	});

	afterEach(() => {
		process.env = originalEnv;
		mock.restore();
	});

	it("uses the local development defaults when service URLs are unset", () => {
		expect(assertLocalTargets()).toBe(
			"postgres://databuddy:databuddy_dev_password@localhost:5432/databuddy"
		);
	});

	it.each([
		"localhost",
		"127.0.0.1",
		"[::1]",
	])("allows explicit loopback targets before workspace writes: %s", (host) => {
		process.env.CLICKHOUSE_URL = `http://${host}:8123`;
		process.env.REDIS_URL = `redis://${host}:6379`;
		process.env.DATABASE_URL = `postgres://u:p@${host}:5432/databuddy`;
		expect(assertLocalTargets()).toBe(process.env.DATABASE_URL);
	});

	it.each([
		["CLICKHOUSE_URL", "http://clickhouse:8123"],
		["DATABASE_URL", "postgres://u:p@staging:5432/databuddy"],
		["REDIS_URL", "redis://redis:6379"],
	])("refuses single-label %s before workspace writes", (name, url) => {
		process.env[name] = url;
		expect(() => assertLocalTargets()).toThrow(
			`Refusing to run against a non-local database; ${name}`
		);
	});

	it.each([
		"production",
		"test",
	])("still refuses unset workspace service URLs outside development: %s", (nodeEnv) => {
		process.env.NODE_ENV = nodeEnv;
		expect(() => assertLocalTargets()).toThrow('host is "unset"');
	});

	it.each([
		"host=remote.example",
		"%68ost=remote.example",
		"host=localhost&host=remote.example",
		"host=%2Ftmp%2Fpostgres",
	])("refuses workspace PostgreSQL host overrides before writes: %s", (query) => {
		process.env.DATABASE_URL = `postgres://u:p@localhost:5432/databuddy?${query}`;
		expect(() => assertLocalTargets()).toThrow(
			"Refusing to run the workspace with a PostgreSQL host override"
		);
	});

	it.each([
		"host=remote.example",
		"%68ost=remote.example",
		"host=localhost&host=remote.example",
		"host=%2Ftmp%2Fpostgres",
	])("refuses PostgreSQL reset host overrides before connecting: %s", async (query) => {
		const connect = spyOn(Client.prototype, "connect").mockImplementation(
			() => {
				throw new Error("Unexpected database connection in guard test");
			}
		);
		await expect(
			resetLocalDatabase(`postgres://u:p@localhost:5432/databuddy?${query}`)
		).rejects.toThrow(
			"Refusing to reset database with a PostgreSQL host override"
		);
		expect(connect).not.toHaveBeenCalled();
	});

	it.each([
		"staging",
		"0.0.0.0",
		"db.example.com",
		"[2001:db8::1]",
	])("refuses a non-loopback reset before opening a connection: %s", async (host) => {
		const connect = spyOn(Client.prototype, "connect").mockImplementation(
			() => {
				throw new Error("Unexpected database connection in guard test");
			}
		);
		await expect(
			resetLocalDatabase(`postgres://u:p@${host}:5432/databuddy`)
		).rejects.toThrow("Refusing to reset database");
		expect(connect).not.toHaveBeenCalled();
	});
});
