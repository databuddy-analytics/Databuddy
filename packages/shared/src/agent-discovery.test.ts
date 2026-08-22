import { describe, expect, it } from "bun:test";
import { API_SCOPES } from "./api-scopes";
import {
	type AgentDiscoveryUrls,
	createAgentJson,
	createMcpManifest,
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
	it("describes API-key authentication without unimplemented OAuth endpoints", () => {
		const agent = createAgentJson(urls);

		expect(API_SCOPES).toContain("track:events");
		expect(agent.authentication.scopes).toBe(API_SCOPES);
		expect(agent.endpoints).not.toHaveProperty("protected_resource_metadata");
		expect(agent.endpoints).not.toHaveProperty("authorization_server_metadata");
	});

	it("advertises only the real MCP guide resource", () => {
		const card = createMcpServerCard(urls);

		expect(card.resources).toEqual([
			{
				uri: "databuddy://guide",
				mimeType: "text/markdown",
				description: "MCP workflow guide and query conventions.",
			},
		]);
	});

	it("advertises one canonical Streamable HTTP endpoint", () => {
		const expected = [
			{ type: "streamable-http", url: "https://api.databuddy.cc/v1/mcp/" },
		];

		expect(createMcpManifest(urls).transports).toEqual(expected);
		expect(createMcpServerCard(urls).transports).toEqual(expected);
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
