import { createInternalPrincipal } from "@databuddy/rpc";
import type { ApiScope } from "@databuddy/shared/api-scopes";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AnySchema } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
	createMcpUnauthorizedResponse,
	handleDatabuddyMcpRequest,
} from "../../mcp/http";
import { defineMcpTool, type McpRequestContext } from "./define-tool";
import { resolveMcpDateRange } from "./tool-contracts";
import { createMcpTools } from "./tools";

const ctx: McpRequestContext = {
	apiKey: null,
	requestHeaders: new Headers(),
	userId: null,
};

const tools = createMcpTools(ctx);

const TOOL_NAME_RE = /^[a-z][a-z0-9_]*$/;
const MAX_DESCRIPTION_LEN = 240;

describe("MCP transport", () => {
	test("keeps API-key authentication separate from unimplemented OAuth", async () => {
		const response = createMcpUnauthorizedResponse();

		expect(response.status).toBe(401);
		expect(response.headers.get("www-authenticate")).not.toContain(
			"resource_metadata"
		);
		expect(await response.json()).toMatchObject({
			id: null,
			jsonrpc: "2.0",
		});
	});
});

async function listToolsForPrincipal(
	principal: ReturnType<typeof createInternalPrincipal>
) {
	const response = await handleDatabuddyMcpRequest({
		apiKey: principal.apiKey,
		organizationId: "org-1",
		request: new Request("https://api.databuddy.test/v1/mcp", {
			body: JSON.stringify({
				id: 1,
				jsonrpc: "2.0",
				method: "tools/list",
				params: {},
			}),
			headers: {
				accept: "application/json, text/event-stream",
				"content-type": "application/json",
			},
			method: "POST",
		}),
		requestHeaders: new Headers(),
		userId: null,
	});
	const body = (await response.json()) as {
		result?: {
			tools?: Array<{
				annotations?: Record<string, boolean>;
				name: string;
			}>;
		};
	};
	return {
		response,
		tools: body.result?.tools ?? [],
	};
}

async function listToolsForScopes(scopes: ApiScope[]) {
	return listToolsForPrincipal(
		createInternalPrincipal({ organizationId: "org-1", scopes })
	);
}

describe("MCP tool invariants", () => {
	test("dynamic analytics output schemas work through the installed MCP SDK", async () => {
		const dynamicTools = tools.filter((tool) =>
			["get_funnel_analytics", "get_goal_analytics"].includes(tool.name)
		);
		expect(dynamicTools).toHaveLength(2);

		const server = new McpServer({ name: "test", version: "1.0.0" });
		for (const tool of dynamicTools) {
			server.registerTool(
				tool.name,
				{
					inputSchema: z.object({}),
					outputSchema: tool.outputSchema as AnySchema,
				},
				() => ({
					content: [{ type: "text", text: '{"value":"ok"}' }],
					structuredContent: { value: "ok" },
				})
			);
		}

		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		const client = new Client({ name: "test", version: "1.0.0" });
		await server.connect(serverTransport);
		await client.connect(clientTransport);

		try {
			const listed = await client.listTools();
			for (const tool of dynamicTools) {
				expect(
					listed.tools.find((listedTool) => listedTool.name === tool.name)
						?.outputSchema
				).toBeDefined();
				const result = await client.callTool({
					arguments: {},
					name: tool.name,
				});
				expect(result).not.toMatchObject({ isError: true });
				expect(result).toMatchObject({
					structuredContent: { value: "ok" },
				});
			}
		} finally {
			await server.close();
		}
	});

	test("preserves literal string tool arguments", async () => {
		let received: { enabled: boolean; literal: string } | undefined;
		const tool = defineMcpTool(
			{
				name: "literal_string_input",
				description: "Test that literal string inputs reach the handler unchanged.",
				inputSchema: z.object({
					enabled: z.boolean(),
					literal: z.string(),
				}),
			},
			(input) => {
				received = input;
				return { ok: true };
			}
		).build(ctx);

		for (const literal of ["true", "false", '{"key":"value"}', "[1,2]"]) {
			received = undefined;
			const result = await tool.handler({ enabled: true, literal });
			expect(result).not.toMatchObject({ isError: true });
			expect(received).toEqual({ enabled: true, literal });
		}
	});

	test("does not expose internal exception text", async () => {
		const sentinel = "MCP_INTERNAL_SENTINEL_DO_NOT_EXPOSE";
		const tool = defineMcpTool(
			{
				name: "internal_error_test",
				description: "Test that internal exception text is not returned to callers.",
				inputSchema: z.object({}),
			},
			() => {
				throw new Error(sentinel);
			}
		).build(ctx);

		const result = await tool.handler({});
		expect(result).toMatchObject({ isError: true });
		expect(JSON.stringify(result)).not.toContain(sentinel);
	});

	test("create_link matches the HTTP(S) and deep-link app contract", () => {
		const createLink = tools.find((tool) => tool.name === "create_link");
		if (!createLink) {
			throw new Error("create_link tool is not registered");
		}

		expect(
			createLink.inputSchema.safeParse({
				confirmed: false,
				name: "Unsafe link",
				targetUrl: "javascript:alert(1)",
				websiteId: "website-1",
			}).success
		).toBe(false);
		expect(
			createLink.inputSchema.safeParse({
				confirmed: false,
				deepLinkApp: "instagram",
				name: "Mismatched app",
				targetUrl: "https://example.com",
				websiteId: "website-1",
			}).success
		).toBe(false);
		expect(
			createLink.inputSchema.safeParse({
				confirmed: false,
				deepLinkApp: "unknown",
				name: "Unknown app",
				targetUrl: "https://example.com",
				websiteId: "website-1",
			}).success
		).toBe(false);
		expect(
			createLink.inputSchema.safeParse({
				confirmed: false,
				deepLinkApp: "instagram",
				name: "Instagram profile",
				targetUrl: "https://instagram.com/databuddy",
				websiteId: "website-1",
			}).success
		).toBe(true);
	});

	test("uses strict ISO dates for MCP date-only and timestamp inputs", () => {
		const getFunnelAnalytics = tools.find(
			(tool) => tool.name === "get_funnel_analytics"
		);
		const createLink = tools.find((tool) => tool.name === "create_link");
		const createAnnotation = tools.find(
			(tool) => tool.name === "create_annotation"
		);
		if (!(getFunnelAnalytics && createLink && createAnnotation)) {
			throw new Error("Expected date-bearing MCP tools to be registered");
		}

		expect(
			getFunnelAnalytics.inputSchema.safeParse({
				funnelId: "funnel-1",
				from: "2026-02-30",
				to: "2026-03-02",
				websiteId: "website-1",
			}).success
		).toBe(false);
		expect(
			createLink.inputSchema.safeParse({
				confirmed: false,
				expiresAt: "2026-02-30T12:00:00Z",
				name: "Broken expiry",
				targetUrl: "https://example.com",
				websiteId: "website-1",
			}).success
		).toBe(false);
		expect(
			createAnnotation.inputSchema.safeParse({
				annotationType: "point",
				confirmed: false,
				text: "Release",
				websiteId: "website-1",
				xValue: "2026-02-30T12:00:00Z",
			}).success
		).toBe(false);
		expect(
			createAnnotation.inputSchema.safeParse({
				annotationType: "range",
				confirmed: false,
				text: "Release",
				websiteId: "website-1",
				xEndValue: "2026-03-02",
				xValue: "2026-03-01",
			}).success
		).toBe(true);
		for (const xEndValue of [undefined, "2026-02-28"]) {
			expect(
				createAnnotation.inputSchema.safeParse({
					annotationType: "range",
					confirmed: false,
					text: "Release",
					websiteId: "website-1",
					xEndValue,
					xValue: "2026-03-01",
				}).success
			).toBe(false);
		}
	});

	test("resolves MCP date presets instead of ignoring them", () => {
		const { from, to } = resolveMcpDateRange({ preset: "last_30d" });
		expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(
			(Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
				86_400_000 +
				1
		).toBe(30);
	});

	test("tool names are unique snake_case", () => {
		const names = tools.map((tool) => tool.name);
		expect(new Set(names).size).toBe(names.length);
		for (const name of names) {
			expect(name).toMatch(TOOL_NAME_RE);
		}
	});

	test("tools have bounded descriptions, metadata, and handlers", () => {
		for (const tool of tools) {
			expect(tool.description.length).toBeGreaterThan(0);
			expect(tool.description.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LEN);
			expect(tool.metadata.access.kind).toMatch(/^(read|write)$/);
			expect(typeof tool.handler).toBe("function");
		}
	});

	test("write tools declare scopes", () => {
		const writers = tools.filter(
			(tool) => tool.metadata.access.kind === "write"
		);
		expect(writers.length).toBeGreaterThan(0);
		for (const tool of writers) {
			expect(tool.metadata.access.scopes?.length ?? 0).toBeGreaterThan(0);
		}
	});

	test("schemas render as JSON-RPC objects", () => {
		for (const tool of tools) {
			const input = z.toJSONSchema(tool.inputSchema, { io: "input" });
			expect(input.type).toBe("object");
			expect(() => JSON.parse(JSON.stringify(input))).not.toThrow();
			if (tool.outputSchema) {
				const output = z.toJSONSchema(tool.outputSchema, { io: "output" });
				expect(output.type).toBe("object");
				expect(() => JSON.parse(JSON.stringify(output))).not.toThrow();
			}
		}
	});

});

describe("investigation tools", () => {
	test("only advertises tools whose API-key scopes can satisfy their calls", async () => {
		const zeroScope = await listToolsForScopes([]);
		const zeroScopeNames = new Set(zeroScope.tools.map((tool) => tool.name));
		expect(zeroScopeNames.has("capabilities")).toBe(false);
		expect(zeroScopeNames.has("get_schema")).toBe(false);

		const readData = await listToolsForScopes(["read:data"]);
		const readDataNames = new Set(readData.tools.map((tool) => tool.name));
		expect(readData.response.status).toBe(200);
		expect(readDataNames.has("capabilities")).toBe(true);
		expect(readDataNames.has("get_schema")).toBe(true);
		expect(readDataNames.has("get_data")).toBe(true);
		expect(readDataNames.has("get_funnel_analytics_by_referrer")).toBe(true);
		expect(readDataNames.has("list_links")).toBe(false);
		expect(readDataNames.has("create_link")).toBe(false);
		expect(readDataNames.has("create_flag")).toBe(false);

		const flagManager = await listToolsForScopes([
			"read:data",
			"manage:flags",
		]);
		const flagManagerNames = new Set(
			flagManager.tools.map((tool) => tool.name)
		);
		for (const name of [
			"create_flag",
			"update_flag",
			"add_users_to_flag",
		]) {
			expect(flagManagerNames.has(name)).toBe(true);
		}

		const workspaceManager = await listToolsForScopes([
			"read:data",
			"manage:websites",
		]);
		const workspaceManagerNames = new Set(
			workspaceManager.tools.map((tool) => tool.name)
		);
		for (const name of [
			"update_goal",
			"delete_goal",
			"update_annotation",
			"delete_annotation",
		]) {
			expect(workspaceManagerNames.has(name)).toBe(true);
		}

		const workspaceWriterWithoutRead = await listToolsForScopes([
			"manage:websites",
		]);
		const workspaceWriterWithoutReadNames = new Set(
			workspaceWriterWithoutRead.tools.map((tool) => tool.name)
		);
		for (const name of [
			"update_goal",
			"delete_goal",
			"update_annotation",
			"delete_annotation",
		]) {
			expect(workspaceWriterWithoutReadNames.has(name)).toBe(false);
		}

		const linkReader = await listToolsForScopes([
			"read:data",
			"read:links",
		]);
		expect(
			new Set(linkReader.tools.map((tool) => tool.name)).has("list_links")
		).toBe(true);
		expect(
			new Set(linkReader.tools.map((tool) => tool.name)).has("update_link")
		).toBe(false);

		const linkWriterWithoutRead = await listToolsForScopes([
			"read:data",
			"write:links",
		]);
		const linkWriterWithoutReadNames = new Set(
			linkWriterWithoutRead.tools.map((tool) => tool.name)
		);
		for (const name of ["update_link", "delete_link"]) {
			expect(linkWriterWithoutReadNames.has(name)).toBe(false);
		}

		const linkWriter = await listToolsForScopes([
			"read:data",
			"read:links",
			"write:links",
		]);
		const linkWriterNames = new Set(
			linkWriter.tools.map((tool) => tool.name)
		);
		for (const name of ["create_link", "update_link", "delete_link"]) {
			expect(linkWriterNames.has(name)).toBe(true);
		}
	});

	test("does not advertise org-wide link tools from website-only scopes", async () => {
		const scopedKey = await listToolsForPrincipal(
			createInternalPrincipal({
				metadata: {
					resources: {
						"website:site-1": [
							"read:data",
							"read:links",
							"write:links",
						],
					},
				},
				organizationId: "org-1",
				scopes: [],
			})
		);
		const names = new Set(scopedKey.tools.map((tool) => tool.name));

		for (const name of [
			"list_link_folders",
			"list_links",
			"search_links",
			"create_link",
			"update_link",
			"delete_link",
		]) {
			expect(names.has(name)).toBe(false);
		}
	});

	test("combines global link scopes with website-scoped analytics", async () => {
		const scopedKey = await listToolsForPrincipal(
			createInternalPrincipal({
				metadata: {
					resources: { "website:site-1": ["read:data"] },
				},
				organizationId: "org-1",
				scopes: ["read:links", "write:links"],
			})
		);
		const names = new Set(scopedKey.tools.map((tool) => tool.name));

		expect(names.has("list_links")).toBe(true);
		expect(names.has("create_link")).toBe(true);
	});

	test("uses conservative annotations for mutations", async () => {
		const { tools: listed } = await listToolsForScopes([
			"read:data",
			"read:links",
			"write:links",
			"manage:flags",
			"manage:websites",
		]);
		const byName = new Map(listed.map((tool) => [tool.name, tool]));

		expect(byName.get("get_data")?.annotations).toMatchObject({
			destructiveHint: false,
			idempotentHint: true,
			readOnlyHint: true,
		});
		for (const name of [
			"create_link",
			"update_link",
			"delete_link",
			"update_goal",
			"delete_goal",
			"update_flag",
			"add_users_to_flag",
		]) {
			expect(byName.get(name)?.annotations).toMatchObject({
				destructiveHint: true,
				idempotentHint: false,
				readOnlyHint: false,
			});
		}
	});

	test("rejects unsupported standalone SSE methods", async () => {
		const principal = createInternalPrincipal({
			organizationId: "org-1",
			scopes: ["read:data"],
		});
		const response = await handleDatabuddyMcpRequest({
			apiKey: principal.apiKey,
			organizationId: "org-1",
			request: new Request("https://api.databuddy.test/v1/mcp", {
				headers: { accept: "text/event-stream" },
				method: "GET",
			}),
			requestHeaders: new Headers(),
			userId: null,
		});

		expect(response.status).toBe(405);
		expect(response.headers.get("allow")).toBe("POST");
	});

	test("publishes the investigation lifecycle to a website-scoped key", async () => {
		const principal = createInternalPrincipal({
			metadata: {
				resources: {
					"website:site-1": ["read:data", "manage:websites"],
				},
			},
			organizationId: "org-1",
			scopes: [],
		});
		const response = await handleDatabuddyMcpRequest({
			apiKey: principal.apiKey,
			organizationId: "org-1",
			request: new Request("https://api.databuddy.test/v1/mcp", {
				body: JSON.stringify({
					id: 1,
					jsonrpc: "2.0",
					method: "tools/list",
					params: {},
				}),
				headers: {
					accept: "application/json, text/event-stream",
					"content-type": "application/json",
				},
				method: "POST",
			}),
			requestHeaders: new Headers(),
			userId: null,
		});
		const body = (await response.json()) as {
			result?: { tools?: Array<{ name: string }> };
		};
		const names = new Set(body.result?.tools?.map((tool) => tool.name));

		expect(response.status).toBe(200);
		for (const name of [
			"list_insights",
			"list_investigations",
			"get_investigation",
			"reply_to_investigation",
		]) {
			expect(names.has(name)).toBe(true);
		}
	});

});
