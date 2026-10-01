import { publicConfig } from "@databuddy/env/public";

const MCP_SERVER_NAME = "databuddy";
export const MCP_ENV_VAR = "DATABUDDY_API_KEY";
export const MCP_SERVER_URL = publicConfig.urls.mcp;

export type McpClient = "cursor" | "claude" | "windsurf" | "other";

const MCP_ENV_VAR_REFERENCES: Partial<Record<McpClient, string>> = {
	claude: `\${${MCP_ENV_VAR}}`,
	cursor: `\${env:${MCP_ENV_VAR}}`,
	windsurf: `\${env:${MCP_ENV_VAR}}`,
};

export function mcpEnvVarReference(client: McpClient): string | undefined {
	return MCP_ENV_VAR_REFERENCES[client];
}

export function createMcpConfig(
	secret: string,
	client: McpClient,
	useEnvironmentVariable = false
) {
	const envVarReference = useEnvironmentVariable
		? mcpEnvVarReference(client)
		: undefined;

	return JSON.stringify(
		{
			mcpServers: {
				[MCP_SERVER_NAME]: {
					type: "http",
					url: MCP_SERVER_URL,
					headers: {
						"x-api-key": envVarReference ?? secret,
					},
				},
			},
		},
		null,
		2
	);
}
