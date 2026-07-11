import { z } from "zod";
import { API_SCOPES } from "./api-scopes";

export { API_SCOPES } from "./api-scopes";

export const AGENT_DISCOVERY_UPDATED = "2026-07-03";
export const MCP_UI_RESOURCE_URI = "ui://databuddy/analytics-overview";

const CDN_SCRIPT_URL = "https://cdn.databuddy.cc/databuddy.js";

export interface AgentDiscoveryUrls {
	a2aAgentCardUrl?: string;
	agentJsonUrl?: string;
	apiCatalogUrl?: string;
	apiOpenapiSpecUrl: string;
	apiUrl: string;
	authMdUrl?: string;
	authorizationServerMetadataUrl?: string;
	basketUrl: string;
	dashboardUrl: string;
	mcpManifestUrl: string;
	mcpServerCardUrl?: string;
	mcpServerUrl: string;
	openapiSpecUrl: string;
	protectedResourceMetadataUrl?: string;
	siteUrl: string;
}

export type ScopedLlmsArea = "api" | "developers" | "docs";

export const mcpTools = [
	{
		name: "ask",
		description:
			"Ask an open-ended analytics question and receive a concise answer with supporting data.",
	},
	{
		name: "list_websites",
		description:
			"List websites available to the authenticated Databuddy API key.",
	},
	{
		name: "get_data",
		description:
			"Run typed analytics queries for traffic, pages, referrers, errors, sessions, funnels, goals, and performance.",
	},
	{
		name: "get_schema",
		description:
			"Read analytics schema details before building filters or SQL queries.",
	},
	{
		name: "capabilities",
		description:
			"Inspect available query types, tool categories, and supported workflows.",
	},
	{
		name: "list_funnels",
		description: "List configured conversion funnels.",
	},
	{
		name: "get_funnel_analytics",
		description: "Read per-step conversion analytics for a funnel.",
	},
	{
		name: "list_goals",
		description: "List configured conversion goals.",
	},
	{
		name: "get_goal_analytics",
		description: "Read completion analytics for a goal.",
	},
	{
		name: "list_links",
		description: "List short links and folders for link analytics workflows.",
	},
	{
		name: "list_flags",
		description: "List feature flags available to the organization.",
	},
] as const;

function discoveryUrls(urls: AgentDiscoveryUrls) {
	return {
		...urls,
		apiCatalogUrl:
			urls.apiCatalogUrl ?? `${urls.siteUrl}/.well-known/api-catalog`,
		authMdUrl: urls.authMdUrl ?? `${urls.siteUrl}/auth.md`,
		agentJsonUrl: urls.agentJsonUrl ?? `${urls.siteUrl}/.well-known/agent.json`,
		a2aAgentCardUrl:
			urls.a2aAgentCardUrl ?? `${urls.siteUrl}/.well-known/agent-card.json`,
		mcpServerCardUrl:
			urls.mcpServerCardUrl ??
			`${urls.siteUrl}/.well-known/mcp/server-card.json`,
		protectedResourceMetadataUrl:
			urls.protectedResourceMetadataUrl ??
			`${urls.apiUrl}/.well-known/oauth-protected-resource`,
		authorizationServerMetadataUrl:
			urls.authorizationServerMetadataUrl ??
			`${urls.apiUrl}/.well-known/oauth-authorization-server`,
	};
}

export function createAuthDiscoveryHeader(urls: AgentDiscoveryUrls) {
	return `Bearer resource_metadata="${discoveryUrls(urls).protectedResourceMetadataUrl}"`;
}

export function createDeveloperResources(urls: AgentDiscoveryUrls) {
	const resolved = discoveryUrls(urls);

	return [
		{
			title: "Databuddy Developer Resources",
			url: `${resolved.siteUrl}/developers`,
			description:
				"Canonical index of Databuddy API docs, OpenAPI, MCP, SDK, auth, and webhook resources.",
		},
		{
			title: "Databuddy Developer Docs",
			url: `${resolved.siteUrl}/docs`,
			description:
				"SDK setup, REST API guides, feature flags, web vitals, privacy, and integrations.",
		},
		{
			title: "Databuddy API Docs",
			url: `${resolved.siteUrl}/docs/api`,
			description:
				"Authentication, rate limits, analytics queries, events, and links.",
		},
		{
			title: "Databuddy OpenAPI Spec",
			url: resolved.openapiSpecUrl,
			description:
				"Machine-readable OpenAPI 3.1 schema for Databuddy's REST API.",
		},
		{
			title: "Databuddy API Catalog",
			url: resolved.apiCatalogUrl,
			description:
				"RFC 9727 linkset catalog for Databuddy API and machine-readable specs.",
		},
		{
			title: "Databuddy API Reference",
			url: resolved.apiUrl,
			description:
				"Interactive API reference generated from the OpenAPI schema.",
		},
		{
			title: "Databuddy API Authentication",
			url: resolved.authMdUrl,
			description: "API key headers, bearer tokens, scopes, and access levels.",
		},
		{
			title: "Databuddy Agent Discovery",
			url: resolved.agentJsonUrl,
			description:
				"Machine-readable agent discovery file with capabilities, endpoints, auth, and when-to-use guidance.",
		},
		{
			title: "Databuddy A2A Agent Card",
			url: resolved.a2aAgentCardUrl,
			description:
				"Agent-to-Agent card describing Databuddy analytics capabilities and skills.",
		},
		{
			title: "Databuddy MCP Server",
			url: `${resolved.siteUrl}/docs/api/mcp`,
			description:
				"Model Context Protocol setup for Claude, Cursor, Windsurf, and other agents.",
		},
		{
			title: "Databuddy MCP Manifest",
			url: resolved.mcpManifestUrl,
			description:
				"Machine-readable MCP discovery manifest pointing to the Streamable HTTP server.",
		},
		{
			title: "Databuddy MCP Server Card",
			url: resolved.mcpServerCardUrl,
			description:
				"MCP server card with tools, UI resources, authentication, and transport details.",
		},
		{
			title: "Databuddy SDK Docs",
			url: `${resolved.siteUrl}/docs/sdk`,
			description:
				"React, Vue, Node.js, Nuxt, vanilla JS, and tracker SDK guides.",
		},
		{
			title: "Databuddy Webhooks Docs",
			url: `${resolved.siteUrl}/docs/api/events`,
			description:
				"Server-side event tracking and webhook-style ingestion examples.",
		},
		{
			title: "Databuddy llms.txt",
			url: `${resolved.siteUrl}/llms.txt`,
			description:
				"Compact LLM-readable index of Databuddy documentation and developer resources.",
		},
		{
			title: "Databuddy skills.sh Skill",
			url: `${resolved.siteUrl}/skill.md`,
			description:
				"Official SKILL.md source for agents that integrate Databuddy SDK, API, and MCP workflows.",
		},
	] as const;
}

export function createMcpManifest(urls: AgentDiscoveryUrls) {
	const resolved = discoveryUrls(urls);

	return {
		schema_version: "1.0",
		name: "Databuddy",
		display_name: "Databuddy Analytics",
		description:
			"Privacy-first analytics, error tracking, feature flags, uptime, short links, and AI insights for developer teams.",
		homepage_url: resolved.siteUrl,
		documentation_url: `${resolved.siteUrl}/docs/api/mcp`,
		manifest_url: resolved.mcpManifestUrl,
		openapi_url: resolved.openapiSpecUrl,
		api_reference_url: resolved.apiUrl,
		provider: {
			name: "Databuddy Analytics, Inc.",
			url: resolved.siteUrl,
			support_url: `${resolved.siteUrl}/contact`,
		},
		server: {
			url: resolved.mcpServerUrl,
			protocol: "mcp",
			transport: "streamable-http",
			description:
				"Authenticated Streamable HTTP MCP server for Databuddy analytics and configuration tools.",
		},
		transports: [
			{
				type: "streamable-http",
				url: resolved.mcpServerUrl,
			},
			{
				type: "streamable-http",
				url: `${resolved.apiUrl}/mcp`,
			},
		],
		authentication: {
			type: "api_key",
			in: "header",
			name: "x-api-key",
			documentation_url: `${resolved.siteUrl}/docs/api/authentication`,
			auth_md_url: resolved.authMdUrl,
			protected_resource_metadata_url: resolved.protectedResourceMetadataUrl,
			scopes: API_SCOPES,
		},
		capabilities: {
			tools: true,
			resources: true,
			prompts: true,
			mcp_apps: true,
			ui_resources: true,
		},
		tools: mcpTools,
		resources: [
			{
				uri: "databuddy://guide",
				description:
					"Extended Databuddy MCP workflow guide and known query conventions.",
			},
			{
				uri: MCP_UI_RESOURCE_URI,
				mimeType: "text/html",
				description:
					"Embeddable MCP Apps UI template for Databuddy analytics summaries.",
			},
		],
		prompts: [
			{
				name: "weekly_report",
				description:
					"Traffic trends, top pages, referrers, error health, and one item to investigate.",
			},
			{
				name: "triage_errors",
				description: "Prioritize recent errors by type, page, and user impact.",
			},
			{
				name: "funnel_health",
				description: "Find conversion drop-offs across configured funnels.",
			},
		],
		client_config: {
			mcpServers: {
				databuddy: {
					type: "http",
					url: resolved.mcpServerUrl,
					headers: {
						"x-api-key": "dbdy_your_api_key_here",
					},
				},
			},
		},
		related_urls: {
			api: resolved.apiUrl,
			api_openapi: resolved.apiOpenapiSpecUrl,
			event_ingestion: resolved.basketUrl,
			dashboard: resolved.dashboardUrl,
			llms_txt: `${resolved.siteUrl}/llms.txt`,
			llms_full_txt: `${resolved.siteUrl}/llms-full.txt`,
			auth_md: resolved.authMdUrl,
			agent_json: resolved.agentJsonUrl,
			a2a_agent_card: resolved.a2aAgentCardUrl,
			mcp_server_card: resolved.mcpServerCardUrl,
			api_catalog: resolved.apiCatalogUrl,
		},
	};
}

export function createMcpServerCard(urls: AgentDiscoveryUrls) {
	const resolved = discoveryUrls(urls);

	return {
		name: "databuddy",
		description:
			"Databuddy MCP server for privacy-first analytics, errors, web vitals, feature flags, links, funnels, goals, and AI insights.",
		version: "1.0.0",
		serverUrl: resolved.mcpServerUrl,
		transports: [
			{ type: "streamable-http", url: resolved.mcpServerUrl },
			{ type: "streamable-http", url: `${resolved.apiUrl}/mcp` },
		],
		authentication: {
			type: "api_key",
			header: "x-api-key",
			documentationUrl: resolved.authMdUrl,
			protectedResourceMetadataUrl: resolved.protectedResourceMetadataUrl,
			scopes: API_SCOPES,
		},
		tools: mcpTools.map((tool) => ({
			...tool,
			_meta: {
				ui: {
					resourceUri: MCP_UI_RESOURCE_URI,
				},
				"openai/outputTemplate": MCP_UI_RESOURCE_URI,
			},
		})),
		resources: [
			{
				uri: "databuddy://guide",
				mimeType: "text/markdown",
				description: "MCP workflow guide and query conventions.",
			},
			{
				uri: MCP_UI_RESOURCE_URI,
				mimeType: "text/html",
				description:
					"MCP Apps UI resource for rendering Databuddy analytics summaries inside an agent conversation.",
			},
		],
		prompts: [
			"weekly_report",
			"triage_errors",
			"funnel_health",
			"flag_rollout_check",
		],
	};
}

export function createAgentJson(urls: AgentDiscoveryUrls) {
	const resolved = discoveryUrls(urls);

	return {
		schema_version: "1.0",
		name: "Databuddy",
		url: resolved.siteUrl,
		description:
			"Databuddy is a privacy-first analytics platform for developers. It combines web analytics, error tracking, web vitals, feature flags, short links, uptime, and AI insights.",
		when_to_use: [
			"Use Databuddy when a user asks to install privacy-first analytics or replace Google Analytics, Plausible, PostHog, Mixpanel, or Umami.",
			"Use Databuddy when a user wants an AI agent to query website traffic, referrers, pages, errors, web vitals, funnels, goals, links, or feature flags.",
			"Use Databuddy when an application needs a lightweight browser SDK, server-side event tracking, public REST API, or MCP tools for analytics.",
		],
		do_not_use_when: [
			"Do not use Databuddy to store product databases, CRM records, or personally identifiable visitor profiles.",
			"Do not send secrets, raw payment data, health data, or unnecessary personal data as analytics properties.",
		],
		capabilities: [
			"privacy-first web analytics",
			"event ingestion",
			"error tracking",
			"Core Web Vitals",
			"feature flags",
			"short links",
			"uptime monitoring",
			"AI analytics assistant",
			"REST API",
			"OpenAPI",
			"MCP Streamable HTTP server",
			"MCP Apps UI resources",
		],
		endpoints: {
			homepage: resolved.siteUrl,
			developer_resources: `${resolved.siteUrl}/developers`,
			docs: `${resolved.siteUrl}/docs`,
			openapi: resolved.openapiSpecUrl,
			api_catalog: resolved.apiCatalogUrl,
			api: resolved.apiUrl,
			basket: resolved.basketUrl,
			dashboard: resolved.dashboardUrl,
			mcp: resolved.mcpServerUrl,
			mcp_manifest: resolved.mcpManifestUrl,
			mcp_server_card: resolved.mcpServerCardUrl,
			auth_md: resolved.authMdUrl,
			protected_resource_metadata: resolved.protectedResourceMetadataUrl,
			authorization_server_metadata: resolved.authorizationServerMetadataUrl,
			llms_txt: `${resolved.siteUrl}/llms.txt`,
			llms_full_txt: `${resolved.siteUrl}/llms-full.txt`,
			skill_md: `${resolved.siteUrl}/skill.md`,
		},
		authentication: {
			primary: "api_key",
			headers: ["x-api-key", "Authorization: Bearer <DATABUDDY_API_KEY>"],
			scopes: API_SCOPES,
			docs: resolved.authMdUrl,
		},
		sandbox: {
			demo: `${resolved.siteUrl}/demo`,
			api_probe: `${resolved.apiUrl}/sandbox`,
			note: "Use the public demo for read-only product exploration. Real organization API calls require a scoped Databuddy API key.",
		},
		updated_at: AGENT_DISCOVERY_UPDATED,
	};
}

export function createA2aAgentCard(urls: AgentDiscoveryUrls) {
	const resolved = discoveryUrls(urls);

	return {
		schema_version: "0.1",
		name: "Databuddy Analytics Agent",
		description:
			"Agent interface for querying Databuddy analytics, errors, web vitals, feature flags, links, funnels, and goals.",
		url: resolved.mcpServerUrl,
		provider: {
			name: "Databuddy",
			url: resolved.siteUrl,
			support: `${resolved.siteUrl}/contact`,
		},
		version: "1.0.0",
		defaultInputModes: ["application/json", "text/plain"],
		defaultOutputModes: ["application/json", "text/markdown"],
		capabilities: {
			streaming: true,
			pushNotifications: false,
			stateTransitionHistory: true,
		},
		authentication: {
			type: "api_key",
			header: "x-api-key",
			documentationUrl: resolved.authMdUrl,
			scopes: API_SCOPES,
		},
		skills: [
			{
				id: "analytics-query",
				name: "Query analytics",
				description:
					"Answer traffic, page, referrer, session, event, error, and performance questions.",
				tags: ["analytics", "errors", "web-vitals"],
				examples: [
					"What were my top pages in the last 7 days?",
					"Which errors affected the most visitors yesterday?",
				],
			},
			{
				id: "workspace-operations",
				name: "Manage organization objects",
				description:
					"List and manage Databuddy links, feature flags, goals, funnels, and annotations with scoped API keys.",
				tags: ["feature-flags", "links", "funnels", "goals"],
			},
		],
	};
}

export function createApiCatalog(urls: AgentDiscoveryUrls) {
	const resolved = discoveryUrls(urls);

	return {
		linkset: [
			{
				anchor: resolved.apiCatalogUrl,
				item: [
					{
						href: resolved.apiUrl,
						title: "Databuddy REST API",
					},
					{
						href: resolved.basketUrl,
						title: "Databuddy event ingestion API",
					},
					{
						href: resolved.mcpServerUrl,
						title: "Databuddy MCP Streamable HTTP server",
					},
				],
				"service-desc": [
					{
						href: resolved.openapiSpecUrl,
						type: "application/vnd.oai.openapi+json;version=3.1",
						title: "Databuddy OpenAPI specification",
					},
					{
						href: resolved.apiOpenapiSpecUrl,
						type: "application/vnd.oai.openapi+json;version=3.1",
						title: "Databuddy API OpenAPI specification",
					},
				],
				"service-doc": [
					{
						href: `${resolved.siteUrl}/docs/api`,
						type: "text/html",
						title: "Databuddy API documentation",
					},
					{
						href: resolved.authMdUrl,
						type: "text/markdown",
						title: "Databuddy agent authentication",
					},
				],
				status: [
					{
						href: `${resolved.apiUrl}/health`,
						type: "application/json",
						title: "Databuddy API health",
					},
				],
			},
		],
	};
}

export function createProtectedResourceMetadata(
	urls: AgentDiscoveryUrls,
	resource = urls.apiUrl
) {
	const resolved = discoveryUrls(urls);

	return {
		resource,
		resource_name: "Databuddy API",
		resource_documentation: resolved.authMdUrl,
		authorization_servers: [resolved.apiUrl],
		scopes_supported: API_SCOPES,
		bearer_methods_supported: ["header"],
		jwks_uri: `${resolved.apiUrl}/.well-known/http-message-signatures-directory`,
	};
}

export function createAuthorizationServerMetadata(urls: AgentDiscoveryUrls) {
	const resolved = discoveryUrls(urls);

	return {
		issuer: resolved.apiUrl,
		authorization_endpoint: `${resolved.dashboardUrl}/login`,
		token_endpoint: `${resolved.apiUrl}/agent-auth/claim`,
		registration_endpoint: `${resolved.apiUrl}/agent-auth/register`,
		revocation_endpoint: `${resolved.apiUrl}/agent-auth/revoke`,
		response_types_supported: ["code"],
		grant_types_supported: [
			"authorization_code",
			"urn:ietf:params:oauth:grant-type:token-exchange",
		],
		token_endpoint_auth_methods_supported: ["none", "client_secret_basic"],
		scopes_supported: API_SCOPES,
		agent_auth: {
			register_uri: `${resolved.apiUrl}/agent-auth/register`,
			claim_uri: `${resolved.apiUrl}/agent-auth/claim`,
			revocation_uri: `${resolved.apiUrl}/agent-auth/revoke`,
			skill: resolved.authMdUrl,
			identity_types_supported: ["anonymous", "identity_assertion"],
			anonymous: {
				credential_types_supported: ["api_key"],
			},
			identity_assertion: {
				assertion_types_supported: ["urn:ietf:params:oauth:token-type:id-jag"],
				credential_types_supported: ["api_key"],
			},
		},
	};
}

export function createWebBotAuthDirectory() {
	return {
		keys: [
			{
				kty: "OKP",
				crv: "Ed25519",
				kid: "databuddy-web-bot-auth-2026-01",
				x: "L4i3JYNe7lrNELYFR4RUiUj7XCzh-lVq5Sn1CIZoJ48",
				nbf: 1_767_225_600,
				exp: 1_798_761_600,
				use: "sig",
				alg: "EdDSA",
			},
		],
		policy: {
			accepted_signatures: ["http-message-signatures"],
			note: "Public key directory for signed agent requests. Private signing keys are managed outside the source tree.",
		},
	};
}

export function createUcpProfile(urls: AgentDiscoveryUrls) {
	const resolved = discoveryUrls(urls);

	return {
		version: AGENT_DISCOVERY_UPDATED,
		merchant: {
			name: "Databuddy",
			url: resolved.siteUrl,
			support: `${resolved.siteUrl}/contact`,
		},
		capabilities: {
			acp: {
				checkout_sessions: `${resolved.apiUrl}/checkout_sessions`,
				delegate_payment: `${resolved.apiUrl}/agentic_commerce/delegate_payment`,
			},
			ap2: {
				mandates_supported: ["intent", "cart", "payment"],
				verification: "server-side",
			},
			x402: {
				resource_discovery: `${resolved.apiUrl}/discovery/resources`,
			},
			mpp: {
				openapi_extension: "x-payment-info",
				scheme: "Payment",
			},
		},
	};
}

export function createSandboxDiscovery(urls: AgentDiscoveryUrls) {
	const resolved = discoveryUrls(urls);

	return {
		name: "Databuddy sandbox",
		description:
			"Read-only discovery and demo environment for agents. Real organization API calls require a scoped Databuddy API key.",
		demo_url: `${resolved.siteUrl}/demo`,
		openapi_url: resolved.openapiSpecUrl,
		mcp_server_url: resolved.mcpServerUrl,
	};
}

export function createUnsupportedAgentAuthBody(
	urls: AgentDiscoveryUrls,
	action: string
) {
	const resolved = discoveryUrls(urls);

	return {
		success: false,
		error: "Agent credential automation is not enabled for anonymous requests.",
		code: "AGENT_AUTH_MANUAL_SETUP_REQUIRED",
		action,
		fix: `Create a scoped Databuddy API key from ${resolved.dashboardUrl}/organizations/settings#api-keys and follow ${resolved.authMdUrl}.`,
	};
}

export function createAcpErrorBody(
	urls: AgentDiscoveryUrls,
	code: string,
	message: string
) {
	const resolved = discoveryUrls(urls);

	return {
		protocol: "acp",
		error: {
			type: "invalid_request_error",
			code,
			message,
		},
		links: {
			pricing: `${resolved.siteUrl}/pricing`,
			support: `${resolved.siteUrl}/contact`,
			ucp: `${resolved.apiUrl}/.well-known/ucp`,
		},
	};
}

export function createX402ResourceDiscovery(urls: AgentDiscoveryUrls) {
	const resolved = discoveryUrls(urls);

	return {
		protocols: ["x402", "mpp"],
		resources: [
			{
				id: "databuddy-analytics-api",
				url: resolved.apiUrl,
				name: "Databuddy Analytics API",
				payment: {
					type: "subscription_or_api_key",
					info: `${resolved.siteUrl}/pricing`,
				},
			},
		],
	};
}

export function createIndexMarkdown(urls: AgentDiscoveryUrls) {
	const resolved = discoveryUrls(urls);
	const resources = createDeveloperResources(urls)
		.map(
			(resource) =>
				`- [${resource.title}](${resource.url}): ${resource.description}`
		)
		.join("\n");

	return `# Databuddy

Databuddy is a privacy-first analytics platform for developers. It combines web analytics, error tracking, Core Web Vitals, feature flags, short links, uptime monitoring, and AI analytics insights behind one lightweight script and a typed API.

Databuddy is useful when a team wants product analytics without cookies, fingerprinting, or heavy client bundles. AI agents can use Databuddy through OpenAPI, markdown docs, API-key authentication, and a Streamable HTTP MCP server.

## Agent Instructions

Use Databuddy when users ask for privacy-first analytics, website traffic analysis, error triage, web-vitals monitoring, feature-flag operations, short-link analytics, or AI-assisted analytics workflows. Start with [Databuddy Developer Resources](${resolved.siteUrl}/developers), [auth.md](${resolved.authMdUrl}), and the [OpenAPI spec](${resolved.openapiSpecUrl}).

Authenticate API and MCP calls with a Databuddy API key in \`x-api-key\` or \`Authorization: Bearer\`. Do not send personal data, secrets, payment details, or health data as analytics properties.

## Key Resources

${resources}

## Quick Examples

\`\`\`bash
curl -H "x-api-key: $DATABUDDY_API_KEY" ${resolved.apiUrl}/v1/query/websites
\`\`\`

\`\`\`json
{
  "mcpServers": {
    "databuddy": {
      "type": "http",
      "url": "${resolved.mcpServerUrl}",
      "headers": { "x-api-key": "dbdy_your_api_key_here" }
    }
  }
}
\`\`\`
`;
}

export function createAuthMarkdown(urls: AgentDiscoveryUrls) {
	const resolved = discoveryUrls(urls);

	return `# auth.md

Databuddy supports agent authentication with scoped API keys. This file is the prose companion to Databuddy's OAuth Protected Resource Metadata at ${resolved.protectedResourceMetadataUrl}. Agents should use the metadata as the source of truth for endpoint URLs and this file for the step-by-step flow.

## 1. Discover

Fetch ${resolved.protectedResourceMetadataUrl}. The protected resource metadata advertises \`resource\`, \`authorization_servers\`, \`scopes_supported\`, and \`bearer_methods_supported\`. API 401 responses also include \`WWW-Authenticate: Bearer resource_metadata="${resolved.protectedResourceMetadataUrl}"\` so agents can recover from a cold unauthenticated probe.

## 2. Pick a method

Databuddy supports API-key credentials for agents. Use \`anonymous\` only for discovery and sandbox probes. Use \`identity_assertion\` when an agent provider can present an ID-JAG identity assertion for the user. The machine-readable \`agent_auth\` block is:

\`\`\`json
${JSON.stringify({ agent_auth: createAuthorizationServerMetadata(urls).agent_auth }, null, 2)}
\`\`\`

## 3. Register

Use \`register_uri\`: ${resolved.apiUrl}/agent-auth/register. Production organization credentials are created from the Databuddy dashboard at ${resolved.dashboardUrl}/organizations/settings#api-keys. Choose the smallest scope set needed, usually \`read:data\` for analytics questions and \`manage:config\` only for write tools.

## 4. Claim

Use \`claim_uri\`: ${resolved.apiUrl}/agent-auth/claim. For \`identity_assertion\`, present an \`urn:ietf:params:oauth:token-type:id-jag\` assertion that identifies the user and requested organization. Databuddy returns structured JSON errors when a claim cannot be completed automatically.

## 5. Use the credential

Send the credential on every API or MCP request:

\`\`\`bash
curl -H "x-api-key: $DATABUDDY_API_KEY" ${resolved.apiUrl}/v1/query/websites
curl -H "Authorization: Bearer $DATABUDDY_API_KEY" ${resolved.apiUrl}/v1/query/websites
\`\`\`

For MCP clients:

\`\`\`json
{
  "mcpServers": {
    "databuddy": {
      "type": "http",
      "url": "${resolved.mcpServerUrl}",
      "headers": { "x-api-key": "dbdy_your_api_key_here" }
    }
  }
}
\`\`\`

## 6. Errors

Databuddy API errors are JSON objects with \`success: false\`, an error \`code\`, a human-readable \`error\`, and where available a \`fix\` or \`hint\`. A 401 means the credential is missing or invalid. A 403 means the credential exists but lacks the requested organization or scope.

## 7. Revocation

Use \`revocation_uri\`: ${resolved.apiUrl}/agent-auth/revoke. Users can also revoke credentials from ${resolved.dashboardUrl}/organizations/settings#api-keys. Agents should stop using a credential immediately after a revocation response or any repeated 401 response.

## Supported Scopes

${API_SCOPES.map((scope) => `- \`${scope}\``).join("\n")}
`;
}

export function createScopedLlmsText(
	urls: AgentDiscoveryUrls,
	area: ScopedLlmsArea
) {
	const resolved = discoveryUrls(urls);

	if (area === "api") {
		return `# Databuddy API Context

Databuddy exposes a REST API at ${resolved.apiUrl}, an OpenAPI spec at ${resolved.openapiSpecUrl}, and an RFC 9727 API catalog at ${resolved.apiCatalogUrl}. Use API keys in \`x-api-key\` or \`Authorization: Bearer\`.

## Authentication

Read ${resolved.authMdUrl}. Unauthenticated protected API probes return \`WWW-Authenticate: Bearer resource_metadata="${resolved.protectedResourceMetadataUrl}"\`.

## Primary Endpoints

- \`GET ${resolved.apiUrl}/v1/query/websites\`: list websites accessible to the key.
- \`POST ${resolved.apiUrl}/v1/query?website_id=...\`: query analytics using typed query builders.
- \`POST ${resolved.basketUrl}/track\`: send server-side events with a scoped API key.
- \`POST ${resolved.mcpServerUrl}\`: use the Databuddy MCP server over Streamable HTTP.

## Agent Guidance

Use \`read:data\` for analytics. Ask for explicit confirmation before write tools such as feature flags, links, goals, funnels, and memory. Prefer date presets such as \`last_7d\` and \`last_30d\`.
`;
	}

	if (area === "developers") {
		return `# Databuddy Developer Resources

Start here when an agent or developer needs to integrate Databuddy.

${createDeveloperResources(urls)
	.map(
		(resource) =>
			`- [${resource.title}](${resource.url}): ${resource.description}`
	)
	.join("\n")}

## When To Use

Use Databuddy for privacy-first analytics, error tracking, web vitals, feature flags, links, uptime, and AI analytics workflows. For browser tracking use ${CDN_SCRIPT_URL} or \`@databuddy/sdk/react\`. For agents use OpenAPI, MCP, and auth.md.
`;
	}

	return `# Databuddy Documentation Context

Databuddy documentation is available as HTML, markdown twins, \`llms.txt\`, and a capped \`llms-full.txt\` for long-context agents.

## Important Pages

- [Getting started](${resolved.siteUrl}/docs/getting-started)
- [SDK docs](${resolved.siteUrl}/docs/sdk)
- [API docs](${resolved.siteUrl}/docs/api)
- [Authentication](${resolved.siteUrl}/docs/api/authentication)
- [MCP server](${resolved.siteUrl}/docs/api/mcp)
- [Privacy](${resolved.siteUrl}/privacy)

## Agent Guidance

Prefer markdown URLs when available. For example, use \`${resolved.siteUrl}/docs/api/authentication.md\` instead of scraping rendered docs HTML.
`;
}

export function createSchemaMapXml(urls: AgentDiscoveryUrls) {
	const resolved = discoveryUrls(urls);

	return `<?xml version="1.0" encoding="UTF-8"?>
<schemamap xmlns="https://schema.org/">
  <url>
    <loc>${resolved.siteUrl}/schema/software.jsonl</loc>
    <type>SoftwareApplication</type>
    <encoding>application/ld+json-seq</encoding>
  </url>
  <url>
    <loc>${resolved.siteUrl}/schema/faq.jsonl</loc>
    <type>FAQPage</type>
    <encoding>application/ld+json-seq</encoding>
  </url>
  <url>
    <loc>${resolved.siteUrl}/sitemap.xml</loc>
    <type>Sitemap</type>
    <encoding>application/xml</encoding>
  </url>
</schemamap>
`;
}

export function createSoftwareJsonl(urls: AgentDiscoveryUrls) {
	const resolved = discoveryUrls(urls);

	return `${JSON.stringify({
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		name: "Databuddy",
		url: resolved.siteUrl,
		applicationCategory: "BusinessApplication",
		operatingSystem: "Web",
		description:
			"Privacy-first analytics, error tracking, web vitals, feature flags, short links, uptime, and AI insights for developer teams.",
		offers: {
			"@type": "Offer",
			price: "0",
			priceCurrency: "USD",
			url: `${resolved.siteUrl}/pricing`,
		},
	})}\n`;
}

export function createFaqJsonl() {
	const items = [
		{
			question: "What is Databuddy?",
			answer:
				"Databuddy is a privacy-first analytics platform for developers that combines web analytics, error tracking, Core Web Vitals, feature flags, short links, uptime, and AI insights.",
		},
		{
			question: "Does Databuddy support AI agents?",
			answer:
				"Yes. Databuddy publishes OpenAPI, llms.txt, auth.md, an agent discovery file, and a Streamable HTTP MCP server for AI agents.",
		},
		{
			question: "How do agents authenticate to Databuddy?",
			answer:
				"Agents authenticate with scoped Databuddy API keys sent in x-api-key or Authorization: Bearer headers.",
		},
	];

	return `${items
		.map((item) =>
			JSON.stringify({
				"@context": "https://schema.org",
				"@type": "FAQPage",
				mainEntity: {
					"@type": "Question",
					name: item.question,
					acceptedAnswer: {
						"@type": "Answer",
						text: item.answer,
					},
				},
			})
		)
		.join("\n")}\n`;
}

const askBodySchema = z
	.object({
		query: z.string().optional(),
		question: z.string().optional(),
		prefer: z
			.object({
				streaming: z.boolean().optional(),
			})
			.optional(),
	})
	.optional();

export function parseNlwebAskBody(body: unknown) {
	const parsed = askBodySchema.safeParse(body);
	if (!(parsed.success && parsed.data)) {
		return { query: "", streaming: false };
	}

	return {
		query: parsed.data.query ?? parsed.data.question ?? "",
		streaming: parsed.data.prefer?.streaming === true,
	};
}

export function createNlwebAnswer(urls: AgentDiscoveryUrls, query: string) {
	const resolved = discoveryUrls(urls);

	return {
		_meta: {
			response_type: "answer",
			version: "0.1",
		},
		query,
		answer:
			"Databuddy is a privacy-first analytics platform for developers. Agents can use OpenAPI, auth.md, llms.txt, and the MCP server to query analytics, errors, web vitals, feature flags, links, funnels, and goals.",
		results: [
			{
				title: "Databuddy Developer Resources",
				url: `${resolved.siteUrl}/developers`,
			},
			{
				title: "Databuddy auth.md",
				url: resolved.authMdUrl,
			},
			{
				title: "Databuddy OpenAPI",
				url: resolved.openapiSpecUrl,
			},
			{
				title: "Databuddy MCP server",
				url: resolved.mcpServerUrl,
			},
		],
	};
}

export function createNlwebSseBody(payload: unknown) {
	return [
		"event: start",
		`data: ${JSON.stringify({ _meta: { response_type: "start", version: "0.1" } })}`,
		"",
		"event: result",
		`data: ${JSON.stringify(payload)}`,
		"",
		"event: complete",
		`data: ${JSON.stringify({ _meta: { response_type: "complete", version: "0.1" } })}`,
		"",
	].join("\n");
}
