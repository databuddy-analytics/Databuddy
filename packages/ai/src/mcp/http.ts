import {
	getAccessibleWebsiteIds,
	hasKeyAllScopes,
	hasWebsiteAllScopes,
} from "@databuddy/api-keys/resolve";
import { config } from "@databuddy/env/app";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { AnySchema } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { captureError, mergeWideEvent } from "../lib/tracing";
import type {
	McpRequestContext,
	RegisteredMcpTool,
} from "../ai/mcp/define-tool";
import { createMcpTools } from "../ai/mcp/tools";
import { GUIDE_MARKDOWN, GUIDE_URI, MCP_INSTRUCTIONS } from "./guide";

export interface DatabuddyMcpHttpOptions extends McpRequestContext {
	request: Request;
}

const MCP_AUTH_CHALLENGE = `Bearer realm="databuddy", resource_metadata="${config.urls.api}/.well-known/oauth-protected-resource"`;
const MAX_MCP_REQUEST_BYTES = 1_048_576;

export function createMcpErrorResponse(
	status: number,
	code: number,
	message: string,
	headers?: HeadersInit
): Response {
	return Response.json(
		{ jsonrpc: "2.0", error: { code, message }, id: null },
		{ status, headers }
	);
}

export function createMcpUnauthorizedResponse(): Response {
	mergeWideEvent({ mcp_auth: "unauthorized" });

	return createMcpErrorResponse(
		401,
		-32_001,
		"Authentication required. Use OAuth 2.1, or x-api-key / Authorization: Bearer with a valid Databuddy API key.",
		{ "WWW-Authenticate": MCP_AUTH_CHALLENGE }
	);
}

async function readSingleMcpMessage(
	request: Request
): Promise<{ message: unknown } | { rejection: Response }> {
	const tooLarge = {
		rejection: createMcpErrorResponse(
			413,
			-32_600,
			"Request body is larger than 1 MB."
		),
	};
	if (Number(request.headers.get("content-length")) > MAX_MCP_REQUEST_BYTES) {
		return tooLarge;
	}
	const body = await request.arrayBuffer();
	if (body.byteLength > MAX_MCP_REQUEST_BYTES) {
		return tooLarge;
	}
	let message: unknown;
	try {
		message = JSON.parse(new TextDecoder().decode(body));
	} catch {
		return {
			rejection: createMcpErrorResponse(
				400,
				-32_700,
				"Parse error: Invalid JSON"
			),
		};
	}
	if (Array.isArray(message)) {
		mergeWideEvent({ mcp_batch_rejected: true });
		return {
			rejection: createMcpErrorResponse(
				400,
				-32_600,
				"Batch requests are not supported. Send one JSON-RPC message per request."
			),
		};
	}
	return { message };
}

export async function handleDatabuddyMcpRequest(
	options: DatabuddyMcpHttpOptions
): Promise<Response> {
	if (options.request.method !== "POST") {
		return new Response(null, { status: 405, headers: { Allow: "POST" } });
	}

	const parsed = await readSingleMcpMessage(options.request);
	if ("rejection" in parsed) {
		return parsed.rejection;
	}

	mergeWideEvent({
		mcp_auth: options.apiKey
			? "api_key"
			: options.oauthUserId
				? "oauth"
				: "session",
		mcp_session: Boolean(options.userId && !options.oauthUserId),
		mcp_api_key: Boolean(options.apiKey),
	});

	const server = new McpServer(
		{
			name: "databuddy",
			version: "1.0.0",
		},
		{
			instructions: MCP_INSTRUCTIONS,
		}
	);

	registerGuideResource(server);

	for (const tool of createMcpTools(options)) {
		if (!callerCanCallTool(options, tool)) {
			continue;
		}
		server.registerTool(
			tool.name,
			{
				title: tool.title,
				description: tool.description,
				inputSchema: toMcpSchema(tool.inputSchema),
				...(tool.outputSchema && {
					outputSchema: toMcpSchema(tool.outputSchema),
				}),
				annotations: tool.annotations,
			},
			tool.handler
		);
	}

	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true,
	});

	try {
		await server.connect(transport);
		return await transport.handleRequest(options.request, {
			parsedBody: parsed.message,
		});
	} catch (error) {
		captureError(error, { mcp_error: true });
		throw error;
	} finally {
		await server.close().catch(() => {});
	}
}

function callerCanCallTool(
	{ apiKey, oauthScopes }: McpRequestContext,
	tool: RegisteredMcpTool
): boolean {
	const required = tool.metadata.access.scopes;
	if (!required?.length) {
		return true;
	}
	if (oauthScopes) {
		return required.every((scope) => oauthScopes.includes(scope));
	}
	if (!apiKey) {
		return true;
	}
	const globalScopes = tool.metadata.access.globalScopes;
	if (globalScopes.length && !hasKeyAllScopes(apiKey, globalScopes)) {
		return false;
	}
	const websiteScopes = required.filter(
		(scope) => !globalScopes.includes(scope)
	);
	if (!websiteScopes.length || hasKeyAllScopes(apiKey, websiteScopes)) {
		return true;
	}
	return getAccessibleWebsiteIds(apiKey).some((websiteId) =>
		hasWebsiteAllScopes(apiKey, websiteId, websiteScopes)
	);
}

function registerGuideResource(server: McpServer): void {
	server.registerResource(
		"databuddy_guide",
		GUIDE_URI,
		{
			title: "Databuddy MCP guide",
			description:
				"Reference for Databuddy MCP tools: query conventions, what insight and investigation fields mean, and the scopes each tool needs.",
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
	return schema as unknown as AnySchema;
}
