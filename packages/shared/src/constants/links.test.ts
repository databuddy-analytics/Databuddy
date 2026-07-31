import { describe, expect, test } from "bun:test";
import {
	isHttpUrl,
	LINK_SLUG_REGEX,
	PUBLIC_LINK_SLUG_REGEX,
} from "./links";

describe("link constants", () => {
	test("accepts only absolute HTTP(S) URLs", () => {
		for (const value of ["https://example.com", "http://example.com/path"]) {
			expect(isHttpUrl(value)).toBe(true);
		}
		for (const value of [null, "", "//example.com", "javascript:alert(1)"]) {
			expect(isHttpUrl(value)).toBe(false);
		}
	});

	test("keeps public link slug constraints aligned", () => {
		expect(LINK_SLUG_REGEX.test("link_123-A")).toBe(true);
		expect(LINK_SLUG_REGEX.test("bad/slug")).toBe(false);
		expect(PUBLIC_LINK_SLUG_REGEX.test("abc")).toBe(true);
		expect(PUBLIC_LINK_SLUG_REGEX.test("ab")).toBe(false);
		expect(PUBLIC_LINK_SLUG_REGEX.test("a".repeat(51))).toBe(false);
	});
});
