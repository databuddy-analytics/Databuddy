import { hasKeyScope } from "@databuddy/api-keys/resolve";
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

export interface DatabuddyMcpHttpOptions extends McpRequestContext {
	request: Request;
	serverName?: string;
	serverVersion?: string;
}

const UNAUTH_BODY_PARSE_CAP = 4096;

export async function createMcpUnauthorizedResponse(
	request: Request
): Promise<Response> {
	mergeWideEvent({ mcp_auth: "unauthorized" });

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
				"WWW-Authenticate":
					'Bearer realm="databuddy", error="invalid_token", error_description="API key required (x-api-key or Authorization: Bearer)"',
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
		},
		tool.handler
	);
}

function titleFromName(name: string): string {
	// MCP tool names are validated against /^[a-z][a-z0-9_]*$/ in defineMcpTool,
	// so split always returns at least one non-empty leading-alpha word.
	const [head, ...rest] = name.split("_");
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
