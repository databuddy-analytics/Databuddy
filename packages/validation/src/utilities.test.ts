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
	validateViewportSize,
} from "./utilities";

describe("parseDurationToSeconds", () => {
	it("parses seconds", () => expect(parseDurationToSeconds("30s")).toBe(30));
	it("parses minutes", () => expect(parseDurationToSeconds("5m")).toBe(300));
	it("parses hours", () => expect(parseDurationToSeconds("2h")).toBe(7200));
	it("parses days", () => expect(parseDurationToSeconds("1d")).toBe(86400));
	it("throws on invalid format", () => {
		expect(() => parseDurationToSeconds("abc")).toThrow("Invalid duration");
	});
	it("throws on missing unit", () => {
		expect(() => parseDurationToSeconds("100")).toThrow("Invalid duration");
	});
});

describe("sanitizeString", () => {
	it("returns empty for non-strings", () => {
		expect(sanitizeString(null)).toBe("");
		expect(sanitizeString(123)).toBe("");
		expect(sanitizeString(undefined)).toBe("");
	});

	it("trims and normalizes whitespace", () => {
		expect(sanitizeString("  hello   world  ")).toBe("hello world");
	});

	it("strips control characters", () => {
		expect(sanitizeString("hello\x00world")).toBe("helloworld");
		expect(sanitizeString("test\x7Fvalue")).toBe("testvalue");
	});

	it("strips HTML-sensitive characters", () => {
		expect(sanitizeString("<script>alert('xss')</script>")).toBe(
			"scriptalert(xss)/script"
		);
	});

	it("truncates to maxLength", () => {
		expect(sanitizeString("abcdefghij", 5)).toBe("abcde");
	});

	it("defaults to 2048 max length", () => {
		const long = "a".repeat(3000);
		expect(sanitizeString(long).length).toBe(2048);
	});
});

describe("validateTimezone", () => {
	it("accepts valid timezones", () => {
		expect(validateTimezone("America/New_York")).toBe("America/New_York");
		expect(validateTimezone("UTC")).toBe("UTC");
		expect(validateTimezone("Europe/London")).toBe("Europe/London");
	});

	it("rejects non-strings", () => {
		expect(validateTimezone(123)).toBe("");
		expect(validateTimezone(null)).toBe("");
	});

	it("rejects invalid formats", () => {
		expect(validateTimezone("foo bar!@#")).toBe("");
	});
});

describe("validateTimezoneOffset", () => {
	it("accepts valid offsets", () => {
		expect(validateTimezoneOffset(-300)).toBe(-300);
		expect(validateTimezoneOffset(0)).toBe(0);
		expect(validateTimezoneOffset(330)).toBe(330);
	});

	it("rounds fractional offsets", () => {
		expect(validateTimezoneOffset(60.7)).toBe(61);
	});

	it("rejects out-of-range", () => {
		expect(validateTimezoneOffset(-1000)).toBeNull();
		expect(validateTimezoneOffset(1000)).toBeNull();
	});

	it("rejects non-numbers", () => {
		expect(validateTimezoneOffset("foo")).toBeNull();
		expect(validateTimezoneOffset(null)).toBeNull();
	});
});

describe("validateLanguage", () => {
	it("accepts valid language codes (lowercased)", () => {
		expect(validateLanguage("en")).toBe("en");
		expect(validateLanguage("en-US")).toBe("en-us");
		expect(validateLanguage("zh-Hans")).toBe("zh-hans");
	});

	it("rejects invalid", () => {
		expect(validateLanguage("a")).toBe("");
		expect(validateLanguage(42)).toBe("");
	});
});

describe("validateSessionId", () => {
	it("accepts alphanumeric with dashes/underscores", () => {
		expect(validateSessionId("abc-123_XYZ")).toBe("abc-123_XYZ");
	});

	it("rejects non-strings", () => {
		expect(validateSessionId(null)).toBe("");
	});

	it("rejects special characters", () => {
		expect(validateSessionId("abc;DROP TABLE")).toBe("");
	});
});

describe("validateNumeric", () => {
	it("accepts numbers in range", () => {
		expect(validateNumeric(42)).toBe(42);
		expect(validateNumeric(0, 0, 100)).toBe(0);
		expect(validateNumeric(100, 0, 100)).toBe(100);
	});

	it("rounds floats", () => {
		expect(validateNumeric(3.7)).toBe(4);
	});

	it("rejects out of range", () => {
		expect(validateNumeric(-1, 0, 100)).toBeNull();
		expect(validateNumeric(101, 0, 100)).toBeNull();
	});

	it("rejects NaN and Infinity", () => {
		expect(validateNumeric(Number.NaN)).toBeNull();
		expect(validateNumeric(Number.POSITIVE_INFINITY)).toBeNull();
	});

	it("parses numeric strings", () => {
		expect(validateNumeric("42")).toBe(42);
		expect(validateNumeric("3.14")).toBe(3);
	});

	it("rejects non-numeric strings", () => {
		expect(validateNumeric("abc")).toBeNull();
	});
});

describe("validateUrl", () => {
	it("accepts valid http/https URLs", () => {
		expect(validateUrl("https://example.com")).toBe("https://example.com/");
		expect(validateUrl("http://localhost:3000/path")).toBe(
			"http://localhost:3000/path"
		);
	});

	it("rejects non-http protocols", () => {
		expect(validateUrl("ftp://example.com")).toBe("");
		expect(validateUrl("javascript:alert(1)")).toBe("");
	});

	it("rejects non-strings", () => {
		expect(validateUrl(null)).toBe("");
		expect(validateUrl(123)).toBe("");
	});

	it("rejects invalid URLs", () => {
		expect(validateUrl("not a url")).toBe("");
	});
});

describe("filterSafeHeaders", () => {
	it("keeps only safe headers (lowercased keys)", () => {
		const result = filterSafeHeaders({
			"User-Agent": "Mozilla/5.0",
			Authorization: "Bearer secret",
			Referer: "https://example.com",
		});
		expect(result).toEqual({
			"user-agent": "Mozilla/5.0",
			referer: "https://example.com",
		});
		expect(result).not.toHaveProperty("authorization");
	});

	it("handles array values (takes first)", () => {
		const result = filterSafeHeaders({
			"X-Forwarded-For": ["1.2.3.4", "5.6.7.8"],
		});
		expect(result["x-forwarded-for"]).toBe("1.2.3.4");
	});

	it("skips undefined values", () => {
		const result = filterSafeHeaders({ "user-agent": undefined });
		expect(result).toEqual({});
	});
});

describe("validateProperties", () => {
	it("validates string, number, boolean, null values", () => {
		const result = validateProperties({
			plan: "pro",
			count: 5,
			active: true,
			removed: null,
		});
		expect(result).toEqual({ plan: "pro", count: 5, active: true, removed: null });
	});

	it("strips non-primitive values", () => {
		const result = validateProperties({
			nested: { a: 1 },
			arr: [1, 2],
			fn: () => {},
		});
		expect(Object.keys(result)).toHaveLength(0);
	});

	it("limits to 100 properties", () => {
		const props: Record<string, string> = {};
		for (let i = 0; i < 150; i++) props[`key${i}`] = "v";
		const result = validateProperties(props);
		expect(Object.keys(result)).toHaveLength(100);
	});

	it("returns empty for non-objects", () => {
		expect(validateProperties(null)).toEqual({});
		expect(validateProperties("string")).toEqual({});
		expect(validateProperties([1, 2])).toEqual({});
	});
});

describe("validatePayloadSize", () => {
	it("accepts small payloads", () => {
		expect(validatePayloadSize({ key: "value" })).toBe(true);
	});

	it("rejects oversized payloads", () => {
		const big = { data: "x".repeat(2_000_000) };
		expect(validatePayloadSize(big)).toBe(false);
	});

	it("uses custom max size", () => {
		expect(validatePayloadSize({ a: "b" }, 5)).toBe(false);
	});

	it("returns false for circular references", () => {
		const obj: Record<string, unknown> = {};
		obj.self = obj;
		expect(validatePayloadSize(obj)).toBe(false);
	});
});

describe("validateScrollDepth", () => {
	it("accepts 0-100", () => {
		expect(validateScrollDepth(0)).toBe(0);
		expect(validateScrollDepth(50)).toBe(50);
		expect(validateScrollDepth(100)).toBe(100);
	});
	it("rejects out of range", () => {
		expect(validateScrollDepth(-1)).toBeNull();
		expect(validateScrollDepth(101)).toBeNull();
	});
});

describe("validateScreenResolution", () => {
	it("accepts valid formats", () => {
		expect(validateScreenResolution("1920x1080")).toBe("1920x1080");
	});
	it("rejects invalid", () => {
		expect(validateScreenResolution("not-a-res")).toBe("");
		expect(validateScreenResolution(123)).toBe("");
	});
});

describe("validateViewportSize", () => {
	it("delegates to validateScreenResolution", () => {
		expect(validateViewportSize("1200x800")).toBe("1200x800");
	});
});

describe("validatePerformanceMetric", () => {
	it("accepts valid metrics (0-300000)", () => {
		expect(validatePerformanceMetric(1500)).toBe(1500);
	});
	it("rejects negatives", () => {
		expect(validatePerformanceMetric(-1)).toBeNull();
	});
});

describe("validatePageCount", () => {
	it("accepts 1-10000", () => {
		expect(validatePageCount(1)).toBe(1);
		expect(validatePageCount(500)).toBe(500);
	});
	it("rejects 0", () => {
		expect(validatePageCount(0)).toBeNull();
	});
});

describe("validateInteractionCount", () => {
	it("accepts 0-100000", () => {
		expect(validateInteractionCount(0)).toBe(0);
	});
});

describe("validateExitIntent", () => {
	it("returns 0 or 1", () => {
		expect(validateExitIntent(1)).toBe(1);
		expect(validateExitIntent(0)).toBe(0);
	});
	it("returns 0 for invalid", () => {
		expect(validateExitIntent(null)).toBe(0);
		expect(validateExitIntent(5)).toBe(0);
	});
});
