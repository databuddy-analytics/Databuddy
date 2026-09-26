import { Readable } from "node:stream";
import { ResultSet } from "@clickhouse/client";
import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { chQuery, clickHouse, setClickHouseReadMode } from "./client";

describe("chQuery", () => {
	afterEach(() => {
		mock.restore();
	});

	test("aborts while the response body is still streaming", async () => {
		const stream = new Readable({ read: () => undefined });
		const result = new ResultSet(stream, "JSON", "test-query");
		spyOn(clickHouse, "query").mockResolvedValue(result);

		const controller = new AbortController();
		const deadline = new Error("query deadline exceeded");
		const query = chQuery("SELECT 1", undefined, {
			abort_signal: controller.signal,
		});
		await Promise.resolve();
		controller.abort(deadline);

		const outcome = await Promise.race([
			query.then(
				() => "resolved",
				(error) => (error === deadline ? "aborted" : "wrong-error")
			),
			new Promise<string>((resolve) =>
				setTimeout(() => resolve("still-pending"), 100)
			),
		]);
		expect(outcome).toBe("aborted");
		expect(stream.destroyed).toBe(true);
	});

	test("keeps a timeout signal armed across response headers", async () => {
		const stream = new Readable({ read: () => undefined });
		const result = new ResultSet(stream, "JSON", "test-query");
		spyOn(clickHouse, "query").mockResolvedValue(result);

		const signal = AbortSignal.timeout(10);
		const outcome = await Promise.race([
			chQuery("SELECT 1", undefined, { abort_signal: signal }).then(
				() => "resolved",
				(error) =>
					error instanceof Error && error.name === "TimeoutError"
						? "timed-out"
						: "wrong-error"
			),
			new Promise<string>((resolve) =>
				setTimeout(() => resolve("still-pending"), 100)
			),
		]);

		expect(outcome).toBe("timed-out");
		expect(signal.aborted).toBe(true);
		expect(stream.destroyed).toBe(true);
	});

	test("closes a result that arrives after the caller aborts", async () => {
		let closeCalls = 0;
		let jsonCalls = 0;
		const lateResult = {
			close: () => {
				closeCalls += 1;
			},
			json: async () => {
				jsonCalls += 1;
				return { data: [] };
			},
		} as unknown as ResultSet<"JSON">;
		let resolveResult: ((result: ResultSet<"JSON">) => void) | undefined;
		const pendingResult = new Promise<ResultSet<"JSON">>((resolve) => {
			resolveResult = resolve;
		});
		spyOn(clickHouse, "query").mockReturnValue(pendingResult);

		const controller = new AbortController();
		const reason = new Error("cancel before headers");
		const query = chQuery("SELECT 1", undefined, {
			abort_signal: controller.signal,
		});
		controller.abort(reason);
		await expect(query).rejects.toBe(reason);
		resolveResult?.(lateResult);
		await Bun.sleep(0);

		expect(closeCalls).toBe(1);
		expect(jsonCalls).toBe(0);
	});

	test("does not start a query for an already-aborted signal", async () => {
		const querySpy = spyOn(clickHouse, "query");
		const controller = new AbortController();
		const reason = new Error("already cancelled");
		controller.abort(reason);

		await expect(
			chQuery("SELECT 1", undefined, { abort_signal: controller.signal })
		).rejects.toBe(reason);
		expect(querySpy).not.toHaveBeenCalled();
	});

	test("enables FINAL only for queries that touch delivery tables", async () => {
		let settings: Record<string, string | number> | undefined;
		let query = "";
		spyOn(clickHouse, "query").mockImplementation(async (options) => {
			settings = options.clickhouse_settings as Record<string, string | number>;
			query = options.query;
			return {
				close: () => undefined,
				json: async () => ({ data: [] }),
			} as unknown as ResultSet<"JSON">;
		});

		await chQuery("SELECT count() FROM analytics.events");

		// FINAL is now injected directly into the SQL instead of via a session
		// setting, so no extra clickhouse_settings are needed.
		expect(settings).toBeUndefined();
		expect(query).toBe("SELECT count() FROM analytics.events FINAL");
	});

	test("can omit forbidden settings for a bounded read-only evaluator", async () => {
		let settings: Record<string, string | number> | undefined;
		spyOn(clickHouse, "query").mockImplementation(async (options) => {
			settings = options.clickhouse_settings as
				| Record<string, string | number>
				| undefined;
			return {
				close: () => undefined,
				json: async () => ({ data: [] }),
			} as unknown as ResultSet<"JSON">;
		});
		const restore = setClickHouseReadMode("restricted");
		try {
			await chQuery("SELECT count() FROM analytics.events", undefined, {
				readonly: true,
			});
		} finally {
			restore();
		}

		expect(settings).toBeUndefined();
	});

	test("does not finalize unrelated MergeTree queries", async () => {
		let settings: unknown;
		spyOn(clickHouse, "query").mockImplementation(async (options) => {
			settings = options.clickhouse_settings;
			return {
				close: () => undefined,
				json: async () => ({ data: [] }),
			} as unknown as ResultSet<"JSON">;
		});

		await chQuery("SELECT count() FROM analytics.revenue");
		expect(settings).toBeUndefined();
	});
});

describe("integration test loopback guard", () => {
	function importClient(env: Record<string, string>) {
		const { CLICKHOUSE_INTEGRATION_TESTS, CLICKHOUSE_URL, ...inherited } =
			process.env;
		return Bun.spawnSync({
			cmd: [process.execPath, "--no-env-file", "-e", 'import "./client.ts"'],
			cwd: import.meta.dir,
			env: { ...inherited, ...env },
			stderr: "pipe",
		});
	}

	test("refuses a remote ClickHouse when integration tests are enabled", () => {
		const result = importClient({
			CLICKHOUSE_INTEGRATION_TESTS: "true",
			CLICKHOUSE_URL: "http://default:@clickhouse.example.test:8123",
		});
		expect(result.exitCode).not.toBe(0);
		expect(result.stderr.toString()).toContain(
			'only run against a loopback server; CLICKHOUSE_URL host is "clickhouse.example.test"'
		);
	});

	test("refuses an unset ClickHouse URL when integration tests are enabled", () => {
		const result = importClient({ CLICKHOUSE_INTEGRATION_TESTS: "true" });
		expect(result.exitCode).not.toBe(0);
		expect(result.stderr.toString()).toContain('host is "unset"');
	});

	test("allows loopback when integration tests are enabled", () => {
		const result = importClient({
			CLICKHOUSE_INTEGRATION_TESTS: "true",
			CLICKHOUSE_URL: "http://default:@127.0.0.1:8123/databuddy_analytics",
		});
		expect(result.exitCode).toBe(0);
	});

	test("ignores a remote ClickHouse when integration tests are not enabled", () => {
		const result = importClient({
			CLICKHOUSE_URL: "http://default:@clickhouse.example.test:8123",
		});
		expect(result.exitCode).toBe(0);
	});
});
