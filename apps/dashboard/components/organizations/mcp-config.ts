import { publicConfig } from "@databuddy/env/public";

const MCP_SERVER_NAME = "databuddy";
export const MCP_ENV_VAR = "DATABUDDY_API_KEY";
export const MCP_SERVER_URL = publicConfig.urls.mcp;

export type McpClient = "cursor" | "claude" | "windsurf" | "other";

export const MCP_ENV_VAR_REFERENCES: Partial<Record<McpClient, string>> = {
	claude: `\${${MCP_ENV_VAR}}`,
	cursor: `\${env:${MCP_ENV_VAR}}`,
	windsurf: `\${env:${MCP_ENV_VAR}}`,
};

export function createMcpConfig(
	secret: string,
	client: McpClient,
	useEnvironmentVariable: boolean
) {
	return JSON.stringify(
		{
			mcpServers: {
				[MCP_SERVER_NAME]: {
					type: "http",
					url: MCP_SERVER_URL,
					headers: {
						"x-api-key": useEnvironmentVariable
							? (MCP_ENV_VAR_REFERENCES[client] ?? secret)
							: secret,
					},
				},
			},
		},
		null,
		2
	);
}
