import {
	type AgentDiscoveryUrls,
	createAcpErrorBody,
	createApiCatalog,
	createMcpServerCard,
	createNlwebAnswer,
	createNlwebSseBody,
	createSandboxDiscovery,
	createUcpProfile,
	createWebBotAuthDirectory,
	createX402ResourceDiscovery,
	parseNlwebAskBody,
} from "@databuddy/shared/agent-discovery";
import { API_KEY_AUTH_CHALLENGE } from "@databuddy/api-keys/resolve";
import { config } from "@databuddy/env/app";
import { Elysia } from "elysia";

const SITE_URL = "https://www.databuddy.cc";
const API_URL = config.urls.api;

const discoveryUrls = {
	siteUrl: SITE_URL,
	apiUrl: API_URL,
	basketUrl: config.urls.basket,
	dashboardUrl: config.urls.dashboard,
	openapiSpecUrl: `${SITE_URL}/openapi.json`,
	apiOpenapiSpecUrl: `${API_URL}/openapi.json`,
	mcpServerUrl: config.urls.mcp,
	mcpManifestUrl: `${SITE_URL}/.well-known/mcp.json`,
	apiCatalogUrl: `${API_URL}/.well-known/api-catalog`,
} satisfies AgentDiscoveryUrls;

function jsonResponse(body: unknown, init?: ResponseInit) {
	return Response.json(body, {
		...init,
		headers: {
			"Cache-Control": "public, max-age=3600, must-revalidate",
			...init?.headers,
		},
	});
}

function noStoreJsonResponse(body: unknown, init?: ResponseInit) {
	return Response.json(body, {
		...init,
		headers: {
			"Cache-Control": "no-store",
			...init?.headers,
		},
	});
}

function linksetResponse(body: unknown) {
	return new Response(JSON.stringify(body, null, 2), {
		headers: {
			"Cache-Control": "public, max-age=3600, must-revalidate",
			"Content-Type":
				'application/linkset+json;profile="https://www.rfc-editor.org/info/rfc9727"; charset=utf-8',
		},
	});
}

function unauthorizedDiscoveryResponse() {
	return noStoreJsonResponse(
		{
			success: false,
			error: "Authentication required",
			code: "AUTH_REQUIRED",
			fix: "Create a scoped Databuddy API key, then send it in x-api-key or Authorization: Bearer.",
		},
		{
			status: 401,
			headers: { "WWW-Authenticate": API_KEY_AUTH_CHALLENGE },
		}
	);
}

function optionsResponse() {
	return new Response(null, {
		status: 204,
		headers: {
			"Access-Control-Allow-Headers":
				"authorization, content-type, idempotency-key, x-api-key",
			"Access-Control-Allow-Methods": "OPTIONS, POST",
			"Access-Control-Allow-Origin": "*",
			Allow: "OPTIONS, POST",
			"Cache-Control": "no-store",
		},
	});
}

function acpErrorResponse(code: string, message: string) {
	return noStoreJsonResponse(createAcpErrorBody(discoveryUrls, code, message), {
		status: 400,
	});
}

function sseResponse(payload: unknown) {
	return new Response(createNlwebSseBody(payload), {
		headers: {
			"Cache-Control": "no-store",
			"Content-Type": "text/event-stream; charset=utf-8",
		},
	});
}

export const discovery = new Elysia({ name: "agent-discovery" })
	.get("/.well-known/api-catalog", () =>
		linksetResponse(createApiCatalog(discoveryUrls))
	)
	.head(
		"/.well-known/api-catalog",
		() =>
			new Response(null, {
				headers: {
					Link: '</.well-known/api-catalog>; rel="api-catalog"',
				},
			})
	)
	.get("/.well-known/http-message-signatures-directory", () =>
		jsonResponse(createWebBotAuthDirectory())
	)
	.get("/.well-known/mcp/server-card.json", () =>
		jsonResponse(createMcpServerCard(discoveryUrls))
	)
	.get("/.well-known/mcp", () =>
		jsonResponse(createMcpServerCard(discoveryUrls))
	)
	.get("/.well-known/ucp", () => jsonResponse(createUcpProfile(discoveryUrls)))
	.get("/sandbox", () => jsonResponse(createSandboxDiscovery(discoveryUrls)))
	.options("/checkout_sessions", optionsResponse)
	.post("/checkout_sessions", () =>
		acpErrorResponse(
			"checkout_session_requires_authenticated_plan",
			"Databuddy agent checkout sessions require an authenticated billing context."
		)
	)
	.options("/agentic_commerce/delegate_payment", optionsResponse)
	.post("/agentic_commerce/delegate_payment", () =>
		acpErrorResponse(
			"delegate_payment_requires_authenticated_plan",
			"Databuddy delegate payments require an authenticated billing context."
		)
	)
	.get("/discovery/resources", () =>
		jsonResponse(createX402ResourceDiscovery(discoveryUrls))
	)
	.post("/ask", ({ body }) => {
		const { query, streaming } = parseNlwebAskBody(body);
		const payload = createNlwebAnswer(discoveryUrls, query);
		return streaming ? sseResponse(payload) : jsonResponse(payload);
	})
	.all("/api", unauthorizedDiscoveryResponse)
	.all("/api/v1", unauthorizedDiscoveryResponse)
	.all("/v1", unauthorizedDiscoveryResponse)
	.all("/v2", unauthorizedDiscoveryResponse)
	.all("/agent/auth", unauthorizedDiscoveryResponse);
