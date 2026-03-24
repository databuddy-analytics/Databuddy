import { describe, expect, test } from "bun:test";
import { extractHealth, isHealthExtractionEnabled } from "./json-parser";

// ── isHealthExtractionEnabled ───────────────────────────────────────────

describe("isHealthExtractionEnabled", () => {
	test("returns false for null / undefined", () => {
		expect(isHealthExtractionEnabled(null)).toBe(false);
		expect(isHealthExtractionEnabled(undefined)).toBe(false);
	});

	test("returns false for non-object values", () => {
		expect(isHealthExtractionEnabled("yes")).toBe(false);
		expect(isHealthExtractionEnabled(42)).toBe(false);
		expect(isHealthExtractionEnabled(true)).toBe(false);
	});

	test("returns false when enabled is missing or non-boolean", () => {
		expect(isHealthExtractionEnabled({})).toBe(false);
		expect(isHealthExtractionEnabled({ enabled: "true" })).toBe(false);
	});

	test("returns true when enabled is true", () => {
		expect(isHealthExtractionEnabled({ enabled: true })).toBe(true);
	});

	test("returns false when enabled is false", () => {
		expect(isHealthExtractionEnabled({ enabled: false })).toBe(false);
	});

	test("ignores legacy mode/fields — only checks enabled", () => {
		expect(
			isHealthExtractionEnabled({
				enabled: true,
				mode: "manual",
				fields: ["db.latency"],
			})
		).toBe(true);
	});
});

// ── extractHealth – guard rails ─────────────────────────────────────────

describe("extractHealth – guard rails", () => {
	test("returns null for non-JSON string", () => {
		expect(extractHealth("<html></html>")).toBeNull();
	});

	test("returns null for invalid JSON string", () => {
		expect(extractHealth("{broken")).toBeNull();
	});

	test("returns null for empty object (no health signals)", () => {
		expect(extractHealth("{}")).toBeNull();
		expect(extractHealth({})).toBeNull();
	});

	test("returns null for object without status or latency", () => {
		expect(extractHealth({ version: "1.0", uptime: "3d" })).toBeNull();
	});

	test("returns null for primitives", () => {
		expect(extractHealth(42)).toBeNull();
		expect(extractHealth(true)).toBeNull();
		expect(extractHealth(null)).toBeNull();
	});
});

// ── extractHealth – realistic health check payloads ─────────────────────

describe("extractHealth – realistic health check payloads", () => {
	test("flat health endpoint: { status: 'ok', latency: 12 }", () => {
		const result = extractHealth({ status: "ok", latency: 12 });

		expect(result).not.toBeNull();
		expect(result?._root).toEqual({ status: "ok", latency: 12 });
	});

	test("Spring Boot / Actuator style nested checks", () => {
		const result = extractHealth({
			status: "UP",
			components: {
				db: { status: "UP", details: { database: "PostgreSQL" } },
				redis: { status: "UP", details: { version: "7.0" } },
			},
		});

		expect(result?._root?.status).toBe("UP");
		expect(result?.["components.db"]?.status).toBe("UP");
		expect(result?.["components.redis"]?.status).toBe("UP");
	});

	test("microservice health with latency_ms fields", () => {
		const result = extractHealth({
			services: {
				payments: { status: "healthy", latency_ms: 45 },
				auth: { status: "healthy", latency_ms: 12 },
				search: { status: "degraded", latency_ms: 980 },
			},
		});

		expect(result?.["services.payments"]?.status).toBe("healthy");
		expect(result?.["services.payments"]?.latency).toBe(45);
		expect(result?.["services.auth"]?.latency).toBe(12);
		expect(result?.["services.search"]?.latency).toBe(980);
	});

	test("duration_ms is recognized as latency", () => {
		const result = extractHealth({ api: { status: 200, duration_ms: 33 } });
		expect(result?.api?.latency).toBe(33);
	});

	test("response_time is recognized as latency", () => {
		const result = extractHealth({
			gateway: { status: "ok", response_time: 8 },
		});
		expect(result?.gateway?.latency).toBe(8);
	});

	test("responseTime (camelCase) is recognized", () => {
		const result = extractHealth({ proxy: { status: true, responseTime: 120 } });
		expect(result?.proxy?.latency).toBe(120);
	});

	test("time_ms is recognized as latency", () => {
		const result = extractHealth({ cdn: { time_ms: 4 } });
		expect(result?.cdn?.latency).toBe(4);
	});

	test("picks first matching latency key when multiple present", () => {
		const result = extractHealth({
			svc: { status: "ok", latency: 10, duration_ms: 50, response_time: 99 },
		});
		expect(result?.svc?.latency).toBe(10);
	});
});

// ── extractHealth – arrays ──────────────────────────────────────────────

describe("extractHealth – arrays", () => {
	test("top-level array of service checks", () => {
		const result = extractHealth(
			JSON.stringify([
				{ name: "db", status: "ok", latency: 5 },
				{ name: "cache", status: "ok", latency: 2 },
			])
		);

		expect(result?.["_items[0]"]?.status).toBe("ok");
		expect(result?.["_items[0]"]?.latency).toBe(5);
		expect(result?.["_items[1]"]?.latency).toBe(2);
	});

	test("nested array of checks", () => {
		const result = extractHealth({
			checks: [
				{ name: "pg", status: "up", latency_ms: 3 },
				{ name: "redis", status: "up", latency_ms: 1 },
			],
		});

		expect(result?.["checks[0]"]?.status).toBe("up");
		expect(result?.["checks[0]"]?.latency).toBe(3);
		expect(result?.["checks[1]"]?.latency).toBe(1);
	});
});

// ── extractHealth – deeply nested ───────────────────────────────────────

describe("extractHealth – deeply nested", () => {
	test("finds health signals through wrapper objects", () => {
		const result = extractHealth({
			data: {
				infrastructure: {
					database: { status: "ok", latency: 7 },
				},
			},
		});

		expect(result?.["data.infrastructure.database"]?.status).toBe("ok");
		expect(result?.["data.infrastructure.database"]?.latency).toBe(7);
	});

	test("skips non-health intermediate objects", () => {
		const result = extractHealth({
			meta: { version: "2.1" },
			checks: { db: { status: "ok" } },
		});

		expect(result?.["checks.db"]).toBeDefined();
		expect(result?.meta).toBeUndefined();
	});
});

// ── extractHealth – input types ─────────────────────────────────────────

describe("extractHealth – input types", () => {
	test("accepts pre-parsed object", () => {
		const result = extractHealth({ status: "ok", latency: 1 });
		expect(result?._root).toEqual({ status: "ok", latency: 1 });
	});

	test("accepts JSON string", () => {
		const result = extractHealth(JSON.stringify({ status: 200 }));
		expect(result?._root).toBeDefined();
	});

	test("detects JSON from body starting with { even without content type", () => {
		const result = extractHealth(JSON.stringify({ status: "ok" }));
		expect(result?._root).toBeDefined();
	});

	test("returns null for pre-parsed array of primitives", () => {
		expect(extractHealth([1, 2, 3])).toBeNull();
	});
});

// ── extractHealth – edge cases ──────────────────────────────────────────

describe("extractHealth – edge cases", () => {
	test("preserves string latency like '12ms'", () => {
		const result = extractHealth({ api: { status: "ok", latency: "12ms" } });
		expect(result?.api?.latency).toBe("12ms");
	});

	test("captures objects with status but no latency", () => {
		const result = extractHealth({ worker: { status: "running" } });
		expect(result?.worker?.status).toBe("running");
		expect(result?.worker?.latency).toBeUndefined();
	});

	test("captures boolean status", () => {
		const result = extractHealth({ cache: { status: true } });
		expect(result?.cache?.status).toBe(true);
	});

	test("captures numeric status code", () => {
		const result = extractHealth({ api: { status: 200, message: "OK" } });
		expect(result?.api?.status).toBe(200);
	});

	test("root-level latency without nested services", () => {
		const result = extractHealth({ latency_ms: 42 });
		expect(result?._root?.latency).toBe(42);
	});
});
