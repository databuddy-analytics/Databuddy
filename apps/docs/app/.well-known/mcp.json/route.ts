export const revalidate = 3600;

export function GET(request: Request) {
	const origin = new URL(request.url).origin;
	return Response.json(
		{
			mcpServers: {
				databuddy_docs: {
					description:
						"Read-only Databuddy documentation MCP server with markdown docs tools.",
					transport: "streamable-http",
					url: `${origin}/mcp`,
				},
			},
			servers: [
				{
					description:
						"Read-only Databuddy documentation MCP server with markdown docs tools.",
					name: "databuddy-docs",
					transport: "streamable-http",
					url: `${origin}/mcp`,
				},
			],
		},
		{
			headers: {
				"Access-Control-Allow-Origin": "*",
				"Cache-Control": "public, max-age=3600, must-revalidate",
			},
		}
	);
}
