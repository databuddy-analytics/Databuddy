import { describe, expect, it } from "bun:test";
import {
	filterSafeHeaders,
	parseDurationToSeconds,
	sanitizeString,
	validateExitIntent,
	validateInteractionCount,
	validateLanguage,
	validateNumeric,
	validatePageCount,
	validatePayloadSize,
	validatePerformanceMetric,
	validateProperties,
	validateScreenResolution,
	validateScrollDepth,
	validateSessionId,
	validateTimezone,
	validateTimezoneOffset,
	validateUrl,
	validateUtmParameter,
	validateViewportSize,
} from "./utilities";

describe("parseDurationToSeconds", () => {
	it.each([
		["30s", 30],
		["5m", 300],
		["2h", 7200],
		["1d", 86_400],
		["0s", 0],
	])("parses %s to %d seconds", (duration, seconds) => {
		expect(parseDurationToSeconds(duration)).toBe(seconds);
	});

	it.each([["abc"], ["100"], ["5w"], ["-5m"], ["1.5h"], [""]])(
		"throws on invalid duration %j",
		(duration) => {
			expect(() => parseDurationToSeconds(duration)).toThrow("Invalid duration");
		}
	);
});

describe("sanitizeString", () => {
	it.each([
		["null", null],
		["number", 123],
		["undefined", undefined],
		["object", {}],
	])("returns empty for %s input", (_label, value) => {
		expect(sanitizeString(value)).toBe("");
	});

	it("trims and collapses whitespace", () => {
		expect(sanitizeString("  hello   world  ")).toBe("hello world");
		expect(sanitizeString("a\tb\nc")).toBe("a b c");
	});

	it("strips control characters", () => {
		expect(sanitizeString("hello\x00world")).toBe("helloworld");
		expect(sanitizeString("test\x7Fvalue")).toBe("testvalue");
	});

	it("strips HTML tags and their contents markers", () => {
		expect(sanitizeString("<script>alert('xss')</script>")).toBe("alert(xss)");
	});

	it("truncates to maxLength before filtering", () => {
		expect(sanitizeString("abcdefghij", 5)).toBe("abcde");
	});

	it("defaults to 2048 max length", () => {
		expect(sanitizeString("a".repeat(3000)).length).toBe(2048);
	});
});

describe("validateTimezone", () => {
	it.each([["America/New_York"], ["UTC"], ["Europe/London"]])(
		"accepts %s",
		(timezone) => {
			expect(validateTimezone(timezone)).toBe(timezone);
		}
	);

	it.each([
		["number", 123],
		["null", null],
		["invalid characters", "foo bar!@#"],
		["unknown IANA name", "Etc/Unknown"],
		["fabricated IANA name", "America/Fakecity"],
		["SQL injection", "UTC') UNION ALL SELECT 1--"],
		["SQL injection with drop", "UTC'; DROP TABLE events;--"],
		["SQL tautology", "' OR 1=1--"],
	])("rejects %s", (_label, timezone) => {
		expect(validateTimezone(timezone)).toBe("");
	});
});

describe("validateTimezoneOffset", () => {
	it.each([
		[-720, -720],
		[-300, -300],
		[0, 0],
		[330, 330],
		[840, 840],
		[60.7, 61],
	])("accepts %d as %d", (offset, expected) => {
		expect(validateTimezoneOffset(offset)).toBe(expected);
	});

	it.each([
		["below range", -721],
		["above range", 841],
		["far out of range", 1000],
		["NaN", Number.NaN],
		["Infinity", Number.POSITIVE_INFINITY],
		["string", "60"],
		["null", null],
	])("rejects %s", (_label, offset) => {
		expect(validateTimezoneOffset(offset)).toBeNull();
	});
});

describe("validateLanguage", () => {
	it.each([
		["en", "en"],
		["en-US", "en-us"],
		["zh-Hans", "zh-hans"],
	])("accepts %s lowercased as %s", (language, expected) => {
		expect(validateLanguage(language)).toBe(expected);
	});

	it.each([
		["too short", "a"],
		["number", 42],
		["injection", "en;DROP"],
	])("rejects %s", (_label, language) => {
		expect(validateLanguage(language)).toBe("");
	});
});

describe("validateSessionId", () => {
	it("accepts alphanumeric ids with dashes and underscores", () => {
		expect(validateSessionId("abc-123_XYZ")).toBe("abc-123_XYZ");
	});

	it.each([
		["null", null],
		["special characters", "abc;DROP TABLE"],
		["empty", ""],
		["whitespace", "abc 123"],
	])("rejects %s", (_label, sessionId) => {
		expect(validateSessionId(sessionId)).toBe("");
	});
});

describe("validateUtmParameter", () => {
	it("sanitizes and truncates to 512 characters", () => {
		expect(validateUtmParameter(" spring_sale ")).toBe("spring_sale");
		expect(validateUtmParameter("<b>ads</b>")).toBe("ads");
		expect(validateUtmParameter("x".repeat(600)).length).toBe(512);
	});

	it("returns empty for non-strings", () => {
		expect(validateUtmParameter(42)).toBe("");
		expect(validateUtmParameter(null)).toBe("");
	});
});

describe("validateNumeric", () => {
	it.each([
		["in range", 42, 42],
		["at min", 0, 0],
		["rounded float", 3.7, 4],
		["numeric string", "42", 42],
		["float string rounded", "3.14", 3],
	])("accepts %s", (_label, value, expected) => {
		expect(validateNumeric(value)).toBe(expected);
	});

	it("enforces inclusive bounds", () => {
		expect(validateNumeric(0, 0, 100)).toBe(0);
		expect(validateNumeric(100, 0, 100)).toBe(100);
		expect(validateNumeric(-1, 0, 100)).toBeNull();
		expect(validateNumeric(101, 0, 100)).toBeNull();
	});

	it("checks bounds after rounding", () => {
		expect(validateNumeric(100.4, 0, 100)).toBe(100);
		expect(validateNumeric(100.6, 0, 100)).toBeNull();
	});

	it.each([
		["NaN", Number.NaN],
		["Infinity", Number.POSITIVE_INFINITY],
		["non-numeric string", "abc"],
		["null", null],
		["boolean", true],
	])("rejects %s", (_label, value) => {
		expect(validateNumeric(value)).toBeNull();
	});
});

describe("validateUrl", () => {
	it("accepts and normalizes http/https URLs", () => {
		expect(validateUrl("https://example.com")).toBe("https://example.com/");
		expect(validateUrl("http://localhost:3000/path")).toBe(
			"http://localhost:3000/path"
		);
	});

	it.each([
		["ftp", "ftp://example.com"],
		["javascript", "javascript:alert(1)"],
		["null", null],
		["number", 123],
		["not a url", "not a url"],
	])("rejects %s", (_label, url) => {
		expect(validateUrl(url)).toBe("");
	});
});

describe("filterSafeHeaders", () => {
	it("keeps only safe headers with lowercased keys", () => {
		expect(
			filterSafeHeaders({
				"User-Agent": "Mozilla/5.0",
				Authorization: "Bearer secret",
				Cookie: "session=abc",
				Referer: "https://example.com",
			})
		).toEqual({
			"user-agent": "Mozilla/5.0",
			referer: "https://example.com",
		});
	});

	it("takes the first value of array headers", () => {
		expect(
			filterSafeHeaders({ "X-Forwarded-For": ["1.2.3.4", "5.6.7.8"] })
		).toEqual({ "x-forwarded-for": "1.2.3.4" });
	});

	it("skips undefined and empty values", () => {
		expect(filterSafeHeaders({ "user-agent": undefined, referer: "" })).toEqual(
			{}
		);
	});
});

describe("validateProperties", () => {
	it("keeps string, number, boolean, and null values", () => {
		expect(
			validateProperties({ plan: "pro", count: 5, active: true, removed: null })
		).toEqual({ plan: "pro", count: 5, active: true, removed: null });
	});

	it("strips non-primitive values", () => {
		expect(
			validateProperties({ nested: { a: 1 }, arr: [1, 2], fn: () => 1 })
		).toEqual({});
	});

	it("limits to 100 properties", () => {
		const props = Object.fromEntries(
			Array.from({ length: 150 }, (_, i) => [`key${i}`, "v"])
		);
		expect(Object.keys(validateProperties(props))).toHaveLength(100);
	});

	it.each([
		["null", null],
		["string", "string"],
		["array", [1, 2]],
	])("returns empty for %s", (_label, value) => {
		expect(validateProperties(value)).toEqual({});
	});
});

describe("validatePayloadSize", () => {
	it("accepts payloads within the limit", () => {
		expect(validatePayloadSize({ key: "value" })).toBe(true);
	});

	it("rejects oversized payloads", () => {
		expect(validatePayloadSize({ data: "x".repeat(2_000_000) })).toBe(false);
	});

	it("uses a custom max size", () => {
		expect(validatePayloadSize({ a: "b" }, 5)).toBe(false);
	});

	it("rejects unserializable payloads", () => {
		const circular: Record<string, unknown> = {};
		circular.self = circular;
		expect(validatePayloadSize(circular)).toBe(false);
	});
});

describe("range validators", () => {
	it("validateScrollDepth accepts 0-100", () => {
		expect(validateScrollDepth(0)).toBe(0);
		expect(validateScrollDepth(100)).toBe(100);
		expect(validateScrollDepth(-1)).toBeNull();
		expect(validateScrollDepth(101)).toBeNull();
	});

	it("validatePageCount accepts 1-10000", () => {
		expect(validatePageCount(1)).toBe(1);
		expect(validatePageCount(10_000)).toBe(10_000);
		expect(validatePageCount(0)).toBeNull();
		expect(validatePageCount(10_001)).toBeNull();
	});

	it("validateInteractionCount accepts 0-100000", () => {
		expect(validateInteractionCount(0)).toBe(0);
		expect(validateInteractionCount(100_000)).toBe(100_000);
		expect(validateInteractionCount(100_001)).toBeNull();
	});

	it("validatePerformanceMetric accepts 0-300000 and hides misses as undefined", () => {
		expect(validatePerformanceMetric(1500)).toBe(1500);
		expect(validatePerformanceMetric(300_000)).toBe(300_000);
		expect(validatePerformanceMetric(-1)).toBeUndefined();
		expect(validatePerformanceMetric(300_001)).toBeUndefined();
	});
});

describe("resolution validators", () => {
	it("accept WIDTHxHEIGHT strings", () => {
		expect(validateScreenResolution("1920x1080")).toBe("1920x1080");
		expect(validateViewportSize("1200x800")).toBe("1200x800");
	});

	it.each([
		["free text", "not-a-res"],
		["number", 123],
		["missing side", "1920x"],
		["negative", "-1x100"],
	])("reject %s", (_label, resolution) => {
		expect(validateScreenResolution(resolution)).toBe("");
	});
});

describe("validateExitIntent", () => {
	it("passes through 0 and 1", () => {
		expect(validateExitIntent(1)).toBe(1);
		expect(validateExitIntent(0)).toBe(0);
	});

	it("parses numeric strings like other numeric fields", () => {
		expect(validateExitIntent("1")).toBe(1);
	});

	it.each([
		["null", null],
		["out of range", 5],
		["non-numeric string", "yes"],
	])("defaults to 0 for %s", (_label, intent) => {
		expect(validateExitIntent(intent)).toBe(0);
	});
});

describe("sanitizeString tag stripping", () => {
	it.each([
		["<scr<script>ipt>alert(1)</script>", "iptalert(1)"],
		["<b>hi</b>", "hi"],
		["<img src=x onerror=alert(1)>", ""],
		["plain text", "plain text"],
	])("strips nested tags from %s", (input, expected) => {
		expect(sanitizeString(input)).toBe(expected);
	});
});
