import { describe, expect, test } from "bun:test";
import { getMcpScopeGrant, getMcpScopes } from "./mcp-capabilities";

describe("MCP capabilities", () => {
	test("adds the scopes required by selected action bundles", () => {
		expect(getMcpScopes(["workspace", "flags", "links"])).toEqual([
			"read:data",
			"manage:websites",
			"manage:flags",
			"read:links",
			"write:links",
		]);
	});

	test("keeps link scopes organization-wide when analytics is website-scoped", () => {
		expect(
			getMcpScopeGrant(["workspace", "links"], ["site-a", "site-b"])
		).toEqual({
			scopes: ["read:links", "write:links"],
			resources: {
				"website:site-a": ["read:data", "manage:websites"],
				"website:site-b": ["read:data", "manage:websites"],
			},
		});
	});
});
