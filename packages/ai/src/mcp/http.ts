import { hasKeyScope } from "@databuddy/api-keys/resolve";
import { MCP_UI_RESOURCE_URI } from "@databuddy/shared/agent-discovery";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { AnySchema } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { captureError, mergeWideEvent } from "../lib/tracing";
import type {
	McpRequestContext,
	McpToolMetadata,
	RegisteredMcpTool,
} from "../ai/mcp/define-tool";
import { createMcpTools } from "../ai/mcp/tools";
import { GUIDE_MARKDOWN, GUIDE_URI, MCP_INSTRUCTIONS } from "./guide";
import { registerDatabuddyPrompts } from "./prompts";

const DEFAULT_MCP_SERVER_NAME = "databuddy";
const DEFAULT_MCP_SERVER_VERSION = "1.0.0";
export { MCP_UI_RESOURCE_URI } from "@databuddy/shared/agent-discovery";

const MCP_UI_RESOURCE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Databuddy Analytics Overview</title>
    <style>
      body { font-family: Inter, system-ui, sans-serif; margin: 0; padding: 16px; color: #111827; background: #ffffff; }
      main { display: grid; gap: 12px; }
      h1 { font-size: 18px; margin: 0; }
      p { margin: 0; color: #4b5563; line-height: 1.5; }
      .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
      .metric { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; }
      .label { color: #6b7280; font-size: 12px; }
      .value { font-size: 20px; font-weight: 650; margin-top: 4px; }
    </style>
  </head>
  <body>
    <main>
      <h1>Databuddy analytics</h1>
      <p>Interactive MCP Apps surface for analytics summaries returned by Databuddy tools.</p>
      <section class="grid" aria-label="Analytics summary placeholders">
        <div class="metric"><div class="label">Visitors</div><div class="value" data-metric="visitors">-</div></div>
        <div class="metric"><div class="label">Pageviews</div><div class="value" data-metric="pageviews">-</div></div>
        <div class="metric"><div class="label">Errors</div><div class="value" data-metric="errors">-</div></div>
      </section>
    </main>
  </body>
</html>`;

export interface DatabuddyMcpHttpOptions extends McpRequestContext {
	request: Request;
	serverName?: string;
	serverVersion?: string;
}

const UNAUTH_BODY_PARSE_CAP = 4096;

export async function createMcpUnauthorizedResponse(
	request: Request,
	options?: { resourceMetadataUrl?: string }
): Promise<Response> {
	mergeWideEvent({ mcp_auth: "unauthorized" });

	const resourceMetadata = options?.resourceMetadataUrl
		? `, resource_metadata="${options.resourceMetadataUrl}"`
		: "";

	return Response.json(
		{
			jsonrpc: "2.0",
			error: {
				code: -32_001,
				message:
					"Authentication required. Use x-api-key or Authorization: Bearer with a key that has read:data scope.",
			},
			id: shouldReadUnauthId(request) ? await readJsonRpcId(request) : null,
		},
		{
			status: 401,
			headers: {
				"WWW-Authenticate": `Bearer realm="databuddy", error="invalid_token", error_description="API key required (x-api-key or Authorization: Bearer)"${resourceMetadata}`,
			},
		}
	);
}

function shouldReadUnauthId(request: Request): boolean {
	const contentType = request.headers.get("content-type") ?? "";
	if (!contentType.toLowerCase().includes("application/json")) {
		return false;
	}
	const length = Number.parseInt(
		request.headers.get("content-length") ?? "",
		10
	);
	return (
		Number.isFinite(length) && length > 0 && length <= UNAUTH_BODY_PARSE_CAP
	);
}

export async function handleDatabuddyMcpRequest(
	options: DatabuddyMcpHttpOptions
): Promise<Response> {
	mergeWideEvent({
		mcp_auth: options.userId ? "session" : "api_key",
		mcp_session: Boolean(options.userId),
		mcp_api_key: Boolean(options.apiKey),
	});

	const server = new McpServer(
		{
			name: options.serverName ?? DEFAULT_MCP_SERVER_NAME,
			version: options.serverVersion ?? DEFAULT_MCP_SERVER_VERSION,
		},
		{
			capabilities: { tools: {}, resources: {}, prompts: {} },
			instructions: MCP_INSTRUCTIONS,
		}
	);

	registerGuideResource(server);
	registerMcpAppsResource(server);
	registerDatabuddyPrompts(server);

	for (const tool of createMcpTools(options)) {
		if (apiKeyCanCallTool(options.apiKey, tool)) {
			registerTool(server, tool);
		}
	}

	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true,
	});

	try {
		await server.connect(transport);
		return await transport.handleRequest(options.request);
	} catch (error) {
		captureError(error, { mcp_error: true });
		throw error;
	} finally {
		await server.close().catch(() => {});
	}
}

function apiKeyCanCallTool(
	apiKey: McpRequestContext["apiKey"],
	tool: RegisteredMcpTool
): boolean {
	const required = tool.metadata.access.scopes;
	if (!required?.length) {
		return true;
	}
	if (!apiKey) {
		// Session-authenticated callers fall through to downstream role checks.
		return true;
	}
	return required.every((scope) => hasKeyScope(apiKey, scope));
}

function registerTool(server: McpServer, tool: RegisteredMcpTool): void {
	server.registerTool(
		tool.name,
		{
			title: titleFromName(tool.name),
			description: tool.description,
			inputSchema: toMcpSchema(tool.inputSchema),
			...(tool.outputSchema && {
				outputSchema: toMcpSchema(tool.outputSchema),
			}),
			annotations: deriveAnnotations(tool.metadata),
			_meta: deriveToolMeta(tool.name),
		},
		tool.handler
	);
}

function titleFromName(name: string): string {
	// MCP tool names are validated against /^[a-z][a-z0-9_]*$/ in defineMcpTool,
	// so split always returns at least one non-empty leading-alpha word.
	const [head = name, ...rest] = name.split("_");
	return [head.charAt(0).toUpperCase() + head.slice(1), ...rest].join(" ");
}

function deriveAnnotations(metadata: McpToolMetadata): ToolAnnotations {
	const isRead = metadata.access.kind === "read";
	const requiresConfirmation = metadata.access.confirmation === "required";
	return {
		readOnlyHint: isRead,
		destructiveHint: !isRead && requiresConfirmation,
		idempotentHint: isRead,
		openWorldHint: true,
	};
}

function registerGuideResource(server: McpServer): void {
	server.registerResource(
		"databuddy_guide",
		GUIDE_URI,
		{
			title: "Databuddy MCP guide",
			description:
				"Workflow tips, query conventions, and known footguns. Read after the session-start instructions when you want more depth.",
			mimeType: "text/markdown",
		},
		(uri) => ({
			contents: [
				{
					uri: uri.href,
					mimeType: "text/markdown",
					text: GUIDE_MARKDOWN,
				},
			],
		})
	);
}

function registerMcpAppsResource(server: McpServer): void {
	server.registerResource(
		"databuddy_analytics_overview_ui",
		MCP_UI_RESOURCE_URI,
		{
			title: "Databuddy analytics overview UI",
			description:
				"MCP Apps HTML resource for rendering Databuddy analytics summaries inside agent clients.",
			mimeType: "text/html",
			_meta: {
				"openai/widgetDescription":
					"Shows Databuddy analytics summary metrics returned by MCP tools.",
				"openai/widgetPrefersBorder": true,
			},
		},
		(uri) => ({
			contents: [
				{
					uri: uri.href,
					mimeType: "text/html",
					text: MCP_UI_RESOURCE_HTML,
				},
			],
		})
	);
}

function deriveToolMeta(toolName: string): Record<string, unknown> {
	return {
		ui: {
			resourceUri: MCP_UI_RESOURCE_URI,
		},
		"openai/outputTemplate": MCP_UI_RESOURCE_URI,
		"databuddy/toolName": toolName,
	};
}

function toMcpSchema(schema: RegisteredMcpTool["inputSchema"]): AnySchema {
	// The MCP SDK's zod-compat type targets a different Zod surface than this repo's Zod v4 types.
	return schema as unknown as AnySchema;
}

async function readJsonRpcId(
	request: Request
): Promise<string | number | null> {
	try {
		const body = (await request.clone().json()) as { id?: unknown };
		return typeof body.id === "string" || typeof body.id === "number"
			? body.id
			: null;
	} catch {
		return null;
	}
}
