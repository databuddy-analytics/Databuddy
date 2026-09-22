import { config } from "@databuddy/env/app";

const DATABUDDY_HOST_RE = /(?:^|\.)databuddy\.cc$/;
const allowedApiOrigins = new Set(config.cors.apiOrigins);
const MCP_PATHS = new Set(["/v1/mcp", "/v1/mcp/", "/mcp", "/mcp/"]);

function isMcpRequest(request: Request): boolean {
	return MCP_PATHS.has(new URL(request.url).pathname);
}

export function isAllowedApiOrigin(request: Request): boolean {
	const origin = request.headers.get("Origin");
	if (!origin) {
		return false;
	}

	try {
		const url = new URL(origin);
		return (
			DATABUDDY_HOST_RE.test(url.hostname) || allowedApiOrigins.has(url.origin)
		);
	} catch {
		return false;
	}
}

export function rejectInvalidMcpOrigin(request: Request): Response | undefined {
	if (
		!(isMcpRequest(request) && request.headers.has("origin")) ||
		isAllowedApiOrigin(request)
	) {
		return;
	}

	// policy-ignore http/no-custom-json-error-response: MCP transport errors must use a JSON-RPC envelope.
	return Response.json(
		{
			jsonrpc: "2.0",
			error: { code: -32_000, message: "Forbidden Origin" },
			id: null,
		},
		{ status: 403 }
	);
}

export function rejectUnsupportedMcpMethod(
	request: Request
): Response | undefined {
	if (
		!isMcpRequest(request) ||
		request.method === "POST" ||
		request.method === "OPTIONS"
	) {
		return;
	}
	return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
