import { publicConfig } from "@databuddy/env/public";

export const MCP_SERVER_NAME = "databuddy";
export const MCP_ENV_VAR = "DATABUDDY_API_KEY";
export const MCP_SERVER_URL = publicConfig.urls.mcp;

export function createMcpConfig(
	secret: string,
	useEnvironmentVariable = false
) {
	return JSON.stringify(
		{
			mcpServers: {
				[MCP_SERVER_NAME]: {
					type: "http",
					url: MCP_SERVER_URL,
					headers: {
						"x-api-key": useEnvironmentVariable
							? `\${env:${MCP_ENV_VAR}}`
							: secret,
					},
				},
			},
		},
		null,
		2
	);
}
