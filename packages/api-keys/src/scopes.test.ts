import { describe, expect, test } from "bun:test";
import {
	apiKeyScopeTargetForResource,
	requiredScopesForResource,
	type ApiScope,
} from "./scopes";

const scopeRows: Array<[string, string[], ApiScope[]]> = [
	["website", ["read"], ["read:data"]],
	["website", ["view_analytics"], ["read:data"]],
	["website", ["create"], ["manage:websites"]],
	["website", ["update"], ["manage:websites"]],
	["website", ["delete"], ["manage:websites"]],
	["link", ["read"], ["read:links"]],
	["link", ["view_analytics"], ["read:links"]],
	["link", ["create", "update", "delete"], ["write:links"]],
	["flag", ["read"], ["read:data"]],
	["flag", ["create", "update", "delete"], ["manage:flags"]],
	["monitor", ["read", "view_analytics"], ["read:monitors"]],
	["monitor", ["create", "update", "delete"], ["write:monitors"]],
	["status_page", ["read", "view_analytics"], ["read:status_pages"]],
	["status_page", ["create", "update", "delete"], ["write:status_pages"]],
	["organization", ["read"], ["read:data"]],
	["organization", ["update", "delete"], ["manage:config"]],
];

describe("requiredScopesForResource", () => {
	test.each(scopeRows)(
		"%s %j requires %j",
		(resource, permissions, expected) => {
			expect(requiredScopesForResource(resource, permissions)).toEqual(expected);
		}
	);

	test("resources without overrides fall back to the default map", () => {
		expect(requiredScopesForResource("subscription", ["read"])).toEqual([
			"read:data",
		]);
		expect(requiredScopesForResource("subscription", ["update"])).toEqual([
			"manage:config",
		]);
		expect(requiredScopesForResource("subscription", ["cancel"])).toEqual([
			"manage:config",
		]);
	});

	test("an override only shadows the permissions it names", () => {
		expect(requiredScopesForResource("flag", ["read", "update"])).toEqual([
			"read:data",
			"manage:flags",
		]);
	});

	test("mixed permissions produce the deduplicated union of scopes", () => {
		expect(requiredScopesForResource("website", ["read", "update"])).toEqual([
			"read:data",
			"manage:websites",
		]);
		expect(
			requiredScopesForResource("website", ["read", "view_analytics"])
		).toEqual(["read:data"]);
	});

	test("unknown permissions map to no scopes", () => {
		expect(requiredScopesForResource("website", ["impersonate"])).toEqual([]);
	});

	test("empty permissions return no scopes", () => {
		expect(requiredScopesForResource("website", [])).toEqual([]);
	});
});

describe("apiKeyScopeTargetForResource", () => {
	test("links use global API-key scopes; everything else is website-scoped", () => {
		expect(apiKeyScopeTargetForResource("link")).toBe("global");
		expect(apiKeyScopeTargetForResource("website")).toBe("website");
		expect(apiKeyScopeTargetForResource("flag")).toBe("website");
	});
});
