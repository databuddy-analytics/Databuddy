import { describe, expect, test } from "bun:test";
import { appendRef } from "./url";

describe("appendRef", () => {
	test("adds ref to URLs without existing query params", () => {
		expect(appendRef("https://example.com/path", "link_123")).toBe(
			"https://example.com/path?ref=link_123"
		);
	});

	test("preserves existing query params", () => {
		expect(appendRef("https://example.com/path?utm_source=x", "link_123")).toBe(
			"https://example.com/path?utm_source=x&ref=link_123"
		);
	});

	test("preserves hash fragments after the query string", () => {
		expect(appendRef("https://example.com/path#section", "link_123")).toBe(
			"https://example.com/path?ref=link_123#section"
		);
	});

	test("replaces an existing ref value", () => {
		expect(appendRef("https://example.com/path?ref=old", "new/link")).toBe(
			"https://example.com/path?ref=new%2Flink"
		);
	});
});
