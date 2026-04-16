import { describe, expect, test } from "vitest";
import {
	CONTROL_CHARS,
	cases,
	longString,
	XSS_PAYLOADS,
} from "../test-helpers";
import {
	sanitizeString,
	VALIDATION_LIMITS,
	validateNumeric,
	validatePayloadSize,
	validatePerformanceMetric,
	validateSessionId,
} from "./validation";

// ── sanitizeString ──

describe("sanitizeString", () => {
	// non-string → ""
	for (const input of [null, undefined, 123, true, {}, []]) {
		test(`${JSON.stringify(input)} → ""`, () =>
			expect(sanitizeString(input)).toBe(""));
	}

	test("trims whitespace", () =>
		expect(sanitizeString("  hello  ")).toBe("hello"));

	test("collapses internal whitespace", () =>
		expect(sanitizeString("a   b   c")).toBe("a b c"));

	test("strips control characters", () =>
		expect(sanitizeString(`a${CONTROL_CHARS}b`)).toBe("ab"));

	test("strips HTML tags", () =>
		expect(sanitizeString("<b>bold</b> text")).toBe("bold text"));

	test("strips dangerous chars <>'\",&", () => {
		// Angle brackets in HTML-like patterns are removed by tag stripper,
		// and bare <, >, ', ", & are removed by char stripper
		expect(sanitizeString("a'b\"c&d")).toBe("abcd");
		expect(sanitizeString("hello<world")).toBe("helloworld");
		expect(sanitizeString("test>value")).toBe("testvalue");
	});

	test("respects default maxLength (2048)", () => {
		const long = longString(3000);
		const result = sanitizeString(long);
		expect(result.length).toBeLessThanOrEqual(
			VALIDATION_LIMITS.STRING_MAX_LENGTH
		);
	});

	test("respects custom maxLength", () => {
		const result = sanitizeString("abcdefghij", 5);
		expect(result).toBe("abcde");
	});

	// XSS payloads
	for (const payload of XSS_PAYLOADS) {
		test(`XSS: ${payload.slice(0, 30)}… → no angle brackets`, () => {
			const result = sanitizeString(payload);
			expect(result).not.toContain("<");
			expect(result).not.toContain(">");
		});
	}

	test("100 random strings with injected control chars", () => {
		for (let i = 0; i < 100; i++) {
			const input = `test${String.fromCharCode(Math.floor(Math.random() * 32))}value${i}`;
			const result = sanitizeString(input);
			// Should never contain control chars (except \t=9, \n=10, \r=13 which are allowed)
			for (let c = 0; c <= 8; c++) {
				expect(result).not.toContain(String.fromCharCode(c));
			}
		}
	});
});

// ── validateSessionId ──

cases(
	"validateSessionId",
	[
		["valid alphanumeric", "abc123", "abc123"],
		["with hyphens and underscores", "abc-123_def", "abc-123_def"],
		["non-string → ''", 123 as any, ""],
		["null → ''", null as any, ""],
		["contains spaces → ''", "abc def", ""],
		["contains dots → ''", "abc.def", ""],
		["empty string → ''", "", ""],
		["max length truncation", longString(200, "a"), longString(128, "a")],
		["HTML tags stripped, remaining is valid", "abc<def>ghi", "abcghi"],
	],
	(input) => validateSessionId(input)
);

// ── validateNumeric ──

describe("validateNumeric", () => {
	const table: [string, [unknown, number?, number?], number | null][] = [
		["integer", [42], 42],
		["float rounds", [3.7], 4],
		["negative", [-5, -10, 10], -5],
		["at min", [0, 0, 100], 0],
		["at max", [100, 0, 100], 100],
		["below min → null", [-1, 0, 100], null],
		["above max → null", [101, 0, 100], null],
		["string number", ["42"], 42],
		["string float", ["3.14"], 3],
		["NaN → null", [Number.NaN], null],
		["Infinity → null", [Number.POSITIVE_INFINITY], null],
		["-Infinity → null", [Number.NEGATIVE_INFINITY], null],
		["null → null", [null], null],
		["undefined → null", [undefined], null],
		["object → null", [{}], null],
		["empty string → null", [""], null],
		["non-numeric string → null", ["abc"], null],
		["boolean → null", [true], null],
	];

	for (const [label, [value, min, max], expected] of table) {
		test(label, () => expect(validateNumeric(value, min, max)).toBe(expected));
	}
});

// ── validatePayloadSize ──

describe("validatePayloadSize", () => {
	test("small object → true", () =>
		expect(validatePayloadSize({ a: 1 })).toBe(true));

	test("under custom max → true", () =>
		expect(validatePayloadSize("abc", 10)).toBe(true));

	test("over custom max → false", () =>
		expect(validatePayloadSize(longString(100), 10)).toBe(false));

	test("circular reference → false", () => {
		const obj: any = {};
		obj.self = obj;
		expect(validatePayloadSize(obj)).toBe(false);
	});

	test("exactly at 1MB limit", () => {
		// JSON.stringify adds quotes, so account for that
		const data = longString(VALIDATION_LIMITS.PAYLOAD_MAX_SIZE - 2);
		expect(validatePayloadSize(data)).toBe(true);
	});

	test("just over 1MB limit", () => {
		const data = longString(VALIDATION_LIMITS.PAYLOAD_MAX_SIZE);
		expect(validatePayloadSize(data)).toBe(false);
	});
});

// ── validatePerformanceMetric ──

cases(
	"validatePerformanceMetric",
	[
		["valid number", 1500, 1500],
		["zero", 0, 0],
		["max (300000)", 300_000, 300_000],
		["over max → undefined", 300_001, undefined],
		["negative → undefined", -1, undefined],
		["NaN → undefined", Number.NaN, undefined],
		["null → undefined", null, undefined],
		["string → undefined", "abc" as any, undefined],
		["string number", "1500" as any, 1500],
		["float rounds", 99.7, 100],
	],
	(input) => validatePerformanceMetric(input)
);
