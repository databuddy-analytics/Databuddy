import { describe, expect, test } from "vitest";
import {
	batchBotIgnoredItem,
	batchSchemaItemFailure,
	parseEventId,
	parseProperties,
	parseTimestamp,
} from "./parsing-helpers";

// ── parseTimestamp ──

describe("parseTimestamp", () => {
	test("number → passthrough", () =>
		expect(parseTimestamp(1_700_000_000)).toBe(1_700_000_000));
	test("0 → 0", () => expect(parseTimestamp(0)).toBe(0));
	test("negative → passthrough", () => expect(parseTimestamp(-1)).toBe(-1));
	test("string → Date.now()", () => {
		const before = Date.now();
		const result = parseTimestamp("not-a-number");
		expect(result).toBeGreaterThanOrEqual(before);
		expect(result).toBeLessThanOrEqual(Date.now());
	});
	test("null → Date.now()", () => {
		const result = parseTimestamp(null);
		expect(typeof result).toBe("number");
		expect(result).toBeGreaterThan(0);
	});
	test("undefined → Date.now()", () => {
		const result = parseTimestamp(undefined);
		expect(typeof result).toBe("number");
	});
	test("object → Date.now()", () => {
		expect(typeof parseTimestamp({})).toBe("number");
	});
});

// ── parseProperties ──

describe("parseProperties", () => {
	test("object → JSON string", () =>
		expect(parseProperties({ a: 1 })).toBe('{"a":1}'));
	test("null → '{}'", () => expect(parseProperties(null)).toBe("{}"));
	test("undefined → '{}'", () => expect(parseProperties(undefined)).toBe("{}"));
	test("false → '{}'", () => expect(parseProperties(false)).toBe("{}"));
	test("0 → '{}'", () => expect(parseProperties(0)).toBe("{}"));
	test("empty string → '{}'", () => expect(parseProperties("")).toBe("{}"));
	test("non-empty string → JSON string", () =>
		expect(parseProperties("hello")).toBe('"hello"'));
	test("array → JSON array", () =>
		expect(parseProperties([1, 2])).toBe("[1,2]"));
	test("nested object", () =>
		expect(parseProperties({ a: { b: "c" } })).toBe('{"a":{"b":"c"}}'));
});

// ── parseEventId ──

describe("parseEventId", () => {
	const gen = () => "generated-uuid";

	test("valid string → passthrough", () =>
		expect(parseEventId("evt_123", gen)).toBe("evt_123"));
	test("empty string → calls generator", () =>
		expect(parseEventId("", gen)).toBe("generated-uuid"));
	test("null → calls generator", () =>
		expect(parseEventId(null, gen)).toBe("generated-uuid"));
	test("undefined → calls generator", () =>
		expect(parseEventId(undefined, gen)).toBe("generated-uuid"));
	test("number → calls generator", () =>
		expect(parseEventId(123, gen)).toBe("generated-uuid"));
	test("long string → truncated to 255", () => {
		const long = "a".repeat(300);
		const result = parseEventId(long, gen);
		expect(result.length).toBe(255);
	});
	test("generator called only when needed", () => {
		let called = false;
		parseEventId("valid", () => {
			called = true;
			return "x";
		});
		expect(called).toBe(false);
	});
});

// ── batchSchemaItemFailure ──

describe("batchSchemaItemFailure", () => {
	test("returns structured error with issues", () => {
		const issues = [{ message: "bad", path: ["x"], code: "custom" as const }];
		const result = batchSchemaItemFailure(issues as any, "track", "evt_1");
		expect(result.status).toBe("error");
		expect(result.message).toBe("Invalid event schema");
		expect(result.errors).toBe(issues);
		expect(result.eventType).toBe("track");
		expect(result.eventId).toBe("evt_1");
	});
});

// ── batchBotIgnoredItem ──

describe("batchBotIgnoredItem", () => {
	test("returns bot-ignored structure", () => {
		const result = batchBotIgnoredItem("track");
		expect(result.status).toBe("error");
		expect(result.message).toBe("Bot detected");
		expect(result.eventType).toBe("track");
		expect(result.error).toBe("ignored");
	});
});
