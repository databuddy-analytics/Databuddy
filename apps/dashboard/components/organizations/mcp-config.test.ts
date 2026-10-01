import { describe, expect, test } from "bun:test";
import { createMcpConfig, MCP_ENV_VAR } from "./mcp-config";

describe("createMcpConfig", () => {
	test("uses the placeholder syntax each client expands", () => {
		const cursor = createMcpConfig("dbdy_test_secret", "cursor", true);
		const windsurf = createMcpConfig("dbdy_test_secret", "windsurf", true);
		const claude = createMcpConfig("dbdy_test_secret", "claude", true);

		expect(cursor).toContain(`\${env:${MCP_ENV_VAR}}`);
		expect(windsurf).toContain(`\${env:${MCP_ENV_VAR}}`);
		expect(claude).toContain(`"\${${MCP_ENV_VAR}}"`);
		for (const config of [cursor, windsurf, claude]) {
			expect(config).not.toContain("dbdy_test_secret");
		}
	});

	test("keeps the secret for clients without a known placeholder syntax", () => {
		expect(createMcpConfig("dbdy_test_secret", "other", true)).toContain(
			"dbdy_test_secret"
		);
	});
});
