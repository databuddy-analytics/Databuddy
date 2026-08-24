import { describe, expect, test } from "bun:test";
import {
	createMcpConfig,
	MCP_ENV_VAR,
	MCP_SERVER_NAME,
	MCP_SERVER_URL,
} from "./mcp-config";

describe("createMcpConfig", () => {
	test("creates a client-ready config with the one-time secret", () => {
		const config = JSON.parse(createMcpConfig("dbdy_test_secret"));

		expect(config).toEqual({
			mcpServers: {
				[MCP_SERVER_NAME]: {
					type: "http",
					url: MCP_SERVER_URL,
					headers: { "x-api-key": "dbdy_test_secret" },
				},
			},
		});
	});

	test("uses the documented environment variable placeholder", () => {
		const config = createMcpConfig("dbdy_test_secret", true);

		expect(config).toContain(`\${env:${MCP_ENV_VAR}}`);
		expect(config).not.toContain("dbdy_test_secret");
	});
});
