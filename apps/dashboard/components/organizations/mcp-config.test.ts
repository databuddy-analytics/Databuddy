import { describe, expect, test } from "bun:test";
import { createMcpConfig, MCP_ENV_VAR } from "./mcp-config";

describe("createMcpConfig", () => {
	test("uses the documented environment variable placeholder", () => {
		const config = createMcpConfig("dbdy_test_secret", true);

		expect(config).toContain(`\${env:${MCP_ENV_VAR}}`);
		expect(config).not.toContain("dbdy_test_secret");
	});
});
