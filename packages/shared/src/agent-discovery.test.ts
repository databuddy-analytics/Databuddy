import { describe, expect, it } from "bun:test";
import { API_SCOPES } from "./api-scopes";
import {
	type AgentDiscoveryUrls,
	createAuthorizationServerMetadata,
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
	it("uses the shared API scope registry in auth metadata", () => {
		const metadata = createAuthorizationServerMetadata(urls);

		expect(API_SCOPES).toContain("track:events");
		expect(metadata.scopes_supported).toBe(API_SCOPES);
		expect(metadata.agent_auth.register_uri).toBe(
			"https://api.databuddy.cc/agent-auth/register"
		);
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

	it("keeps API-key MCP discovery free of unimplemented OAuth metadata", () => {
		const manifest = createMcpManifest(urls);
		const card = createMcpServerCard(urls);

		expect(
			Object.hasOwn(
				manifest.authentication,
				"protected_resource_metadata_url"
			)
		).toBe(false);
		expect(
			Object.hasOwn(card.authentication, "protectedResourceMetadataUrl")
		).toBe(false);
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
