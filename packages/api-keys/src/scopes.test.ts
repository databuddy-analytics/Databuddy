import { describe, expect, test } from "bun:test";
import { requiredScopesForResource } from "./scopes";

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

describe("flag resource scopes", () => {
	test("read requires read:data", () => {
		expect(requiredScopesForResource("flag", ["read"])).toEqual(["read:data"]);
	});
	test("create, update, delete require manage:flags", () => {
		expect(
			requiredScopesForResource("flag", ["create", "update", "delete"])
		).toEqual(["manage:flags"]);
	});
});

describe("link resource scopes", () => {
	test("read requires read:links", () => {
		expect(requiredScopesForResource("link", ["read"])).toEqual([
			"read:links",
		]);
	});
	test("view_analytics requires read:links", () => {
		expect(requiredScopesForResource("link", ["view_analytics"])).toEqual([
			"read:links",
		]);
	});
	test("create, update, delete require write:links", () => {
		expect(
			requiredScopesForResource("link", ["create", "update", "delete"])
		).toEqual(["write:links"]);
	});
});

describe("monitor resource scopes", () => {
	test("read and view_analytics require read:monitors", () => {
		expect(requiredScopesForResource("monitor", ["read"])).toEqual([
			"read:monitors",
		]);
		expect(requiredScopesForResource("monitor", ["view_analytics"])).toEqual([
			"read:monitors",
		]);
	});

	test("create, update, delete require write:monitors", () => {
		expect(
			requiredScopesForResource("monitor", ["create", "update", "delete"])
		).toEqual(["write:monitors"]);
	});
});

describe("status page resource scopes", () => {
	test("read and view_analytics require read:status_pages", () => {
		expect(requiredScopesForResource("status_page", ["read"])).toEqual([
			"read:status_pages",
		]);
		expect(
			requiredScopesForResource("status_page", ["view_analytics"])
		).toEqual(["read:status_pages"]);
	});

	test("create, update, delete require write:status_pages", () => {
		expect(
			requiredScopesForResource("status_page", [
				"create",
				"update",
				"delete",
			])
		).toEqual(["write:status_pages"]);
	});
});
