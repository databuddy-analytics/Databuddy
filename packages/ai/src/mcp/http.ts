import {
	getAccessibleWebsiteIds,
	hasKeyAllScopes,
	hasWebsiteAllScopes,
} from "@databuddy/api-keys/resolve";
import { config } from "@databuddy/env/app";
import { readBooleanEnv } from "@databuddy/env/boolean";
import { trackMcp } from "@databuddy/sdk/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
	CallToolRequestSchema,
	ErrorCode,
	ListToolsRequestSchema,
	McpError,
	type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { captureError, mergeWideEvent } from "../lib/tracing";
import {
	authType,
	type McpRequestContext,
	type RegisteredMcpTool,
} from "../ai/mcp/define-tool";
import { createMcpTools } from "../ai/mcp/tools";
import { GUIDE_MARKDOWN, GUIDE_URI, MCP_INSTRUCTIONS } from "./guide";

export interface DatabuddyMcpHttpOptions extends McpRequestContext {
	clientName?: string;
	request: Request;
}

const MCP_AUTH_CHALLENGE = `Bearer realm="databuddy", resource_metadata="${new URL("/.well-known/oauth-protected-resource", config.urls.mcp).href}"`;
const MAX_MCP_REQUEST_BYTES = 1_048_576;
const ToolCallRequestSchema = CallToolRequestSchema.extend({
	params: CallToolRequestSchema.shape.params
		.omit({ arguments: true, name: true })
		.loose()
		.transform((params) =>
			params.arguments === null ? { ...params, arguments: undefined } : params
		)
		.optional(),
});

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
): Promise<Response | { message: unknown }> {
	const tooLarge = () =>
		createMcpErrorResponse(413, -32_600, "Request body is larger than 1 MB.");
	if (Number(request.headers.get("content-length")) > MAX_MCP_REQUEST_BYTES) {
		return tooLarge();
	}
	const decoder = new TextDecoder();
	let body = "";
	let bodyBytes = 0;
	if (request.body) {
		const reader = request.body.getReader();
		for (
			let chunk = await reader.read();
			!chunk.done;
			chunk = await reader.read()
		) {
			bodyBytes += chunk.value.byteLength;
			if (bodyBytes > MAX_MCP_REQUEST_BYTES) {
				await reader.cancel();
				return tooLarge();
			}
			body += decoder.decode(chunk.value, { stream: true });
		}
	}
	body += decoder.decode();
	let message: unknown;
	try {
		message = JSON.parse(body);
	} catch {
		return createMcpErrorResponse(400, -32_700, "Parse error: Invalid JSON");
	}
	if (Array.isArray(message)) {
		mergeWideEvent({ mcp_batch_rejected: true });
		return createMcpErrorResponse(
			400,
			-32_600,
			"Batch requests are not supported. Send one JSON-RPC message per request."
		);
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
	if (parsed instanceof Response) {
		return parsed;
	}

	mergeWideEvent({
		mcp_auth: authType(options),
		mcp_session: Boolean(options.userId && !options.oauth),
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

	if (!readBooleanEnv("SELFHOST")) {
		trackMcp(server, {
			beforeSend: (call) => ({
				...call,
				clientName: call.clientName ?? options.clientName,
			}),
		});
	}
	registerGuideResource(server);

	const allTools = createMcpTools(options);
	const tools = allTools.filter((tool) => callerCanCallTool(options, tool));
	if (tools.length) {
		server.server.registerCapabilities({ tools: { listChanged: true } });
		server.server.setRequestHandler(ListToolsRequestSchema, () => ({
			tools: tools.map(toListedTool),
		}));
		server.server.setRequestHandler(ToolCallRequestSchema, (request, extra) => {
			const { params } = CallToolRequestSchema.parse(request);
			const tool = tools.find(({ name }) => name === params.name);
			if (tool) {
				return tool.handler(params.arguments, extra);
			}
			const hidden = allTools.find(({ name }) => name === params.name);
			throw new McpError(
				ErrorCode.InvalidParams,
				hidden
					? `Tool ${params.name} requires scopes: ${hidden.metadata.access.scopes.join(", ")}. Reconnect or use an API key that has them.`
					: `Unknown tool: ${params.name}`
			);
		});
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
	{ apiKey, oauth }: McpRequestContext,
	tool: RegisteredMcpTool
): boolean {
	const { scopes: required, globalScopes } = tool.metadata.access;
	if (!required.length) {
		return true;
	}
	if (oauth) {
		return required.every((scope) => oauth.scopes.includes(scope));
	}
	if (!apiKey) {
		return true;
	}
	if (!hasKeyAllScopes(apiKey, globalScopes)) {
		return false;
	}
	const websiteScopes = required.filter(
		(scope) => !globalScopes.includes(scope)
	);
	return (
		hasKeyAllScopes(apiKey, websiteScopes) ||
		getAccessibleWebsiteIds(apiKey).some((websiteId) =>
			hasWebsiteAllScopes(apiKey, websiteId, websiteScopes)
		)
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

function toListedTool(tool: RegisteredMcpTool): Tool {
	return {
		name: tool.name,
		title: tool.title,
		description: tool.description,
		inputSchema: z.toJSONSchema(tool.inputSchema, {
			io: "input",
			target: "draft-7",
		}) as Tool["inputSchema"],
		...(tool.outputSchema && {
			outputSchema: z.toJSONSchema(tool.outputSchema, {
				io: "output",
				metadata: z.registry(),
				target: "draft-7",
			}) as Tool["outputSchema"],
		}),
		annotations: tool.annotations,
	};
}
