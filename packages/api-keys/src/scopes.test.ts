import { describe, expect, test } from "bun:test";
import { requiredScopesForResource, LINKS_SCOPE_MAP } from "./scopes";

describe("requiredScopesForResource", () => {
	test("website read requires read:data", () => {
		expect(requiredScopesForResource("website", ["read"])).toEqual(["read:data"]);
	});
	test("website view_analytics requires read:data", () => {
		expect(requiredScopesForResource("website", ["view_analytics"])).toEqual(["read:data"]);
	});
	test("website create requires manage:websites", () => {
		expect(requiredScopesForResource("website", ["create"])).toEqual(["manage:websites"]);
	});
	test("website update requires manage:websites", () => {
		expect(requiredScopesForResource("website", ["update"])).toEqual(["manage:websites"]);
	});
	test("website delete requires manage:websites", () => {
		expect(requiredScopesForResource("website", ["delete"])).toEqual(["manage:websites"]);
	});
	test("website read+update requires both scopes", () => {
		const scopes = requiredScopesForResource("website", ["read", "update"]);
		expect(scopes).toContain("read:data");
		expect(scopes).toContain("manage:websites");
		expect(scopes).toHaveLength(2);
	});
	test("organization read requires read:data", () => {
		expect(requiredScopesForResource("organization", ["read"])).toEqual(["read:data"]);
	});
	test("organization update requires manage:config", () => {
		expect(requiredScopesForResource("organization", ["update"])).toEqual(["manage:config"]);
	});
	test("unknown resource falls back to default mapping", () => {
		expect(requiredScopesForResource("subscription", ["read"])).toEqual(["read:data"]);
		expect(requiredScopesForResource("subscription", ["update"])).toEqual(["manage:config"]);
	});
	test("empty permissions returns empty array", () => {
		expect(requiredScopesForResource("website", [])).toEqual([]);
	});
	test("deduplicates scopes", () => {
		const scopes = requiredScopesForResource("website", ["read", "view_analytics"]);
		expect(scopes).toEqual(["read:data"]);
	});
});

describe("LINKS_SCOPE_MAP", () => {
	test("read maps to read:links", () => {
		expect(LINKS_SCOPE_MAP.read).toBe("read:links");
	});
	test("create maps to write:links", () => {
		expect(LINKS_SCOPE_MAP.create).toBe("write:links");
	});
});
