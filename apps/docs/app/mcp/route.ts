import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type {
	AnySchema,
	ZodRawShapeCompat,
} from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { z } from "zod";
import {
	buildLlmsFullTxt,
	buildLlmsTxt,
	listDocs,
	readDocMarkdown,
	slugFromDocsPath,
} from "@/lib/agent-docs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SERVER_INFO = {
	name: "databuddy-docs",
	version: "1.0.0",
};

const listDocsInputSchema = {
	query: z
		.string()
		.optional()
		.describe(
			"Optional case-insensitive filter for title or description."
		) as unknown as AnySchema,
} satisfies ZodRawShapeCompat;

const fetchDocInputSchema = {
	path: z
		.string()
		.describe(
			"Documentation path or URL, for example /docs/getting-started or https://www.databuddy.cc/docs/sdk/react.md."
		) as unknown as AnySchema,
} satisfies ZodRawShapeCompat;

function corsHeaders() {
	return {
		"Access-Control-Allow-Headers":
			"Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id",
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		"Access-Control-Allow-Origin": "*",
	};
}

function withCors(response: Response) {
	const headers = new Headers(response.headers);
	for (const [key, value] of Object.entries(corsHeaders())) {
		headers.set(key, value);
	}
	return new Response(response.body, {
		headers,
		status: response.status,
		statusText: response.statusText,
	});
}

function createDocsMcpServer(origin: string) {
	const server = new McpServer(SERVER_INFO, {
		capabilities: {
			tools: {},
		},
	});

	server.registerTool(
		"list_docs",
		{
			description:
				"List Databuddy documentation pages with HTML and markdown URLs.",
			inputSchema: listDocsInputSchema,
		},
		async ({ query }) => {
			const normalizedQuery = query?.trim().toLowerCase();
			const docs = (await listDocs()).filter((doc) => {
				if (!normalizedQuery) {
					return true;
				}
				return `${doc.title} ${doc.description} ${doc.htmlPath}`
					.toLowerCase()
					.includes(normalizedQuery);
			});

			const text = docs
				.map((doc) => {
					const description = doc.description ? ` - ${doc.description}` : "";
					return `- ${doc.title}: ${origin}${doc.markdownPath}${description}`;
				})
				.join("\n");

			return {
				content: [
					{
						text,
						type: "text" as const,
					},
				],
			};
		}
	);

	server.registerTool(
		"fetch_doc",
		{
			description:
				"Fetch one Databuddy documentation page as raw markdown. Accepts /docs paths, .md paths, or full docs URLs.",
			inputSchema: fetchDocInputSchema,
		},
		async ({ path }) => {
			const slug = slugFromDocsPath(path);
			const doc = slug ? await readDocMarkdown(slug) : null;
			if (!doc) {
				return {
					content: [
						{
							text: `No Databuddy docs page found for ${path}.`,
							type: "text" as const,
						},
					],
					isError: true,
				};
			}

			return {
				content: [
					{
						text: doc.body,
						type: "text" as const,
					},
				],
			};
		}
	);

	server.registerTool(
		"fetch_llms_full",
		{
			description:
				"Fetch the complete Databuddy documentation corpus as one markdown document.",
		},
		async () => ({
			content: [
				{
					text: await buildLlmsFullTxt(),
					type: "text" as const,
				},
			],
		})
	);

	server.registerTool(
		"fetch_llms_index",
		{
			description:
				"Fetch the Databuddy llms.txt documentation index with markdown page URLs.",
		},
		async () => ({
			content: [
				{
					text: await buildLlmsTxt(origin),
					type: "text" as const,
				},
			],
		})
	);

	return server;
}

function discoveryPayload(request: Request) {
	const origin = new URL(request.url).origin;
	return {
		description:
			"Read-only MCP server for Databuddy documentation and AI-friendly markdown docs.",
		endpoint: `${origin}/mcp`,
		name: SERVER_INFO.name,
		protocol: "mcp",
		transport: "streamable-http",
		version: SERVER_INFO.version,
		tools: ["list_docs", "fetch_doc", "fetch_llms_index", "fetch_llms_full"],
	};
}

async function handleMcp(request: Request) {
	const server = createDocsMcpServer(new URL(request.url).origin);
	const transport = new WebStandardStreamableHTTPServerTransport({
		enableJsonResponse: true,
		sessionIdGenerator: undefined,
	});

	try {
		await server.connect(transport);
		return withCors(await transport.handleRequest(request));
	} finally {
		await server.close().catch(() => {});
	}
}

export function GET(request: Request) {
	const accept = request.headers.get("accept") ?? "";
	if (
		accept.includes("text/event-stream") ||
		request.headers.has("mcp-session-id")
	) {
		return handleMcp(request);
	}

	return Response.json(discoveryPayload(request), {
		headers: {
			...corsHeaders(),
			"Cache-Control": "public, max-age=3600, must-revalidate",
		},
	});
}

export function POST(request: Request) {
	return handleMcp(request);
}

export function OPTIONS() {
	return new Response(null, {
		headers: {
			...corsHeaders(),
			"Access-Control-Max-Age": "86400",
		},
		status: 204,
	});
}
