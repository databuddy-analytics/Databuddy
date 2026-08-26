import { describe, expect, it } from "bun:test";
import {
	categorizeReferrer,
	isInternalReferrer,
	parseReferrer,
} from "./referrer";

describe("parseReferrer", () => {
	it.each([
		["null", null],
		["undefined", undefined],
		["empty string", ""],
		["whitespace", "   "],
		["direct", "direct"],
		["(direct)", "(direct)"],
		["none", "none"],
		["Direct with casing", "  DIRECT  "],
	])("treats %s as direct", (_label, value) => {
		expect(parseReferrer(value)).toEqual({
			type: "direct",
			name: "Direct",
			url: "",
			domain: "",
		});
	});

	it("classifies a known search engine", () => {
		const result = parseReferrer("https://www.google.com/search?q=analytics");
		expect(result.type).toBe("search");
		expect(result.name).toBe("Google");
		expect(result.domain).toBe("google.com");
	});

	it("matches known referrers on subdomains of a registered domain", () => {
		expect(parseReferrer("https://l.facebook.com/l.php?u=x").name).toBe(
			"Facebook"
		);
	});

	it("strips www and lowercases the domain for unknown referrers", () => {
		expect(parseReferrer("https://WWW.SomeShop.Example/products")).toEqual({
			type: "unknown",
			name: "someshop.example",
			url: "https://WWW.SomeShop.Example/products",
			domain: "someshop.example",
		});
	});

	it("parses schemeless hostname-shaped referrers", () => {
		expect(parseReferrer("news.ycombinator.com/item?id=1").domain).toBe(
			"news.ycombinator.com"
		);
	});

	it("treats an unknown referrer with a search query param as search", () => {
		expect(
			parseReferrer("https://internal-search.example/results?q=pricing").type
		).toBe("search");
		expect(
			parseReferrer("https://internal-search.example/results?page=2").type
		).toBe("unknown");
	});

	it.each([
		["same host", "https://app.example.com/page", "app.example.com"],
		["subdomain of current domain", "https://staging.example.com/x", "example.com"],
		["current domain given as URL", "https://example.com/page", "https://example.com"],
		["localhost", "http://localhost:3000/", null],
		["loopback", "http://127.0.0.1:3000/", null],
	])("treats internal navigation as direct (%s)", (_label, url, domain) => {
		const result = parseReferrer(url, domain);
		expect(result.type).toBe("direct");
		expect(result.url).toBe(url);
	});

	it("does not treat lookalike domains as internal", () => {
		expect(parseReferrer("https://notexample.com/page", "example.com").type).toBe(
			"unknown"
		);
	});

	it("labels unparseable non-URL values as unknown with the raw value", () => {
		expect(parseReferrer("some android app")).toEqual({
			type: "unknown",
			name: "some android app",
			url: "some android app",
			domain: "",
		});
	});

	it("falls back to direct for protocol values that cannot be parsed", () => {
		expect(parseReferrer("https://exa mple.com/x").type).toBe("direct");
	});
});

describe("categorizeReferrer", () => {
	it.each([
		["search", "Search Engine"],
		["social", "Social Media"],
		["email", "Email"],
		["ads", "Advertising"],
		["ai", "AI"],
		["direct", "Direct"],
		["unknown", "Other"],
		["anything-else", "Other"],
	])("maps %s to %s", (type, label) => {
		expect(
			categorizeReferrer({ type, name: "", url: "", domain: "" })
		).toBe(label);
	});
});

describe("isInternalReferrer", () => {
	it("flags same-site and subdomain referrers", () => {
		expect(
			isInternalReferrer("https://example.com/page", "example.com")
		).toBe(true);
		expect(
			isInternalReferrer("https://app.example.com/page", "example.com")
		).toBe(true);
		expect(isInternalReferrer("http://localhost:3000/")).toBe(true);
	});

	it("does not flag external or direct referrers", () => {
		expect(isInternalReferrer("https://google.com", "example.com")).toBe(false);
		expect(isInternalReferrer("direct", "example.com")).toBe(false);
		expect(isInternalReferrer("", "example.com")).toBe(false);
		expect(isInternalReferrer("not a url", "example.com")).toBe(false);
	});
});
