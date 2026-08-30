import { describe, expect, test } from "vitest";
import { cases, longString } from "../test-helpers";
import {
	redactSensitiveQueryParams,
	sanitizeString,
	sanitizeUrl,
	VALIDATION_LIMITS,
	validateNumeric,
	validatePayloadSize,
	validatePerformanceMetric,
	validateSessionId,
} from "./validation";

describe("sanitizeString", () => {
	test("trims whitespace", () =>
		expect(sanitizeString("  hello  ")).toBe("hello"));

	test("collapses internal whitespace", () =>
		expect(sanitizeString("a   b   c")).toBe("a b c"));

	test("strips HTML tags", () =>
		expect(sanitizeString("<b>bold</b> text")).toBe("bold text"));

	test("strips dangerous chars <>'\",&", () => {
		expect(sanitizeString("a'b\"c&d")).toBe("abcd");
		expect(sanitizeString("hello<world")).toBe("helloworld");
		expect(sanitizeString("test>value")).toBe("testvalue");
	});

	test("defeats stacked-tag bypasses that reassemble after one strip pass", () => {
		const result = sanitizeString("<scr<script>ipt>alert(1)</scr</script>ipt>");
		expect(result).toBe("iptalert(1)ipt");
		expect(result.toLowerCase()).not.toContain("<script");
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

	test("strips every disallowed control char while keeping tab/newline/return", () => {
		for (let code = 0; code <= 31; code++) {
			const char = String.fromCharCode(code);
			const result = sanitizeString(`a${char}b`);
			if (code === 9 || code === 10 || code === 13) {
				expect(result).toBe("a b");
			} else {
				expect(result).toBe("ab");
			}
		}
	});
});

describe("redactSensitiveQueryParams", () => {
	const table: [string, string, string][] = [
		[
			"password redacted",
			"https://a.com/login?email=x%40y.com&password=hunter2",
			"https://a.com/login?email=REDACTED&password=REDACTED",
		],
		[
			"case-insensitive param names",
			"/login?Email=x%40y.com&PASSWORD=abc",
			"/login?Email=REDACTED&PASSWORD=REDACTED",
		],
		[
			"safe params untouched",
			"/pricing?utm_source=x&plan=pro",
			"/pricing?utm_source=x&plan=pro",
		],
		["no query string untouched", "/login", "/login"],
		[
			"token and api_key redacted",
			"/cb?token=abc&api_key=k123&page=2",
			"/cb?token=REDACTED&api_key=REDACTED&page=2",
		],
		[
			"oauth fragment redacted",
			"/cb#access_token=abc&state=xyz",
			"/cb#access_token=REDACTED&state=xyz",
		],
		["plain fragment untouched", "/docs?page=1#install", "/docs?page=1#install"],
		[
			"query and fragment redacted independently",
			"/cb?token=abc&page=2#access_token=xyz&state=ok",
			"/cb?token=REDACTED&page=2#access_token=REDACTED&state=ok",
		],
		[
			"relative path with otp",
			"/verify?otp=123456",
			"/verify?otp=REDACTED",
		],
		["empty string", "", ""],
	];

	for (const [label, input, expected] of table) {
		test(label, () =>
			expect(redactSensitiveQueryParams(input)).toBe(expected));
	}
});

describe("sanitizeUrl", () => {
	test("non-string → ''", () => expect(sanitizeUrl(123)).toBe(""));

	test("redacts before sanitizing", () => {
		const result = sanitizeUrl(
			"https://a.com/login?email=x%40y.com&password=hunter2"
		);
		expect(result).not.toContain("hunter2");
		expect(result).not.toContain("x@y.com");
		expect(result).toContain("REDACTED");
	});

	test("applies sanitizeString rules", () =>
		expect(sanitizeUrl("/a<script>b</script>?q=1")).toBe("/ab?q=1"));

	test("respects maxLength", () =>
		expect(sanitizeUrl("/abcdefghij", 5)).toBe("/abcd"));
});

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

	test("string whose serialized form is exactly at the 1MB limit", () => {
		const data = longString(VALIDATION_LIMITS.PAYLOAD_MAX_SIZE - 2);
		expect(validatePayloadSize(data)).toBe(true);
	});

	test("just over 1MB limit", () => {
		const data = longString(VALIDATION_LIMITS.PAYLOAD_MAX_SIZE);
		expect(validatePayloadSize(data)).toBe(false);
	});
});

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
