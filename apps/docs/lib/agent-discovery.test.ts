import { describe, expect, it } from "bun:test";
import {
	createAgentJson,
	createApiCatalog,
	createAuthorizationServerMetadata,
	createMcpManifest,
	createMcpServerCard,
	createProtectedResourceMetadata,
	developerResources,
} from "./agent-discovery";

describe("agent discovery resources", () => {
	it("lists Databuddy OpenAPI and MCP resources by name", () => {
		const resourceText = developerResources
			.map((resource) => `${resource.title} ${resource.url}`)
			.join("\n");

		expect(resourceText).toContain("Databuddy OpenAPI Spec");
		expect(resourceText).toContain("https://www.databuddy.cc/openapi.json");
		expect(resourceText).toContain("Databuddy MCP Server");
		expect(resourceText).toContain("https://www.databuddy.cc/.well-known/mcp.json");
		expect(resourceText).toContain("Databuddy API Catalog");
		expect(resourceText).toContain(
			"https://www.databuddy.cc/.well-known/api-catalog"
		);
	});

	it("points MCP discovery at the Streamable HTTP server", () => {
		const manifest = createMcpManifest();

		expect(manifest.name).toBe("Databuddy");
		expect(manifest.server.url).toBe("https://api.databuddy.cc/v1/mcp/");
		expect(manifest.server.transport).toBe("streamable-http");
		expect(manifest.authentication.name).toBe("x-api-key");
		expect(manifest.openapi_url).toBe("https://www.databuddy.cc/openapi.json");
	});

	it("publishes agent, MCP card, API catalog, and auth metadata", () => {
		const agent = createAgentJson();
		const serverCard = createMcpServerCard();
		const catalog = createApiCatalog();
		const prm = createProtectedResourceMetadata();
		const asMetadata = createAuthorizationServerMetadata();

		expect(agent.endpoints.auth_md).toBe("https://www.databuddy.cc/auth.md");
		expect(serverCard.serverUrl).toBe("https://api.databuddy.cc/v1/mcp/");
		expect(catalog.linkset[0]["service-desc"][0].href).toBe(
			"https://www.databuddy.cc/openapi.json"
		);
		expect(prm.authorization_servers).toContain("https://api.databuddy.cc");
		expect(asMetadata.agent_auth.identity_types_supported).toContain(
			"identity_assertion"
		);
	});
});
