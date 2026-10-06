import { describe, expect, it } from "bun:test";
import {
	deriveAdminDatabaseUrl,
	deriveDatabaseUrl,
	parseLifecycleArgs,
	resolveE2EDatabaseName,
	resolveLifecycleConfig,
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
