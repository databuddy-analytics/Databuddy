import { describe, expect, it } from "bun:test";
import { API_SCOPES } from "./api-scopes";
import {
	type AgentDiscoveryUrls,
	createA2aAgentCard,
	createAgentJson,
	createFeedbackMarkdown,
	createMcpManifest,
	parseNlwebAskBody,
} from "./agent-discovery";

const urls = {
	siteUrl: "https://www.databuddy.cc",
	apiUrl: "https://api.databuddy.cc",
	basketUrl: "https://basket.databuddy.cc",
	dashboardUrl: "https://app.databuddy.cc",
	openapiSpecUrl: "https://www.databuddy.cc/openapi.json",
	apiOpenapiSpecUrl: "https://api.databuddy.cc/openapi.json",
	mcpServerUrl: "https://api.databuddy.cc/v1/mcp",
	mcpManifestUrl: "https://www.databuddy.cc/.well-known/mcp.json",
} satisfies AgentDiscoveryUrls;

describe("agent discovery builders", () => {
	it("advertises the protected resource metadata MCP clients discover through", () => {
		const agent = createAgentJson(urls);

		expect(API_SCOPES).toContain("track:events");
		expect(agent.authentication.scopes).toBe(API_SCOPES);
		expect(agent.endpoints.protected_resource_metadata).toContain(
			"/.well-known/oauth-protected-resource"
		);
	});

	it("describes MCP sign-in the same way in agent.json, the manifest, and the A2A card", () => {
		const agentMcp = createAgentJson(urls).authentication.mcp;
		const manifestAuth = createMcpManifest(urls).authentication;
		const a2a = createA2aAgentCard(urls);

		expect(agentMcp.type).toBe(manifestAuth.type);
		expect(agentMcp.protected_resource_metadata).toBe(
			manifestAuth.protected_resource_metadata_url
		);
		expect(agentMcp.scopes).toBe(manifestAuth.scopes);
		expect(a2a.authentication.scopes).toBe(manifestAuth.scopes);
		expect(a2a.url).not.toBe(urls.mcpServerUrl);
	});

	it("advertises feedback.md with a working submit endpoint", () => {
		expect(createFeedbackMarkdown(urls)).toContain(
			"https://www.databuddy.cc/api/feedback/submit"
		);
	});

	it("parses NLWeb ask bodies without casts", () => {
		expect(
			parseNlwebAskBody({
				question: "What is Databuddy?",
				prefer: { streaming: true },
			})
		).toEqual({ query: "What is Databuddy?", streaming: true });
		expect(parseNlwebAskBody("not an object")).toEqual({
			query: "",
			streaming: false,
		});
	});
});
