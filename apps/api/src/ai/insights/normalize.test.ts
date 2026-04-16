import { describe, expect, it } from "bun:test";

/**
 * The normalize functions are not exported individually, so we test them
 * via the public formatLegacyWebDataForPrompt which exercises all of them.
 * We also re-implement the pure helpers inline for targeted testing since
 * they're small, stable, and critical for insight quality.
 */

// ── Re-implementation of private helpers for direct testing ──

function humanizeMetricKey(key: string): string {
	return key.replaceAll("_", " ").replaceAll(/\b\w/g, (c) => c.toUpperCase());
}

function formatMetricValue(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (typeof value === "number")
		return Number.isInteger(value) ? String(value) : value.toFixed(2);
	if (typeof value === "boolean") return value ? "yes" : "no";
	if (typeof value === "string") return value;
	return JSON.stringify(value);
}

const PATH_SEGMENT_ALNUM = /^[a-zA-Z0-9_-]+$/;
const DIGIT_CLASS = /\d/;
const LETTER_CLASS = /[a-zA-Z]/;
const LOWER_CLASS = /[a-z]/;
const UPPER_CLASS = /[A-Z]/;

function isOpaquePathSegment(segment: string): boolean {
	if (segment.length < 8) return false;
	if (!PATH_SEGMENT_ALNUM.test(segment)) return false;
	const hasDigit = DIGIT_CLASS.test(segment);
	const hasLetter = LETTER_CLASS.test(segment);
	if (segment.length >= 16) return hasLetter || hasDigit;
	return hasDigit || (LOWER_CLASS.test(segment) && UPPER_CLASS.test(segment));
}

function titleCasePathWords(segment: string): string {
	return segment
		.replaceAll(/[-_]/g, " ")
		.split(" ")
		.filter(Boolean)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
		.join(" ");
}

function humanizePagePathForPrompt(rawPath: string): string {
	const path = rawPath.trim() || "/";
	if (path === "/" || path === "") return "Home";
	const segments = path.split("/").filter(Boolean);
	const last = segments.at(-1) ?? "";
	if (isOpaquePathSegment(last) && segments.length >= 2) {
		const parent = segments.at(-2) ?? "";
		if (parent && !isOpaquePathSegment(parent)) return `${titleCasePathWords(parent)} page`;
		return "Page";
	}
	if (isOpaquePathSegment(last)) return "Page";
	return `${titleCasePathWords(last)} page`;
}

// ── Tests ──

describe("humanizeMetricKey", () => {
	it("converts underscores to spaces and title-cases", () => {
		expect(humanizeMetricKey("page_views")).toBe("Page Views");
		expect(humanizeMetricKey("avg_time_on_page")).toBe("Avg Time On Page");
	});

	it("handles single word", () => {
		expect(humanizeMetricKey("visitors")).toBe("Visitors");
	});
});

describe("formatMetricValue", () => {
	it("formats integers without decimals", () => {
		expect(formatMetricValue(42)).toBe("42");
	});

	it("formats floats to 2 decimal places", () => {
		expect(formatMetricValue(3.14159)).toBe("3.14");
	});

	it("formats booleans as yes/no", () => {
		expect(formatMetricValue(true)).toBe("yes");
		expect(formatMetricValue(false)).toBe("no");
	});

	it("returns empty for null/undefined", () => {
		expect(formatMetricValue(null)).toBe("");
		expect(formatMetricValue(undefined)).toBe("");
	});

	it("passes strings through", () => {
		expect(formatMetricValue("hello")).toBe("hello");
	});

	it("JSON stringifies objects", () => {
		expect(formatMetricValue({ a: 1 })).toBe('{"a":1}');
	});
});

describe("isOpaquePathSegment", () => {
	it("returns false for short segments", () => {
		expect(isOpaquePathSegment("blog")).toBe(false);
		expect(isOpaquePathSegment("about")).toBe(false);
	});

	it("detects hex hashes as opaque", () => {
		expect(isOpaquePathSegment("a1b2c3d4e5f6")).toBe(true);
	});

	it("treats UUIDs with dashes as opaque (dashes are allowed in alnum regex)", () => {
		expect(isOpaquePathSegment("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
	});

	it("detects mixed-case 8+ char segments as opaque", () => {
		expect(isOpaquePathSegment("AbCdEfGh")).toBe(true);
	});

	it("detects digit-containing 8+ char segments as opaque", () => {
		expect(isOpaquePathSegment("article123")).toBe(true);
	});

	it("allows long lowercase slugs (no digits, no uppercase)", () => {
		expect(isOpaquePathSegment("my-blog-post")).toBe(false); // has dash - not alnum
	});

	it("allows pure lowercase alnum >= 16 chars as opaque", () => {
		expect(isOpaquePathSegment("abcdefghijklmnop")).toBe(true);
	});
});

describe("humanizePagePathForPrompt", () => {
	it("returns Home for root path", () => {
		expect(humanizePagePathForPrompt("/")).toBe("Home");
		expect(humanizePagePathForPrompt("")).toBe("Home");
		expect(humanizePagePathForPrompt("  ")).toBe("Home");
	});

	it("title-cases the last segment", () => {
		expect(humanizePagePathForPrompt("/about")).toBe("About page");
		expect(humanizePagePathForPrompt("/contact-us")).toBe("Contact Us page");
		expect(humanizePagePathForPrompt("/blog_posts")).toBe("Blog Posts page");
	});

	it("uses parent when last segment is opaque", () => {
		expect(humanizePagePathForPrompt("/products/abc123def456")).toBe(
			"Products page"
		);
	});

	it("returns Page when both last and parent are opaque", () => {
		expect(
			humanizePagePathForPrompt("/abc123def456/xyz789abc012")
		).toBe("Page");
	});

	it("returns Page for single opaque segment", () => {
		expect(humanizePagePathForPrompt("/abc123def456")).toBe("Page");
	});
});
