import {
	type AgentDiscoveryUrls,
	createA2aAgentCard as createSharedA2aAgentCard,
	createAgentJson as createSharedAgentJson,
	createApiCatalog as createSharedApiCatalog,
	createAuthMarkdown as createSharedAuthMarkdown,
	createAuthorizationServerMetadata as createSharedAuthorizationServerMetadata,
	createDeveloperResources,
	createIndexMarkdown as createSharedIndexMarkdown,
	createMcpManifest as createSharedMcpManifest,
	createMcpServerCard as createSharedMcpServerCard,
	createNlwebAnswer as createSharedNlwebAnswer,
	createProtectedResourceMetadata as createSharedProtectedResourceMetadata,
	createSchemaMapXml as createSharedSchemaMapXml,
	createScopedLlmsText as createSharedScopedLlmsText,
	createSoftwareJsonl as createSharedSoftwareJsonl,
	createUcpProfile as createSharedUcpProfile,
} from "@databuddy/shared/agent-discovery";
import {
	API_OPENAPI_SPEC_URL,
	API_URL,
	BASKET_URL,
	DASHBOARD_URL,
	MCP_MANIFEST_URL,
	MCP_SERVER_URL,
	OPENAPI_SPEC_URL,
	SITE_URL,
} from "@/app/util/constants";

export {
	AGENT_DISCOVERY_UPDATED,
	API_SCOPES,
	createFaqJsonl,
	createNlwebSseBody,
	createWebBotAuthDirectory,
	parseNlwebAskBody,
} from "@databuddy/shared/agent-discovery";

const discoveryUrls = {
	siteUrl: SITE_URL,
	apiUrl: API_URL,
	basketUrl: BASKET_URL,
	dashboardUrl: DASHBOARD_URL,
	openapiSpecUrl: OPENAPI_SPEC_URL,
	apiOpenapiSpecUrl: API_OPENAPI_SPEC_URL,
	mcpServerUrl: MCP_SERVER_URL,
	mcpManifestUrl: MCP_MANIFEST_URL,
} satisfies AgentDiscoveryUrls;

export const developerResources = createDeveloperResources(discoveryUrls);

function commonHeaders(contentType: string, cache = true): HeadersInit {
	return {
		"Cache-Control": cache
			? "public, max-age=3600, must-revalidate"
			: "no-store",
		"Content-Type": contentType,
	};
}

export function markdownResponse(body: string, init?: ResponseInit) {
	return new Response(body, {
		...init,
		headers: {
			...commonHeaders("text/markdown; charset=utf-8"),
			Vary: "Accept, Accept-Encoding",
			...init?.headers,
		},
	});
}

export function agentJsonResponse(body: unknown) {
	return new Response(JSON.stringify(body, null, 2), {
		headers: commonHeaders("application/json; charset=utf-8"),
	});
}

export function linksetJsonResponse(body: unknown) {
	return new Response(JSON.stringify(body, null, 2), {
		headers: commonHeaders(
			'application/linkset+json;profile="https://www.rfc-editor.org/info/rfc9727"; charset=utf-8'
		),
	});
}

export function createMcpManifest() {
	return createSharedMcpManifest(discoveryUrls);
}

export function createMcpServerCard() {
	return createSharedMcpServerCard(discoveryUrls);
}

export function createAgentJson() {
	return createSharedAgentJson(discoveryUrls);
}

export function createA2aAgentCard() {
	return createSharedA2aAgentCard(discoveryUrls);
}

export function createApiCatalog() {
	return createSharedApiCatalog(discoveryUrls);
}

export function createProtectedResourceMetadata(resource = API_URL) {
	return createSharedProtectedResourceMetadata(discoveryUrls, resource);
}

export function createAuthorizationServerMetadata() {
	return createSharedAuthorizationServerMetadata(discoveryUrls);
}

export function createUcpProfile() {
	return createSharedUcpProfile(discoveryUrls);
}

export function createIndexMarkdown() {
	return createSharedIndexMarkdown(discoveryUrls);
}

export function createAuthMarkdown() {
	return createSharedAuthMarkdown(discoveryUrls);
}

export function createScopedLlmsText(area: "api" | "developers" | "docs") {
	return createSharedScopedLlmsText(discoveryUrls, area);
}

export function createSchemaMapXml() {
	return createSharedSchemaMapXml(discoveryUrls);
}

export function createSoftwareJsonl() {
	return createSharedSoftwareJsonl(discoveryUrls);
}

export function createNlwebAnswer(query: string) {
	return createSharedNlwebAnswer(discoveryUrls, query);
}
