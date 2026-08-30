import { describe, expect, it } from "bun:test";
import { API_SCOPES } from "./api-scopes";
import {
	type AgentDiscoveryUrls,
	createAgentJson,
	createFeedbackMarkdown,
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
