import { describe, expect, it } from "bun:test";
import { API_SCOPES } from "./api-scopes";
import {
	type AgentDiscoveryUrls,
	createAuthorizationServerMetadata,
	createMcpServerCard,
	parseNlwebAskBody,
} from "./agent-discovery";

const urls = {
	siteUrl: "https://www.databuddy.cc",
	apiUrl: "https://api.databuddy.cc",
	basketUrl: "https://basket.databuddy.cc",
	dashboardUrl: "https://app.databuddy.cc",
	openapiSpecUrl: "https://www.databuddy.cc/openapi.json",
	apiOpenapiSpecUrl: "https://api.databuddy.cc/openapi.json",
	mcpServerUrl: "https://api.databuddy.cc/v1/mcp/",
	mcpManifestUrl: "https://www.databuddy.cc/.well-known/mcp.json",
} satisfies AgentDiscoveryUrls;

describe("agent discovery builders", () => {
	it("uses the shared API scope registry in auth metadata", () => {
		const metadata = createAuthorizationServerMetadata(urls);

		expect(API_SCOPES).toContain("track:events");
		expect(metadata.scopes_supported).toBe(API_SCOPES);
		expect(metadata.agent_auth.register_uri).toBe(
			"https://api.databuddy.cc/agent-auth/register"
		);
	});

	it("advertises MCP Apps metadata on every server-card tool", () => {
		const card = createMcpServerCard(urls);

		expect(card.tools.length).toBeGreaterThan(0);
		for (const tool of card.tools) {
			expect(tool._meta.ui.resourceUri).toBe(
				"ui://databuddy/analytics-overview"
			);
			expect(tool._meta["openai/outputTemplate"]).toBe(
				"ui://databuddy/analytics-overview"
			);
		}
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
